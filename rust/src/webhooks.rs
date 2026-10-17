use hmac::{Hmac, Mac};
use sha2::Sha256;

/// The header every outbound webhook delivery carries: `sha256=<hex>` — the
/// HMAC-SHA256 of the RAW request body keyed with the endpoint's `mpwh_` secret.
pub const WEBHOOK_SIGNATURE_HEADER: &str = "X-MisarPost-Signature";

/// Compute the `X-MisarPost-Signature` value for a body.
pub fn compute_webhook_signature(secret: &str, raw_body: &[u8]) -> String {
    let mut mac =
        Hmac::<Sha256>::new_from_slice(secret.as_bytes()).expect("HMAC accepts any key length");
    mac.update(raw_body);
    format!("sha256={}", hex::encode(mac.finalize().into_bytes()))
}

/// Verify a delivery in constant time. Verify the raw bytes before parsing JSON.
pub fn verify_webhook_signature(secret: &str, raw_body: &[u8], signature_header: &str) -> bool {
    if secret.is_empty() {
        return false;
    }
    let Some(hex_sig) = signature_header
        .trim()
        .to_ascii_lowercase()
        .strip_prefix("sha256=")
        .map(str::to_owned)
    else {
        return false;
    };
    let Ok(given) = hex::decode(hex_sig) else {
        return false;
    };
    let mut mac =
        Hmac::<Sha256>::new_from_slice(secret.as_bytes()).expect("HMAC accepts any key length");
    mac.update(raw_body);
    mac.verify_slice(&given).is_ok()
}
