# MisarPost Ruby SDK

> Schedule, publish, generate and analyze social content from Ruby — standard library only.

[![Gem](https://img.shields.io/gem/v/misarpost)](https://rubygems.org/gems/misarpost)
[![license](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

**17 resource groups · 102 methods · zero runtime dependencies**

MisarPost is the AI social command center: publish to X, LinkedIn, Instagram, Threads, Bluesky, TikTok and more from one API, repurpose long-form content with ContentRipple, research trends with TrendPulse and write in your own voice with PersonaForge.

The resource layer is generated from the API's own route tree, so it always matches the server. Ruby 2.6+, `Net::HTTP` under the hood.

---

## Install

### Bundler

```ruby
gem "misarpost"
```

### gem

```bash
gem install misarpost
```

---

## Authentication

Create an API key at https://post.misar.io/dashboard/api-keys. It starts with `mpk_` and is
sent as `Authorization: Bearer mpk_…`. Each key carries scopes (`posts:read`,
`schedule:write`, `generate:write`, …); a call outside them answers **403** with
`code: "insufficient_scope"`. New keys get every scope unless you narrow them.

```ruby
require "misarpost"

post = MisarPost::Client.new(ENV.fetch("MISARPOST_API_KEY"))
```

---

## Resources

| Resource | Methods | Scopes |
| --- | --- | --- |
| `post.analytics` | `stats`, `trends` | `analytics:read` |
| `post.composer` | `discord_channels`, `hashnode_publications`, `hashnode_tags`, `lemmy_communities`, `listmonk_lists`, `listmonk_templates`, `medium_publications`, `pinterest_boards`, `reddit_flairs`, `skool_groups`, `slack_channels`, `whop_forums` | `connections:read` |
| `post.connections` | `list`, `plugs`, `update_plugs`, `wordpress_taxonomies` | `connections:read`, `connections:write` |
| `post.contentripple` | `delete_history`, `feed`, `history`, `parse`, `repurpose`, `schedule`, `update_variants`, `usage` | `posts:write`, `generate:write`, `posts:read`, `schedule:write` |
| `post.drafts` | `create`, `list` | `posts:write`, `posts:read` |
| `post.generate` | `create`, `enhance`, `hashtags`, `image`, `optimize`, `plan` | `generate:write` |
| `post.growth` | `next_opportunity`, `opportunities`, `overview`, `playbooks` | `analytics:read` |
| `post.media` | `delete`, `list` | `media:write`, `media:read` |
| `post.notifications` | `list`, `read_all`, `update` | `notifications:read`, `notifications:write` |
| `post.personaforge` | `approve_replies`, `bio`, `create_competitors`, `create_persona`, `create_replies`, `create_voice`, `delete_persona`, `generate`, `get_persona`, `get_voice`, `list_competitors`, `list_personas`, `list_replies`, `persona_status`, `update_persona` | `personas:write`, `generate:write`, `personas:read` |
| `post.posts` | `calendar`, `cancel`, `delete`, `list`, `reply`, `revert`, `revert_batch`, `schedule`, `share`, `unshare`, `update` | `posts:read`, `posts:write`, `schedule:write` |
| `post.post_tags` | `create`, `delete`, `list`, `update` | `posts:write`, `posts:read` |
| `post.post_templates` | `create`, `delete`, `get`, `list`, `update` | `posts:write`, `posts:read` |
| `post.trendpulse` | `create_platform_content`, `digest`, `fetch`, `hooks`, `list`, `list_platform_content`, `performance`, `pipeline`, `refresh`, `use_platform_content` | `trends:write`, `trends:read`, `analytics:read`, `schedule:write` |
| `post.video` | `avatars`, `generate`, `script`, `status`, `voices` | `media:read`, `generate:write` |
| `post.webhooks` | `create_outbound`, `delete_outbound`, `list_outbound`, `update_outbound` | `webhooks:write`, `webhooks:read` |
| `post.workspaces` | `add_member`, `create`, `list`, `members`, `remove_member` | `workspaces:write`, `workspaces:read` |

Methods take path parameters positionally, then `body` (a Hash, when the endpoint reads one), then `query:`.

---

## Client

| Thing | Detail |
| --- | --- |
| Entry point | `MisarPost::Client.new(api_key, base_url:, max_retries: 3, timeout: 30, http: adapter)` |
| `base_url` | `https://api.misar.io/post` (also served at `https://post.misar.io/api`) |
| Transport | `Net::HTTP`; inject any `#call(method, uri, headers, body, timeout)` adapter with `http:`. |
| Retried | `429` throttles, `500`, `502`, `503`, `504` and network failures — exponential backoff from 200 ms honouring `Retry-After`. |
| Never retried | Plan refusals (`MisarPost::PlanLimitError`). |
| Errors | `MisarPost::Error`, `MisarPost::NetworkError`, `MisarPost::PlanLimitError` |
| Also exported | `MisarPost.paginate`, `MisarPost.verify_webhook_signature` |

---

## Quick start

```ruby
post = MisarPost::Client.new("mpk_your_key")

accounts = post.connections.list["accounts"]
post.generate.create("prompt" => "Announce our v2 launch", "platforms" => ["linkedin"])
post.posts.schedule(
  "accountIds" => [accounts.first["id"]],
  "content" => "We just shipped v2",
  "scheduledAt" => "2026-11-01T09:00:00Z"
)
```

## Pagination

```ruby
MisarPost.paginate { |n| post.posts.list(query: { "status" => "queued", "page" => n }) }.each do |page|
  page["posts"].each { |p| puts p["id"] }
end
```

## Plan limits

When a monthly allowance is spent, or a feature is not on the plan, the API answers
**402** with `code: "plan_limit_exceeded"` and an `upgrade` offer. The SDK detects the
code before it looks at the status, raises `MisarPost::PlanLimitError`, and **never retries
it**. All copy comes from the server.

```ruby
begin
  post.generate.enhance("content" => "…")
rescue MisarPost::PlanLimitError => e
  puts e.offer["headline"], e.offer["cta"]
  puts "Upgrade: #{e.upgrade_url} (resets in #{e.retry_after}s)"
end
```

## Webhooks

```ruby
ok = MisarPost.verify_webhook_signature(secret, request.raw_post, request.headers["X-MisarPost-Signature"])
```

## Method reference

| Call | HTTP | Scope |
| --- | --- | --- |
| `post.analytics.stats` | `GET /stats` | `analytics:read` |
| `post.analytics.trends` | `GET /analytics/trends` | `analytics:read` |
| `post.composer.discord_channels` | `GET /composer/discord/channels` | `connections:read` |
| `post.composer.hashnode_publications` | `GET /composer/hashnode/publications` | `connections:read` |
| `post.composer.hashnode_tags` | `GET /composer/hashnode/tags` | `connections:read` |
| `post.composer.lemmy_communities` | `GET /composer/lemmy/communities` | `connections:read` |
| `post.composer.listmonk_lists` | `GET /composer/listmonk/lists` | `connections:read` |
| `post.composer.listmonk_templates` | `GET /composer/listmonk/templates` | `connections:read` |
| `post.composer.medium_publications` | `GET /composer/medium/publications` | `connections:read` |
| `post.composer.pinterest_boards` | `GET /composer/pinterest/boards` | `connections:read` |
| `post.composer.reddit_flairs` | `GET /composer/reddit/flairs` | `connections:read` |
| `post.composer.skool_groups` | `GET /composer/skool/groups` | `connections:read` |
| `post.composer.slack_channels` | `GET /composer/slack/channels` | `connections:read` |
| `post.composer.whop_forums` | `GET /composer/whop/forums` | `connections:read` |
| `post.connections.list` | `GET /connections` | `connections:read` |
| `post.connections.plugs` | `GET /connections/:accountId/plugs` | `connections:read` |
| `post.connections.update_plugs` | `PATCH /connections/:accountId/plugs` | `connections:write` |
| `post.connections.wordpress_taxonomies` | `GET /connections/:accountId/wordpress-taxonomies` | `connections:read` |
| `post.contentripple.delete_history` | `DELETE /contentripple/history` | `posts:write` |
| `post.contentripple.feed` | `POST /contentripple/feed` | `generate:write` |
| `post.contentripple.history` | `GET /contentripple/history` | `posts:read` |
| `post.contentripple.parse` | `POST /contentripple/parse` | `generate:write` |
| `post.contentripple.repurpose` | `POST /contentripple` | `generate:write` |
| `post.contentripple.schedule` | `POST /contentripple/schedule` | `schedule:write` |
| `post.contentripple.update_variants` | `PATCH /contentripple/variants` | `posts:write` |
| `post.contentripple.usage` | `GET /contentripple` | `posts:read` |
| `post.drafts.create` | `POST /drafts` | `posts:write` |
| `post.drafts.list` | `GET /drafts` | `posts:read` |
| `post.generate.create` | `POST /generate` | `generate:write` |
| `post.generate.enhance` | `POST /generate/enhance` | `generate:write` |
| `post.generate.hashtags` | `POST /generate/hashtags` | `generate:write` |
| `post.generate.image` | `POST /generate/image` | `generate:write` |
| `post.generate.optimize` | `GET /generate/optimize` | `generate:write` |
| `post.generate.plan` | `POST /generate/plan` | `generate:write` |
| `post.growth.next_opportunity` | `GET /growth/next-opportunity` | `analytics:read` |
| `post.growth.opportunities` | `GET /growth/opportunities` | `analytics:read` |
| `post.growth.overview` | `GET /growth/overview` | `analytics:read` |
| `post.growth.playbooks` | `GET /growth/playbooks` | `analytics:read` |
| `post.media.delete` | `DELETE /media/:id` | `media:write` |
| `post.media.list` | `GET /media` | `media:read` |
| `post.notifications.list` | `GET /notifications` | `notifications:read` |
| `post.notifications.read_all` | `POST /notifications/read-all` | `notifications:write` |
| `post.notifications.update` | `PATCH /notifications/:id` | `notifications:write` |
| `post.personaforge.approve_replies` | `POST /personaforge/replies/approve` | `personas:write` |
| `post.personaforge.bio` | `POST /personaforge/bio` | `generate:write` |
| `post.personaforge.create_competitors` | `POST /personaforge/competitors` | `personas:write` |
| `post.personaforge.create_persona` | `POST /personaforge/personas` | `personas:write` |
| `post.personaforge.create_replies` | `POST /personaforge/replies` | `personas:write` |
| `post.personaforge.create_voice` | `POST /personaforge/voice` | `personas:write` |
| `post.personaforge.delete_persona` | `DELETE /personaforge/personas/:id` | `personas:write` |
| `post.personaforge.generate` | `POST /personaforge/generate` | `generate:write` |
| `post.personaforge.get_persona` | `GET /personaforge/personas/:id` | `personas:read` |
| `post.personaforge.get_voice` | `GET /personaforge/voice` | `personas:read` |
| `post.personaforge.list_competitors` | `GET /personaforge/competitors` | `personas:read` |
| `post.personaforge.list_personas` | `GET /personaforge/personas` | `personas:read` |
| `post.personaforge.list_replies` | `GET /personaforge/replies` | `personas:read` |
| `post.personaforge.persona_status` | `GET /personaforge/personas/status/:jobId` | `personas:read` |
| `post.personaforge.update_persona` | `PATCH /personaforge/personas/:id` | `personas:write` |
| `post.posts.calendar` | `GET /calendar` | `posts:read` |
| `post.posts.cancel` | `DELETE /posts` | `posts:write` |
| `post.posts.delete` | `DELETE /posts/:id` | `posts:write` |
| `post.posts.list` | `GET /posts` | `posts:read` |
| `post.posts.reply` | `POST /posts/:id/reply` | `posts:write` |
| `post.posts.revert` | `POST /posts/:id/revert` | `posts:write` |
| `post.posts.revert_batch` | `POST /posts/revert-batch` | `posts:write` |
| `post.posts.schedule` | `POST /schedule` | `schedule:write` |
| `post.posts.share` | `POST /posts/:id/share` | `posts:write` |
| `post.posts.unshare` | `DELETE /posts/:id/share` | `posts:write` |
| `post.posts.update` | `PATCH /posts/:id` | `posts:write` |
| `post.post_tags.create` | `POST /post-tags` | `posts:write` |
| `post.post_tags.delete` | `DELETE /post-tags/:id` | `posts:write` |
| `post.post_tags.list` | `GET /post-tags` | `posts:read` |
| `post.post_tags.update` | `PATCH /post-tags/:id` | `posts:write` |
| `post.post_templates.create` | `POST /post-templates` | `posts:write` |
| `post.post_templates.delete` | `DELETE /post-templates/:id` | `posts:write` |
| `post.post_templates.get` | `GET /post-templates/:id` | `posts:read` |
| `post.post_templates.list` | `GET /post-templates` | `posts:read` |
| `post.post_templates.update` | `PATCH /post-templates/:id` | `posts:write` |
| `post.trendpulse.create_platform_content` | `POST /trendpulse/platform-content` | `trends:write` |
| `post.trendpulse.digest` | `POST /trendpulse/digest` | `trends:write` |
| `post.trendpulse.fetch` | `POST /trendpulse/fetch` | `trends:write` |
| `post.trendpulse.hooks` | `GET /trendpulse/hooks` | `trends:read` |
| `post.trendpulse.list` | `GET /trendpulse` | `trends:read` |
| `post.trendpulse.list_platform_content` | `GET /trendpulse/platform-content` | `trends:read` |
| `post.trendpulse.performance` | `GET /trendpulse/performance` | `analytics:read` |
| `post.trendpulse.pipeline` | `POST /trendpulse/pipeline` | `schedule:write` |
| `post.trendpulse.refresh` | `POST /trendpulse` | `trends:write` |
| `post.trendpulse.use_platform_content` | `POST /trendpulse/platform-content/use` | `trends:write` |
| `post.video.avatars` | `GET /video/avatars` | `media:read` |
| `post.video.generate` | `POST /video/generate` | `generate:write` |
| `post.video.script` | `POST /video/script` | `generate:write` |
| `post.video.status` | `GET /video/status/:jobId` | `media:read` |
| `post.video.voices` | `GET /video/voices` | `media:read` |
| `post.webhooks.create_outbound` | `POST /webhooks/outbound` | `webhooks:write` |
| `post.webhooks.delete_outbound` | `DELETE /webhooks/outbound/:id` | `webhooks:write` |
| `post.webhooks.list_outbound` | `GET /webhooks/outbound` | `webhooks:read` |
| `post.webhooks.update_outbound` | `PATCH /webhooks/outbound/:id` | `webhooks:write` |
| `post.workspaces.add_member` | `POST /workspaces/:id/members` | `workspaces:write` |
| `post.workspaces.create` | `POST /workspaces` | `workspaces:write` |
| `post.workspaces.list` | `GET /workspaces` | `workspaces:read` |
| `post.workspaces.members` | `GET /workspaces/:id/members` | `workspaces:read` |
| `post.workspaces.remove_member` | `DELETE /workspaces/:id/members` | `workspaces:write` |

---

## Links

- Website — https://www.misarpost.com
- App — https://post.misar.io
- Parent — https://misar.io
- Documentation — https://docs.misar.io/post
- API reference — https://api.misar.io/post/openapi.json
- Source — https://github.com/Misar-AI/misarpost-sdks
- RubyGems — https://rubygems.org/gems/misarpost

MIT © [Misar.AI](https://misar.io)
