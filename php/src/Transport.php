<?php

declare(strict_types=1);

namespace MisarAI\MisarPost;

/**
 * HTTP transport the generated resource layer is written against. One
 * credential, one path in: the account API key (mpk_…) sent as
 * `Authorization: Bearer`. Retries throttles, 5xx and network failures with
 * exponential backoff from 200 ms honouring Retry-After — never a plan refusal.
 */
final class Transport
{
    public const VERSION = '1.0.0';
    public const DEFAULT_BASE_URL = 'https://api.misar.io/post';
    private const RETRYABLE = [429, 500, 502, 503, 504];

    public readonly string $baseUrl;
    private HttpAdapter $http;
    /** @var callable(float): void */
    private $sleeper;

    public function __construct(
        private readonly string $apiKey,
        string $baseUrl = self::DEFAULT_BASE_URL,
        private readonly int $maxRetries = 3,
        private readonly int $timeout = 30,
        ?HttpAdapter $http = null,
        ?callable $sleeper = null,
    ) {
        if ($apiKey === '') {
            throw new \InvalidArgumentException(
                'A MisarPost API key is required. Create one at https://post.misar.io/dashboard/api-keys (it starts with mpk_).'
            );
        }
        $this->baseUrl = rtrim($baseUrl, '/');
        $this->http = $http ?? new CurlAdapter();
        $this->sleeper = $sleeper ?? static function (float $seconds): void {
            usleep((int) ($seconds * 1_000_000));
        };
    }

    /** Encode one path parameter. */
    public static function enc(string $value): string
    {
        return rawurlencode($value);
    }

    /**
     * Send one API request; generated resources call this.
     *
     * @param array<string, mixed>|null $query
     * @param array<string, mixed>|null $body
     * @return array<string, mixed>
     */
    public function request(string $method, string $path, ?array $query = null, ?array $body = null): array
    {
        $query = array_filter($query ?? [], static fn ($v) => $v !== null);
        $url = $this->baseUrl . $path . ($query ? '?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986) : '');
        $headers = [
            'Authorization' => 'Bearer ' . $this->apiKey,
            'Accept' => 'application/json',
            'User-Agent' => 'misarpost-php/' . self::VERSION,
        ];
        $payload = null;
        if ($body !== null) {
            $headers['Content-Type'] = 'application/json';
            $payload = json_encode($body === [] ? new \stdClass() : $body, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
        }

        for ($attempt = 0; ; $attempt++) {
            try {
                [$status, $respHeaders, $raw] = $this->http->send($method, $url, $headers, $payload, $this->timeout);
            } catch (\RuntimeException $e) {
                if ($attempt + 1 < max(1, $this->maxRetries)) {
                    ($this->sleeper)($this->backoff($attempt, null));
                    continue;
                }
                throw new NetworkException($e->getMessage(), $e);
            }

            $data = $raw === '' ? null : json_decode($raw, true);
            if ($raw !== '' && json_last_error() !== JSON_ERROR_NONE) {
                $data = $raw;
            }
            if ($status >= 200 && $status < 300) {
                if ($data === null) {
                    return [];
                }
                return is_array($data) && !array_is_list($data) ? $data : ['data' => $data];
            }

            // Plan refusals first, by code — never retried.
            if (self::isPlanLimitBody($data)) {
                throw self::planLimit($status, $respHeaders, $data);
            }

            if (in_array($status, self::RETRYABLE, true) && $attempt + 1 < max(1, $this->maxRetries)) {
                ($this->sleeper)($this->backoff($attempt, $respHeaders['retry-after'] ?? null));
                continue;
            }

            $obj = is_array($data) ? $data : [];
            $message = $obj['error'] ?? $obj['message'] ?? (is_string($data) && $data !== '' ? $data : "HTTP {$status}");
            throw new MisarPostException($status, (string) $message, (string) ($obj['code'] ?? 'api_error'), $data);
        }
    }

    public static function isPlanLimitBody(mixed $data): bool
    {
        return is_array($data)
            && (($data['code'] ?? null) === 'plan_limit_exceeded' || (isset($data['upgrade']) && is_array($data['upgrade'])));
    }

    /** @param array<string, string> $headers */
    private static function planLimit(int $status, array $headers, array $data): PlanLimitException
    {
        $offer = isset($data['upgrade']) && is_array($data['upgrade']) ? $data['upgrade'] : null;
        $retry = $headers['retry-after'] ?? null;
        return new PlanLimitException(
            $status,
            (string) ($data['error'] ?? $offer['headline'] ?? 'Plan limit exceeded'),
            $data,
            $offer,
            $headers['x-misar-plan'] ?? ($offer['current_plan']['slug'] ?? null),
            $headers['x-misar-upgrade-url'] ?? ($offer['urls']['pricing'] ?? null),
            $retry !== null && ctype_digit($retry) ? (int) $retry : null,
            $offer['feature'] ?? null,
        );
    }

    private function backoff(int $attempt, ?string $retryAfter): float
    {
        if ($retryAfter !== null && is_numeric($retryAfter)) {
            return min((float) $retryAfter, 60.0);
        }
        return 0.2 * (2 ** $attempt);
    }
}
