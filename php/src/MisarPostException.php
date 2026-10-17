<?php

declare(strict_types=1);

namespace MisarAI\MisarPost;

/** Any non-2xx answer from the MisarPost API. */
class MisarPostException extends \RuntimeException
{
    /** @param mixed $body the decoded error body */
    public function __construct(
        public readonly int $status,
        string $message,
        public readonly string $errorCode = 'api_error',
        public readonly mixed $body = null,
        ?\Throwable $previous = null,
    ) {
        parent::__construct("misarpost: API error {$status} ({$errorCode}): {$message}", $status, $previous);
    }

    /** The key was rejected outright: missing, revoked, expired, or another product's. */
    public function isUnauthorized(): bool
    {
        return $this->status === 401;
    }

    /** The key is valid but lacks the scope this endpoint requires. */
    public function isForbidden(): bool
    {
        return $this->status === 403;
    }
}
