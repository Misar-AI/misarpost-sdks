package io.misar.post;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * Verify outbound webhook deliveries. Each carries
 * {@code X-MisarPost-Signature: sha256=<hex>} — the HMAC-SHA256 of the RAW
 * request body keyed with the endpoint's {@code mpwh_} secret.
 */
public final class Webhooks {
    public static final String SIGNATURE_HEADER = "X-MisarPost-Signature";

    private Webhooks() { }

    public static String computeSignature(String secret, byte[] rawBody) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] digest = mac.doFinal(rawBody);
            StringBuilder sb = new StringBuilder("sha256=");
            for (byte b : digest) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            throw new IllegalStateException("HmacSHA256 unavailable", e);
        }
    }

    /** Constant-time check of {@code signatureHeader} against the raw body. */
    public static boolean verifyWebhookSignature(String secret, byte[] rawBody, String signatureHeader) {
        if (secret == null || secret.isEmpty() || signatureHeader == null) return false;
        byte[] expected = computeSignature(secret, rawBody).getBytes(StandardCharsets.UTF_8);
        byte[] given = signatureHeader.trim().toLowerCase().getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(expected, given);
    }
}
