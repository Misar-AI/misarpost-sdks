// Package misarpost is the Go client for MisarPost's social publishing API at
// https://api.misar.io/post: schedule and publish posts across every connected
// channel, generate and repurpose content with AI, research trends, run
// PersonaForge and read analytics.
//
// One [Client] reaches every resource as an exported field; the resource layer
// (generated.go) is generated from the API's own route tree. Calls
// authenticate with a MisarPost API key (mpk_…) sent as Authorization: Bearer,
// take a context.Context, and retry throttles, 5xx and network failures with
// exponential back-off. A plan refusal is typed as [*PlanLimitError] and never
// retried. [Paginate] walks ?page= list endpoints and [VerifyWebhookSignature]
// authenticates outbound webhook deliveries.
package misarpost

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	// Version is the SDK version sent in the User-Agent.
	Version = "1.0.0"
	// DefaultBaseURL is the canonical API base (also served at https://post.misar.io/api).
	DefaultBaseURL    = "https://api.misar.io/post"
	defaultMaxRetries = 3
	defaultTimeout    = 30 * time.Second
	retryBase         = 200 * time.Millisecond
)

var retryable = map[int]bool{429: true, 500: true, 502: true, 503: true, 504: true}

// Client is the MisarPost API client. Create one with [NewClient].
type Client struct {
	apiKey     string
	baseURL    string
	maxRetries int
	httpClient *http.Client
	sleep      func(context.Context, time.Duration) error

	resources
}

// Option configures a [Client].
type Option func(*Client)

// WithBaseURL overrides the API base URL.
func WithBaseURL(u string) Option { return func(c *Client) { c.baseURL = strings.TrimRight(u, "/") } }

// WithHTTPClient supplies the http.Client used for every request.
func WithHTTPClient(h *http.Client) Option { return func(c *Client) { c.httpClient = h } }

// WithMaxRetries sets the total attempts for retryable failures (default 3).
func WithMaxRetries(n int) Option {
	return func(c *Client) {
		if n < 1 {
			n = 1
		}
		c.maxRetries = n
	}
}

// WithTimeout sets the per-request timeout of the default http.Client.
func WithTimeout(d time.Duration) Option {
	return func(c *Client) { c.httpClient = &http.Client{Timeout: d} }
}

// NewClient builds a client for the given API key (create one at
// https://post.misar.io/dashboard/api-keys — it starts with mpk_).
func NewClient(apiKey string, opts ...Option) (*Client, error) {
	if apiKey == "" {
		return nil, &Error{Status: 0, Code: "missing_api_key", Message: "a MisarPost API key is required; create one at https://post.misar.io/dashboard/api-keys"}
	}
	c := &Client{
		apiKey:     apiKey,
		baseURL:    DefaultBaseURL,
		maxRetries: defaultMaxRetries,
		httpClient: &http.Client{Timeout: defaultTimeout},
		sleep: func(ctx context.Context, d time.Duration) error {
			t := time.NewTimer(d)
			defer t.Stop()
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-t.C:
				return nil
			}
		},
	}
	for _, o := range opts {
		o(c)
	}
	c.resources = newResources(c)
	return c, nil
}

// BaseURL returns the base URL requests go to.
func (c *Client) BaseURL() string { return c.baseURL }

func enc(s string) string { return url.PathEscape(s) }

