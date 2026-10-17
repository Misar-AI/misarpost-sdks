<?php

declare(strict_types=1);

namespace MisarAI\MisarPost;

/**
 * The plan behind the API key blocks this call: HTTP 402 with
 * code "plan_limit_exceeded" and an upgrade offer. Detected by code before the
 * status and never retried. All copy comes from the server.
 */
final class PlanLimitException extends MisarPostException
{
    /**
     * @param array<string, mixed>|null $offer the server's upgrade offer
     */
    public function __construct(
        int $status,
        string $message,
        mixed $body,
        public readonly ?array $offer,
        public readonly ?string $plan,
        public readonly ?string $upgradeUrl,
        public readonly ?int $retryAfter,
        public readonly ?string $feature,
    ) {
        parent::__construct($status, $message, 'plan_limit_exceeded', $body);
    }
}
