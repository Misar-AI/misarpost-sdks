<?php

declare(strict_types=1);

namespace MisarAI\MisarPost;

use MisarAI\MisarPost\Generated\Resources;

/**
 * MisarPost API client. Every resource ($post->posts, $post->generate, …) is
 * generated from the API's own route tree (sdks/manifest.json).
 *
 *     $post = new Client(getenv('MISARPOST_API_KEY'));
 *     $queued = $post->posts->list(['status' => 'queued']);
 */
final class Client extends Resources
{
    public readonly Transport $transport;

    public function __construct(
        string $apiKey,
        string $baseUrl = Transport::DEFAULT_BASE_URL,
        int $maxRetries = 3,
        int $timeout = 30,
        ?HttpAdapter $http = null,
        ?callable $sleeper = null,
    ) {
        $this->transport = new Transport($apiKey, $baseUrl, $maxRetries, $timeout, $http, $sleeper);
        parent::__construct($this->transport);
    }
}
