/**
 * Verify an outbound webhook delivery from MisarPost.
 *
 * Every delivery carries `X-MisarPost-Signature: sha256=<hex>` — the HMAC-SHA256
 * of the RAW request body keyed with the endpoint's `mpwh_` signing secret
 * (shown once when the endpoint is created). Verify against the raw bytes,
 * before any JSON parsing re-serialises the body.
 */
export const WEBHOOK_SIGNATURE_HEADER = "X-MisarPost-Signature";

async function subtle(): Promise<SubtleCrypto> {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.subtle) return c.subtle;
  const node = (await import("node:crypto")) as unknown as { webcrypto: Crypto };
  return node.webcrypto.subtle;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function computeWebhookSignature(secret: string, rawBody: string | Uint8Array): Promise<string> {
  const s = await subtle();
  const enc = new TextEncoder();
  const key = await s.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const data = typeof rawBody === "string" ? enc.encode(rawBody) : rawBody;
  const mac = new Uint8Array(await s.sign("HMAC", key, data as BufferSource));
  return "sha256=" + Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** True when `signatureHeader` is a valid signature of `rawBody` under `secret`. */
export async function verifyWebhookSignature(
  secret: string,
  rawBody: string | Uint8Array,
  signatureHeader: string | null | undefined,
): Promise<boolean> {
  if (!secret || !signatureHeader) return false;
  const expected = await computeWebhookSignature(secret, rawBody);
  return timingSafeEqual(expected, signatureHeader.trim().toLowerCase());
}
