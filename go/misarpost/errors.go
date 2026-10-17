package misarpost

import (
	"encoding/json"
	"fmt"
)

// Error is any non-2xx answer from the MisarPost API.
type Error struct {
	// HTTP status; 0 for a network failure.
	Status int
	// Machine code from the body's "code" field, e.g. "insufficient_scope".
	Code    string
	Message string
	// The raw response body.
	Body []byte
}

func (e *Error) Error() string {
	return fmt.Sprintf("misarpost: API error %d (%s): %s", e.Status, e.Code, e.Message)
}

// Unauthorized reports a rejected key: missing, revoked, expired, or another product's.
func (e *Error) Unauthorized() bool { return e.Status == 401 }

// Forbidden reports a valid key that lacks the scope this endpoint requires.
func (e *Error) Forbidden() bool { return e.Status == 403 }

// NetworkError wraps a transport failure after retries are exhausted.
type NetworkError struct {
	Err error
}

func (e *NetworkError) Error() string { return "misarpost: network error: " + e.Err.Error() }
func (e *NetworkError) Unwrap() error { return e.Err }

// PlanLimitError means the plan behind the API key blocks the call: the API
// answered with code "plan_limit_exceeded" (HTTP 402) and an upgrade offer.
// It is never retried — retrying cannot help until the allowance resets or
// the plan changes.
type PlanLimitError struct {
	Status  int
	Message string
	// Offer is the server's upgrade offer; all copy comes from the server.
	Offer map[string]any
	// Plan is the account's current plan slug.
	Plan string
	// UpgradeURL is the pricing page to send the user to.
	UpgradeURL string
	// RetryAfter is the number of seconds until a monthly allowance resets (0 when unknown).
	RetryAfter int
	// Feature is the feature whose allowance was exhausted.
	Feature string
	Body    []byte
}

func (e *PlanLimitError) Error() string {
	return fmt.Sprintf("misarpost: plan limit (%d, plan_limit_exceeded): %s", e.Status, e.Message)
}

// isPlanLimitBody reports whether an error body carries the plan-refusal marker.
func isPlanLimitBody(raw []byte) bool {
	var probe struct {
		Code    string          `json:"code"`
		Upgrade json.RawMessage `json:"upgrade"`
	}
	if len(raw) == 0 || json.Unmarshal(raw, &probe) != nil {
		return false
	}
	return probe.Code == "plan_limit_exceeded" || (len(probe.Upgrade) > 0 && string(probe.Upgrade) != "null" && probe.Upgrade[0] == '{')
}