func buildQuery(q map[string]string) string {
	if len(q) == 0 {
		return ""
	}
	keys := make([]string, 0, len(q))
	for k := range q {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	v := url.Values{}
	for _, k := range keys {
		v.Set(k, q[k])
	}
	return "?" + v.Encode()
}

func backoff(attempt int, resp *http.Response) time.Duration {
	if resp != nil {
		if ra := resp.Header.Get("Retry-After"); ra != "" {
			if secs, err := strconv.ParseFloat(ra, 64); err == nil {
				d := time.Duration(secs * float64(time.Second))
				if d > 60*time.Second {
					d = 60 * time.Second
				}
				return d
			}
		}
	}
	return retryBase << attempt
}

// Do sends one API request. Generated resources call it; it is exported for
// endpoints added after this SDK version.
func (c *Client) Do(ctx context.Context, method, path string, query map[string]string, body any) (map[string]any, error) {
	var payload []byte
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		payload = b
	}
	target := c.baseURL + path + buildQuery(query)

	for attempt := 0; ; attempt++ {
		var reader io.Reader
		if payload != nil {
			reader = bytes.NewReader(payload)
		}
		req, err := http.NewRequestWithContext(ctx, method, target, reader)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
		req.Header.Set("Accept", "application/json")
		req.Header.Set("User-Agent", "misarpost-go/"+Version)
		if payload != nil {
			req.Header.Set("Content-Type", "application/json")
		}

		resp, err := c.httpClient.Do(req)
		if err != nil {
			if ctx.Err() != nil {
				return nil, ctx.Err()
			}
			if attempt+1 < c.maxRetries {
				if serr := c.sleep(ctx, backoff(attempt, nil)); serr != nil {
					return nil, serr
				}
				continue
			}
			return nil, &NetworkError{Err: err}
		}
		raw, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			return nil, &NetworkError{Err: err}
		}

		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			return decodeObject(raw)
		}

		// Plan refusals first, by code — never retried.
		if isPlanLimitBody(raw) {
			return nil, planLimitFrom(resp, raw)
		}

		if retryable[resp.StatusCode] && attempt+1 < c.maxRetries {
			if serr := c.sleep(ctx, backoff(attempt, resp)); serr != nil {
				return nil, serr
			}
			continue
		}

		var body struct {
			Error   string `json:"error"`
			Message string `json:"message"`
			Code    string `json:"code"`
		}
		_ = json.Unmarshal(raw, &body)
		msg := body.Error
		if msg == "" {
			msg = body.Message
		}
		if msg == "" {
			msg = http.StatusText(resp.StatusCode)
		}
		code := body.Code
		if code == "" {
			code = "api_error"
		}
		return nil, &Error{Status: resp.StatusCode, Code: code, Message: msg, Body: raw}
	}
}

// decodeObject decodes a JSON body, wrapping a non-object value as {"data": v}.
func decodeObject(raw []byte) (map[string]any, error) {
	if len(bytes.TrimSpace(raw)) == 0 {
		return map[string]any{}, nil
	}
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		return map[string]any{"data": string(raw)}, nil
	}
	if m, ok := v.(map[string]any); ok {
		return m, nil
	}
	return map[string]any{"data": v}, nil
}

func planLimitFrom(resp *http.Response, raw []byte) *PlanLimitError {
	var body struct {
		Error   string         `json:"error"`
		Upgrade map[string]any `json:"upgrade"`
	}
	_ = json.Unmarshal(raw, &body)
	e := &PlanLimitError{Status: resp.StatusCode, Message: body.Error, Offer: body.Upgrade, Body: raw}
	str := func(m map[string]any, keys ...string) string {
		var cur any = m
		for _, k := range keys {
			mm, ok := cur.(map[string]any)
			if !ok {
				return ""
			}
			cur = mm[k]
		}
		s, _ := cur.(string)
		return s
	}
	e.Plan = resp.Header.Get("x-misar-plan")
	if e.Plan == "" {
		e.Plan = str(body.Upgrade, "current_plan", "slug")
	}
	e.UpgradeURL = resp.Header.Get("x-misar-upgrade-url")
	if e.UpgradeURL == "" {
		e.UpgradeURL = str(body.Upgrade, "urls", "pricing")
	}
	if ra, err := strconv.Atoi(resp.Header.Get("Retry-After")); err == nil {
		e.RetryAfter = ra
	}
	e.Feature = str(body.Upgrade, "feature")
	if e.Message == "" {
		e.Message = str(body.Upgrade, "headline")
	}
	return e
}
