package misarpost_test

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Misar-AI/misarpost-sdks/go/misarpost"
)

type reply struct {
	status  int
	body    any
	headers map[string]string
}

func server(t *testing.T, replies []reply) (*httptest.Server, *[]*http.Request, *[]string) {
	t.Helper()
	var reqs []*http.Request
	var bodies []string
	i := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		reqs = append(reqs, r)
		bodies = append(bodies, string(b))
		rep := replies[len(replies)-1]
		if i < len(replies) {
			rep = replies[i]
		}
		i++
		for k, v := range rep.headers {
			w.Header().Set(k, v)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(rep.status)
		_ = json.NewEncoder(w).Encode(rep.body)
	}))
	t.Cleanup(srv.Close)
	return srv, &reqs, &bodies
}

var offer = map[string]any{
	"feature": "ai_text_actions", "reason": "quota_exhausted", "headline": "limit reached",
	"current_plan": map[string]any{"slug": "free"}, "urls": map[string]any{"pricing": "https://post.misar.io/pricing"},
	"cta": "Upgrade to continue.",
}

func client(t *testing.T, url string) *misarpost.Client {
	t.Helper()
	c, err := misarpost.NewClient("mpk_test", misarpost.WithBaseURL(url))
	if err != nil {
		t.Fatal(err)
	}
	return c
}

func TestRequiresKey(t *testing.T) {
	if _, err := misarpost.NewClient(""); err == nil {
		t.Fatal("expected an error for an empty key")
	}
}

func TestBearerAndQuery(t *testing.T) {
	srv, reqs, _ := server(t, []reply{{200, map[string]any{"posts": []any{}}, nil}})
	_, err := client(t, srv.URL).Posts.List(context.Background(), map[string]string{"status": "queued", "page": "2"})
	if err != nil {
		t.Fatal(err)
	}
	r := (*reqs)[0]
	if got := r.Header.Get("Authorization"); got != "Bearer mpk_test" {
		t.Fatalf("auth header = %q", got)
	}
	if r.URL.Path != "/posts" || r.URL.Query().Get("status") != "queued" || r.URL.Query().Get("page") != "2" {
		t.Fatalf("url = %s", r.URL)
	}
}

func TestPathEncodingAndBody(t *testing.T) {
	srv, reqs, bodies := server(t, []reply{{200, map[string]any{"post": map[string]any{}}, nil}})
	_, err := client(t, srv.URL).Posts.Update(context.Background(), "a/b", map[string]any{"contentText": "hi"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if (*reqs)[0].Method != "PATCH" || (*reqs)[0].URL.EscapedPath() != "/posts/a%2Fb" {
		t.Fatalf("got %s %s", (*reqs)[0].Method, (*reqs)[0].URL.EscapedPath())
	}
	if (*bodies)[0] != `{"contentText":"hi"}` {
		t.Fatalf("body = %s", (*bodies)[0])
	}
}

func TestRequiredQuery(t *testing.T) {
	srv, reqs, _ := server(t, []reply{{200, map[string]any{"ok": true}, nil}})
	if _, err := client(t, srv.URL).Workspaces.RemoveMember(context.Background(), "ws1", "m1", nil); err != nil {
		t.Fatal(err)
	}
	if (*reqs)[0].URL.Query().Get("memberId") != "m1" {
		t.Fatalf("query = %s", (*reqs)[0].URL.RawQuery)
	}
}

func TestRetries(t *testing.T) {
	srv, reqs, _ := server(t, []reply{
		{503, map[string]any{"error": "busy"}, map[string]string{"Retry-After": "0"}},
		{429, map[string]any{"error": "slow"}, map[string]string{"Retry-After": "0"}},
		{200, map[string]any{"ok": true}, nil},
	})
	res, err := client(t, srv.URL).Analytics.Stats(context.Background(), nil)
	if err != nil || res["ok"] != true || len(*reqs) != 3 {
		t.Fatalf("res=%v err=%v calls=%d", res, err, len(*reqs))
	}
}

func TestPlanLimitNotRetried(t *testing.T) {
	srv, reqs, _ := server(t, []reply{{402, map[string]any{"error": "limit", "code": "plan_limit_exceeded", "upgrade": offer},
		map[string]string{"Retry-After": "3600", "x-misar-plan": "free"}}})
	_, err := client(t, srv.URL).Generate.Enhance(context.Background(), map[string]any{"content": "x"}, nil)
	var limit *misarpost.PlanLimitError
	if !errors.As(err, &limit) {
		t.Fatalf("want PlanLimitError, got %v", err)
	}
	if limit.Feature != "ai_text_actions" || limit.Plan != "free" || limit.RetryAfter != 3600 || limit.UpgradeURL != "https://post.misar.io/pricing" {
		t.Fatalf("limit = %+v", limit)
	}
	if len(*reqs) != 1 {
		t.Fatalf("retried a plan refusal: %d calls", len(*reqs))
	}
}

func TestPlanLimitOn429(t *testing.T) {
	srv, reqs, _ := server(t, []reply{{429, map[string]any{"error": "quota", "code": "plan_limit_exceeded", "upgrade": offer}, nil}})
	_, err := client(t, srv.URL).Generate.Create(context.Background(), map[string]any{"prompt": "x"}, nil)
	var limit *misarpost.PlanLimitError
	if !errors.As(err, &limit) || len(*reqs) != 1 {
		t.Fatalf("err=%v calls=%d", err, len(*reqs))
	}
}

func TestScopeRefusal(t *testing.T) {
	srv, _, _ := server(t, []reply{{403, map[string]any{"error": "lacks scope", "code": "insufficient_scope"}, nil}})
	_, err := client(t, srv.URL).Webhooks.ListOutbound(context.Background(), nil)
	var apiErr *misarpost.Error
	if !errors.As(err, &apiErr) || apiErr.Status != 403 || apiErr.Code != "insufficient_scope" {
		t.Fatalf("err = %v", err)
	}
}

func TestNonObjectWrapped(t *testing.T) {
	srv, _, _ := server(t, []reply{{200, []int{1, 2}, nil}})
	res, err := client(t, srv.URL).PostTags.List(context.Background(), nil)
	if err != nil || res["data"] == nil {
		t.Fatalf("res=%v err=%v", res, err)
	}
}

func TestPaginate(t *testing.T) {
	var pages []int
	err := misarpost.Paginate(context.Background(), func(_ context.Context, page int) (map[string]any, error) {
		return map[string]any{"posts": []any{page}, "page": float64(page), "totalPages": float64(3)}, nil
	}, func(p map[string]any) bool { pages = append(pages, int(p["page"].(float64))); return true })
	if err != nil || len(pages) != 3 {
		t.Fatalf("pages=%v err=%v", pages, err)
	}
}

func TestWebhookSignature(t *testing.T) {
	body := []byte(`{"event":"post.published"}`)
	sig := misarpost.ComputeWebhookSignature("mpwh_secret", body)
	if !misarpost.VerifyWebhookSignature("mpwh_secret", body, sig) {
		t.Fatal("valid signature rejected")
	}
	if misarpost.VerifyWebhookSignature("mpwh_secret", []byte(`{"event":"tampered"}`), sig) {
		t.Fatal("tampered body accepted")
	}
}
