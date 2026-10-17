# MisarPost PHP SDK

> Schedule, publish, generate and analyze social content from PHP 8.1+ — ext-curl only, no Guzzle.

[![Packagist](https://img.shields.io/packagist/v/misarai/misarpost-php)](https://packagist.org/packages/misarai/misarpost-php)
[![license](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

**17 resource groups · 102 methods · PSR-4, zero dependencies**

MisarPost is the AI social command center: publish to X, LinkedIn, Instagram, Threads, Bluesky, TikTok and more from one API, repurpose long-form content with ContentRipple, research trends with TrendPulse and write in your own voice with PersonaForge.

The resource layer is generated from the API's own route tree, so it always matches the server.

---

## Install

```bash
composer require misarai/misarpost-php
```

---

## Authentication

Create an API key at https://post.misar.io/dashboard/api-keys. It starts with `mpk_` and is
sent as `Authorization: Bearer mpk_…`. Each key carries scopes (`posts:read`,
`schedule:write`, `generate:write`, …); a call outside them answers **403** with
`code: "insufficient_scope"`. New keys get every scope unless you narrow them.

```php
use MisarAI\MisarPost\Client;

$post = new Client(getenv('MISARPOST_API_KEY'));
```

---

## Resources

| Resource | Methods | Scopes |
| --- | --- | --- |
| `$post->analytics` | `stats`, `trends` | `analytics:read` |
| `$post->composer` | `discordChannels`, `hashnodePublications`, `hashnodeTags`, `lemmyCommunities`, `listmonkLists`, `listmonkTemplates`, `mediumPublications`, `pinterestBoards`, `redditFlairs`, `skoolGroups`, `slackChannels`, `whopForums` | `connections:read` |
| `$post->connections` | `list`, `plugs`, `updatePlugs`, `wordpressTaxonomies` | `connections:read`, `connections:write` |
| `$post->contentripple` | `deleteHistory`, `feed`, `history`, `parse`, `repurpose`, `schedule`, `updateVariants`, `usage` | `posts:write`, `generate:write`, `posts:read`, `schedule:write` |
| `$post->drafts` | `create`, `list` | `posts:write`, `posts:read` |
| `$post->generate` | `create`, `enhance`, `hashtags`, `image`, `optimize`, `plan` | `generate:write` |
| `$post->growth` | `nextOpportunity`, `opportunities`, `overview`, `playbooks` | `analytics:read` |
| `$post->media` | `delete`, `list` | `media:write`, `media:read` |
| `$post->notifications` | `list`, `readAll`, `update` | `notifications:read`, `notifications:write` |
| `$post->personaforge` | `approveReplies`, `bio`, `createCompetitors`, `createPersona`, `createReplies`, `createVoice`, `deletePersona`, `generate`, `getPersona`, `getVoice`, `listCompetitors`, `listPersonas`, `listReplies`, `personaStatus`, `updatePersona` | `personas:write`, `generate:write`, `personas:read` |
| `$post->posts` | `calendar`, `cancel`, `delete`, `list`, `reply`, `revert`, `revertBatch`, `schedule`, `share`, `unshare`, `update` | `posts:read`, `posts:write`, `schedule:write` |
| `$post->postTags` | `create`, `delete`, `list`, `update` | `posts:write`, `posts:read` |
| `$post->postTemplates` | `create`, `delete`, `get`, `list`, `update` | `posts:write`, `posts:read` |
| `$post->trendpulse` | `createPlatformContent`, `digest`, `fetch`, `hooks`, `list`, `listPlatformContent`, `performance`, `pipeline`, `refresh`, `usePlatformContent` | `trends:write`, `trends:read`, `analytics:read`, `schedule:write` |
| `$post->video` | `avatars`, `generate`, `script`, `status`, `voices` | `media:read`, `generate:write` |
| `$post->webhooks` | `createOutbound`, `deleteOutbound`, `listOutbound`, `updateOutbound` | `webhooks:write`, `webhooks:read` |
| `$post->workspaces` | `addMember`, `create`, `list`, `members`, `removeMember` | `workspaces:write`, `workspaces:read` |

Methods take path parameters as strings, then `array $body` (when the endpoint reads one), then `array $query`, and return an associative array.

---

## Client

| Thing | Detail |
| --- | --- |
| Entry point | `new Client($apiKey, $baseUrl, maxRetries: 3, timeout: 30, http: $adapter)` |
| Base URL | `https://api.misar.io/post` (also served at `https://post.misar.io/api`) |
| Transport | ext-curl via `CurlAdapter`; implement `HttpAdapter` to swap it |
| Retried | `429` throttles, `500`, `502`, `503`, `504` and network failures — exponential backoff from 200 ms honouring `Retry-After` |
| Never retried | Plan refusals (`PlanLimitException`) |
| Errors | `MisarPostException`, `NetworkException`, `PlanLimitException` |
| Also exported | `Pagination::paginate`, `Webhooks::verifyWebhookSignature` |

---

## Quick start

```php
$post = new Client('mpk_your_key');

$accounts = $post->connections->list()['accounts'];
$post->generate->create(['prompt' => 'Announce our v2 launch', 'platforms' => ['linkedin']]);
$post->posts->schedule([
    'accountIds' => [$accounts[0]['id']],
    'content' => 'We just shipped v2',
    'scheduledAt' => '2026-11-01T09:00:00Z',
]);
```

## Pagination

```php
use MisarAI\MisarPost\Pagination;

foreach (Pagination::paginate(fn (int $p) => $post->posts->list(['status' => 'queued', 'page' => $p])) as $page) {
    foreach ($page['posts'] as $item) {
        echo $item['id'], PHP_EOL;
    }
}
```

## Plan limits

When a monthly allowance is spent, or a feature is not on the plan, the API answers
**402** with `code: "plan_limit_exceeded"` and an `upgrade` offer. The SDK detects the
code before it looks at the status, throws `PlanLimitException`, and **never retries
it**. All copy comes from the server.

```php
use MisarAI\MisarPost\PlanLimitException;

try {
    $post->generate->enhance(['content' => '…']);
} catch (PlanLimitException $e) {
    echo $e->offer['headline'], ' ', $e->offer['cta'], PHP_EOL;
    echo "Upgrade: {$e->upgradeUrl}, resets in {$e->retryAfter}s", PHP_EOL;
}
```

## Webhooks

```php
use MisarAI\MisarPost\Webhooks;

$ok = Webhooks::verifyWebhookSignature($secret, file_get_contents('php://input'), $_SERVER['HTTP_X_MISARPOST_SIGNATURE'] ?? null);
```

## Method reference

| Call | HTTP | Scope |
| --- | --- | --- |
| `$post->analytics->stats()` | `GET /stats` | `analytics:read` |
| `$post->analytics->trends()` | `GET /analytics/trends` | `analytics:read` |
| `$post->composer->discordChannels()` | `GET /composer/discord/channels` | `connections:read` |
| `$post->composer->hashnodePublications()` | `GET /composer/hashnode/publications` | `connections:read` |
| `$post->composer->hashnodeTags()` | `GET /composer/hashnode/tags` | `connections:read` |
| `$post->composer->lemmyCommunities()` | `GET /composer/lemmy/communities` | `connections:read` |
| `$post->composer->listmonkLists()` | `GET /composer/listmonk/lists` | `connections:read` |
| `$post->composer->listmonkTemplates()` | `GET /composer/listmonk/templates` | `connections:read` |
| `$post->composer->mediumPublications()` | `GET /composer/medium/publications` | `connections:read` |
| `$post->composer->pinterestBoards()` | `GET /composer/pinterest/boards` | `connections:read` |
| `$post->composer->redditFlairs()` | `GET /composer/reddit/flairs` | `connections:read` |
| `$post->composer->skoolGroups()` | `GET /composer/skool/groups` | `connections:read` |
| `$post->composer->slackChannels()` | `GET /composer/slack/channels` | `connections:read` |
| `$post->composer->whopForums()` | `GET /composer/whop/forums` | `connections:read` |
| `$post->connections->list()` | `GET /connections` | `connections:read` |
| `$post->connections->plugs()` | `GET /connections/:accountId/plugs` | `connections:read` |
| `$post->connections->updatePlugs()` | `PATCH /connections/:accountId/plugs` | `connections:write` |
| `$post->connections->wordpressTaxonomies()` | `GET /connections/:accountId/wordpress-taxonomies` | `connections:read` |
| `$post->contentripple->deleteHistory()` | `DELETE /contentripple/history` | `posts:write` |
| `$post->contentripple->feed()` | `POST /contentripple/feed` | `generate:write` |
| `$post->contentripple->history()` | `GET /contentripple/history` | `posts:read` |
| `$post->contentripple->parse()` | `POST /contentripple/parse` | `generate:write` |
| `$post->contentripple->repurpose()` | `POST /contentripple` | `generate:write` |
| `$post->contentripple->schedule()` | `POST /contentripple/schedule` | `schedule:write` |
| `$post->contentripple->updateVariants()` | `PATCH /contentripple/variants` | `posts:write` |
| `$post->contentripple->usage()` | `GET /contentripple` | `posts:read` |
| `$post->drafts->create()` | `POST /drafts` | `posts:write` |
| `$post->drafts->list()` | `GET /drafts` | `posts:read` |
| `$post->generate->create()` | `POST /generate` | `generate:write` |
| `$post->generate->enhance()` | `POST /generate/enhance` | `generate:write` |
| `$post->generate->hashtags()` | `POST /generate/hashtags` | `generate:write` |
| `$post->generate->image()` | `POST /generate/image` | `generate:write` |
| `$post->generate->optimize()` | `GET /generate/optimize` | `generate:write` |
| `$post->generate->plan()` | `POST /generate/plan` | `generate:write` |
| `$post->growth->nextOpportunity()` | `GET /growth/next-opportunity` | `analytics:read` |
| `$post->growth->opportunities()` | `GET /growth/opportunities` | `analytics:read` |
| `$post->growth->overview()` | `GET /growth/overview` | `analytics:read` |
| `$post->growth->playbooks()` | `GET /growth/playbooks` | `analytics:read` |
| `$post->media->delete()` | `DELETE /media/:id` | `media:write` |
| `$post->media->list()` | `GET /media` | `media:read` |
| `$post->notifications->list()` | `GET /notifications` | `notifications:read` |
| `$post->notifications->readAll()` | `POST /notifications/read-all` | `notifications:write` |
| `$post->notifications->update()` | `PATCH /notifications/:id` | `notifications:write` |
| `$post->personaforge->approveReplies()` | `POST /personaforge/replies/approve` | `personas:write` |
| `$post->personaforge->bio()` | `POST /personaforge/bio` | `generate:write` |
| `$post->personaforge->createCompetitors()` | `POST /personaforge/competitors` | `personas:write` |
| `$post->personaforge->createPersona()` | `POST /personaforge/personas` | `personas:write` |
| `$post->personaforge->createReplies()` | `POST /personaforge/replies` | `personas:write` |
| `$post->personaforge->createVoice()` | `POST /personaforge/voice` | `personas:write` |
| `$post->personaforge->deletePersona()` | `DELETE /personaforge/personas/:id` | `personas:write` |
| `$post->personaforge->generate()` | `POST /personaforge/generate` | `generate:write` |
| `$post->personaforge->getPersona()` | `GET /personaforge/personas/:id` | `personas:read` |
| `$post->personaforge->getVoice()` | `GET /personaforge/voice` | `personas:read` |
| `$post->personaforge->listCompetitors()` | `GET /personaforge/competitors` | `personas:read` |
| `$post->personaforge->listPersonas()` | `GET /personaforge/personas` | `personas:read` |
| `$post->personaforge->listReplies()` | `GET /personaforge/replies` | `personas:read` |
| `$post->personaforge->personaStatus()` | `GET /personaforge/personas/status/:jobId` | `personas:read` |
| `$post->personaforge->updatePersona()` | `PATCH /personaforge/personas/:id` | `personas:write` |
| `$post->posts->calendar()` | `GET /calendar` | `posts:read` |
| `$post->posts->cancel()` | `DELETE /posts` | `posts:write` |
| `$post->posts->delete()` | `DELETE /posts/:id` | `posts:write` |
| `$post->posts->list()` | `GET /posts` | `posts:read` |
| `$post->posts->reply()` | `POST /posts/:id/reply` | `posts:write` |
| `$post->posts->revert()` | `POST /posts/:id/revert` | `posts:write` |
| `$post->posts->revertBatch()` | `POST /posts/revert-batch` | `posts:write` |
| `$post->posts->schedule()` | `POST /schedule` | `schedule:write` |
| `$post->posts->share()` | `POST /posts/:id/share` | `posts:write` |
| `$post->posts->unshare()` | `DELETE /posts/:id/share` | `posts:write` |
| `$post->posts->update()` | `PATCH /posts/:id` | `posts:write` |
| `$post->postTags->create()` | `POST /post-tags` | `posts:write` |
| `$post->postTags->delete()` | `DELETE /post-tags/:id` | `posts:write` |
| `$post->postTags->list()` | `GET /post-tags` | `posts:read` |
| `$post->postTags->update()` | `PATCH /post-tags/:id` | `posts:write` |
| `$post->postTemplates->create()` | `POST /post-templates` | `posts:write` |
| `$post->postTemplates->delete()` | `DELETE /post-templates/:id` | `posts:write` |
| `$post->postTemplates->get()` | `GET /post-templates/:id` | `posts:read` |
| `$post->postTemplates->list()` | `GET /post-templates` | `posts:read` |
| `$post->postTemplates->update()` | `PATCH /post-templates/:id` | `posts:write` |
| `$post->trendpulse->createPlatformContent()` | `POST /trendpulse/platform-content` | `trends:write` |
| `$post->trendpulse->digest()` | `POST /trendpulse/digest` | `trends:write` |
| `$post->trendpulse->fetch()` | `POST /trendpulse/fetch` | `trends:write` |
| `$post->trendpulse->hooks()` | `GET /trendpulse/hooks` | `trends:read` |
| `$post->trendpulse->list()` | `GET /trendpulse` | `trends:read` |
| `$post->trendpulse->listPlatformContent()` | `GET /trendpulse/platform-content` | `trends:read` |
| `$post->trendpulse->performance()` | `GET /trendpulse/performance` | `analytics:read` |
| `$post->trendpulse->pipeline()` | `POST /trendpulse/pipeline` | `schedule:write` |
| `$post->trendpulse->refresh()` | `POST /trendpulse` | `trends:write` |
| `$post->trendpulse->usePlatformContent()` | `POST /trendpulse/platform-content/use` | `trends:write` |
| `$post->video->avatars()` | `GET /video/avatars` | `media:read` |
| `$post->video->generate()` | `POST /video/generate` | `generate:write` |
| `$post->video->script()` | `POST /video/script` | `generate:write` |
| `$post->video->status()` | `GET /video/status/:jobId` | `media:read` |
| `$post->video->voices()` | `GET /video/voices` | `media:read` |
| `$post->webhooks->createOutbound()` | `POST /webhooks/outbound` | `webhooks:write` |
| `$post->webhooks->deleteOutbound()` | `DELETE /webhooks/outbound/:id` | `webhooks:write` |
| `$post->webhooks->listOutbound()` | `GET /webhooks/outbound` | `webhooks:read` |
| `$post->webhooks->updateOutbound()` | `PATCH /webhooks/outbound/:id` | `webhooks:write` |
| `$post->workspaces->addMember()` | `POST /workspaces/:id/members` | `workspaces:write` |
| `$post->workspaces->create()` | `POST /workspaces` | `workspaces:write` |
| `$post->workspaces->list()` | `GET /workspaces` | `workspaces:read` |
| `$post->workspaces->members()` | `GET /workspaces/:id/members` | `workspaces:read` |
| `$post->workspaces->removeMember()` | `DELETE /workspaces/:id/members` | `workspaces:write` |

---

## Links

- Website — https://www.misarpost.com
- App — https://post.misar.io
- Parent — https://misar.io
- Documentation — https://docs.misar.io/post
- API reference — https://api.misar.io/post/openapi.json
- Source — https://github.com/Misar-AI/misarpost-sdks
- Packagist — https://packagist.org/packages/misarai/misarpost-php

MIT © [Misar.AI](https://misar.io)
