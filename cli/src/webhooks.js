import { createHmac, timingSafeEqual } from "node:crypto";

// Outbound webhook deliveries carry X-MisarPost-Signature: sha256=<hex> — the
// HMAC-SHA256 of the RAW request body keyed with the endpoint's mpwh_ secret.
export const WEBHOOK_SIGNATURE_HEADER = "X-MisarPost-Signature";

export function computeWebhookSignature(secret, rawBody) {
  return "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
}

export function verifyWebhookSignature(secret, rawBody, signatureHeader) {
  if (!secret || !signatureHeader) return false;
  const a = Buffer.from(computeWebhookSignature(secret, rawBody));
  const b = Buffer.from(String(signatureHeader).trim().toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}
