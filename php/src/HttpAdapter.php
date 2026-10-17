<?php

declare(strict_types=1);

namespace MisarAI\MisarPost;

/** The HTTP layer the transport sends through — swap it in tests. */
interface HttpAdapter
{
    /**
     * @param array<string, string> $headers
     * @return array{0: int, 1: array<string, string>, 2: string} status, lower-cased headers, body
     * @throws \RuntimeException on a transport failure
     */
    public function send(string $method, string $url, array $headers, ?string $body, int $timeout): array;
}
