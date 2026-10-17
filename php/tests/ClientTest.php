<?php

declare(strict_types=1);

namespace MisarAI\MisarPost\Tests;

use MisarAI\MisarPost\Client;
use MisarAI\MisarPost\HttpAdapter;
use MisarAI\MisarPost\MisarPostException;
use MisarAI\MisarPost\Pagination;
use MisarAI\MisarPost\PlanLimitException;
use MisarAI\MisarPost\Webhooks;
use PHPUnit\Framework\TestCase;

final class FakeHttp implements HttpAdapter
{
    /** @var list<array{0:int,1:array<string,string>,2:string}> */
    public array $replies = [];
    /** @var list<array{method:string,url:string,headers:array<string,string>,body:?string}> */
    public array $calls = [];

    public function send(string $method, string $url, array $headers, ?string $body, int $timeout): array
    {
        $this->calls[] = ['method' => $method, 'url' => $url, 'headers' => $headers, 'body' => $body];
        return count($this->replies) > 1 ? array_shift($this->replies) : $this->replies[0];
    }
}

final class ClientTest extends TestCase
{
    private const OFFER = ['feature' => 'ai_text_actions', 'headline' => 'limit', 'current_plan' => ['slug' => 'free'],
        'urls' => ['pricing' => 'https://post.misar.io/pricing'], 'cta' => 'Upgrade to continue.'];

    private FakeHttp $http;

    private function client(array ...$replies): Client
    {
        $this->http = new FakeHttp();
        foreach ($replies as [$status, $body, $headers]) {
            $this->http->replies[] = [$status, $headers, json_encode($body)];
        }
        return new Client('mpk_test', http: $this->http, sleeper: static function (float $s): void {
        });
    }

    public function testRequiresApiKey(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        new Client('');
    }

    public function testBearerAndQuery(): void
    {
        $this->client([200, ['posts' => []], []])->posts->list(['status' => 'queued', 'page' => 2]);
        $call = $this->http->calls[0];
        self::assertSame('GET', $call['method']);
        self::assertSame('https://api.misar.io/post/posts?status=queued&page=2', $call['url']);
        self::assertSame('Bearer mpk_test', $call['headers']['Authorization']);
    }

    public function testPathEncodingAndBody(): void
    {
        $this->client([200, ['post' => []], []])->posts->update('a/b', ['contentText' => 'hi']);
        $call = $this->http->calls[0];
        self::assertSame('PATCH', $call['method']);
        self::assertSame('https://api.misar.io/post/posts/a%2Fb', $call['url']);
        self::assertSame('{"contentText":"hi"}', $call['body']);
    }

    public function testRequiredQueryIsPositional(): void
    {
        $this->client([200, ['ok' => true], []])->workspaces->removeMember('ws1', 'm1');
        self::assertSame('https://api.misar.io/post/workspaces/ws1/members?memberId=m1', $this->http->calls[0]['url']);
    }

    public function testRetriesThenSucceeds(): void
    {
        $post = $this->client([503, ['error' => 'busy'], ['retry-after' => '0']], [429, ['error' => 'slow'], []], [200, ['ok' => true], []]);
        self::assertSame(['ok' => true], $post->analytics->stats());
        self::assertCount(3, $this->http->calls);
    }

    public function testPlanLimitIsTypedAndNotRetried(): void
    {
        $post = $this->client([402, ['error' => 'limit', 'code' => 'plan_limit_exceeded', 'upgrade' => self::OFFER],
            ['retry-after' => '3600', 'x-misar-plan' => 'free']]);
        try {
            $post->generate->enhance(['content' => 'x']);
            self::fail('expected PlanLimitException');
        } catch (PlanLimitException $e) {
            self::assertSame('ai_text_actions', $e->feature);
            self::assertSame('free', $e->plan);
            self::assertSame('https://post.misar.io/pricing', $e->upgradeUrl);
            self::assertSame(3600, $e->retryAfter);
            self::assertSame('Upgrade to continue.', $e->offer['cta']);
        }
        self::assertCount(1, $this->http->calls);
    }

    public function testPlanLimitDetectedOn429(): void
    {
        $post = $this->client([429, ['error' => 'quota', 'code' => 'plan_limit_exceeded', 'upgrade' => self::OFFER], []]);
        $this->expectException(PlanLimitException::class);
        try {
            $post->generate->create(['prompt' => 'x']);
        } finally {
            self::assertCount(1, $this->http->calls);
        }
    }

    public function testScopeRefusalCarriesCode(): void
    {
        $post = $this->client([403, ['error' => 'lacks scope', 'code' => 'insufficient_scope'], []]);
        try {
            $post->webhooks->listOutbound();
            self::fail('expected MisarPostException');
        } catch (MisarPostException $e) {
            self::assertSame(403, $e->status);
            self::assertSame('insufficient_scope', $e->errorCode);
        }
    }

    public function testWrapsNonObjectJson(): void
    {
        self::assertSame(['data' => [1, 2]], $this->client([200, [1, 2], []])->postTags->list());
    }

    public function testPaginate(): void
    {
        $pages = iterator_to_array(Pagination::paginate(static fn (int $p): array => ['posts' => [$p], 'totalPages' => 3]), false);
        self::assertCount(3, $pages);
    }

    public function testWebhookSignature(): void
    {
        $sig = Webhooks::computeSignature('mpwh_secret', '{"event":"post.published"}');
        self::assertStringStartsWith('sha256=', $sig);
        self::assertTrue(Webhooks::verifyWebhookSignature('mpwh_secret', '{"event":"post.published"}', $sig));
        self::assertFalse(Webhooks::verifyWebhookSignature('mpwh_secret', '{"event":"tampered"}', $sig));
    }
}
