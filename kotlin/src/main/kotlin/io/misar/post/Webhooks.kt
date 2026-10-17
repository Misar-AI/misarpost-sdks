package io.misar.post

import java.security.MessageDigest
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * Outbound webhook deliveries carry `X-MisarPost-Signature: sha256=<hex>` — the
 * HMAC-SHA256 of the RAW request body keyed with the endpoint's `mpwh_` secret.
 */
object Webhooks {
    const val SIGNATURE_HEADER = "X-MisarPost-Signature"

    fun computeSignature(secret: String, rawBody: ByteArray): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(secret.toByteArray(), "HmacSHA256"))
        return "sha256=" + mac.doFinal(rawBody).joinToString("") { "%02x".format(it) }
    }

    /** Constant-time check of [signatureHeader] against the raw body. */
    fun verifyWebhookSignature(secret: String, rawBody: ByteArray, signatureHeader: String?): Boolean {
        if (secret.isEmpty() || signatureHeader == null) return false
        val expected = computeSignature(secret, rawBody).toByteArray()
        return MessageDigest.isEqual(expected, signatureHeader.trim().lowercase().toByteArray())
    }
}
