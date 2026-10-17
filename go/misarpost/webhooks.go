package misarpost

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"strings"
)

// WebhookSignatureHeader is the header every outbound webhook delivery carries:
// "sha256=<hex>" — the HMAC-SHA256 of the RAW request body keyed with the
// endpoint's mpwh_ signing secret.
const WebhookSignatureHeader = "X-MisarPost-Signature"

// ComputeWebhookSignature returns the X-MisarPost-Signature value for a body.
func ComputeWebhookSignature(secret string, rawBody []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(rawBody)
	return "sha256=" + hex.EncodeToString(mac.Sum(nil))
}

// VerifyWebhookSignature reports whether signatureHeader is a valid signature
// of rawBody under secret, in constant time. Verify the raw bytes before
// decoding JSON.
func VerifyWebhookSignature(secret string, rawBody []byte, signatureHeader string) bool {
	if secret == "" || signatureHeader == "" {
		return false
	}
	expected := ComputeWebhookSignature(secret, rawBody)
	return hmac.Equal([]byte(expected), []byte(strings.ToLower(strings.TrimSpace(signatureHeader))))
}
