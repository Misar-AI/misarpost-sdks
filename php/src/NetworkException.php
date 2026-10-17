<?php

declare(strict_types=1);

namespace MisarAI\MisarPost;

/** A transport failure after retries were exhausted. */
final class NetworkException extends MisarPostException
{
    public function __construct(string $message, ?\Throwable $previous = null)
    {
        parent::__construct(0, $message, 'network_error', null, $previous);
    }
}
