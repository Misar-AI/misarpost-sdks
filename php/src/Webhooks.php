<?php

declare(strict_types=1);

namespace MisarAI\MisarPost;

/**
 * Outbound webhook deliveries carry `X-MisarPost-Signature: sha256=<hex>` — the
 * HMAC-SHA256 of the RAW request body keyed with the endpoint's mpwh_ secret.
 */
final class Webhooks
{
    public const SIGNATURE_HEADER = 'X-MisarPost-Signature';

    public static function computeSignature(string $secret, string $rawBody): string
    {
        return 'sha256=' . hash_hmac('sha256', $rawBody, $secret);
    }

    /** Constant-time check of the signature header against the raw body. */
    public static function verifyWebhookSignature(string $secret, string $rawBody, ?string $signatureHeader): bool
    {
        if ($secret === '' || $signatureHeader === null) {
            return false;
        }
        return hash_equals(self::computeSignature($secret, $rawBody), strtolower(trim($signatureHeader)));
    }
}
