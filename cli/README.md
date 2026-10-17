# MisarPost CLI

> Schedule, publish, generate and analyze social content from your terminal — every MisarPost API endpoint as a command.

[![npm](https://img.shields.io/npm/v/@misarpost/cli)](https://www.npmjs.com/package/@misarpost/cli)
[![license](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

**17 resource groups · 102 commands · zero dependencies**

MisarPost is the AI social command center: publish to X, LinkedIn, Instagram, Threads, Bluesky, TikTok and more from one API, repurpose long-form content with ContentRipple, research trends with TrendPulse and write in your own voice with PersonaForge.

The command table is generated from the API's own route tree, so the CLI always matches the server.

---

## Install

### npm

```bash
npm install -g @misarpost/cli
```

### npx

```bash
npx @misarpost/cli help
```

---

## Authentication

Create an API key at https://post.misar.io/dashboard/api-keys. It starts with `mpk_` and is
sent as `Authorization: Bearer mpk_…`. Each key carries scopes (`posts:read`,
`schedule:write`, `generate:write`, …); a call outside them answers **403** with
`code: "insufficient_scope"`.

```bash
misarpost login --key mpk_your_key   # stored in ~/.misarpost/config.json (0600), shared with the MCP server
misarpost whoami
```

Key precedence: `--api-key` → `MISARPOST_API_KEY` → config file. Base URL: `--base-url` → `MISARPOST_BASE_URL` → config → `https://api.misar.io/post`.

---

## Resources

Every command, its HTTP route and the scope a key needs:

| Call | HTTP | Scope |
| --- | --- | --- |
| `misarpost analytics stats` | `GET /stats` | `analytics:read` |
| `misarpost analytics trends` | `GET /analytics/trends` | `analytics:read` |
| `misarpost composer discord-channels` | `GET /composer/discord/channels` | `connections:read` |
| `misarpost composer hashnode-publications` | `GET /composer/hashnode/publications` | `connections:read` |
| `misarpost composer hashnode-tags` | `GET /composer/hashnode/tags` | `connections:read` |
| `misarpost composer lemmy-communities` | `GET /composer/lemmy/communities` | `connections:read` |
| `misarpost composer listmonk-lists` | `GET /composer/listmonk/lists` | `connections:read` |
| `misarpost composer listmonk-templates` | `GET /composer/listmonk/templates` | `connections:read` |
| `misarpost composer medium-publications` | `GET /composer/medium/publications` | `connections:read` |
| `misarpost composer pinterest-boards` | `GET /composer/pinterest/boards` | `connections:read` |
| `misarpost composer reddit-flairs` | `GET /composer/reddit/flairs` | `connections:read` |
| `misarpost composer skool-groups` | `GET /composer/skool/groups` | `connections:read` |
| `misarpost composer slack-channels` | `GET /composer/slack/channels` | `connections:read` |
| `misarpost composer whop-forums` | `GET /composer/whop/forums` | `connections:read` |
| `misarpost connections list` | `GET /connections` | `connections:read` |
| `misarpost connections plugs <accountId>` | `GET /connections/:accountId/plugs` | `connections:read` |
| `misarpost connections update-plugs <accountId> --body '{…}'` | `PATCH /connections/:accountId/plugs` | `connections:write` |
| `misarpost connections wordpress-taxonomies <accountId>` | `GET /connections/:accountId/wordpress-taxonomies` | `connections:read` |
| `misarpost contentripple delete-history --body '{…}'` | `DELETE /contentripple/history` | `posts:write` |
| `misarpost contentripple feed --body '{…}'` | `POST /contentripple/feed` | `generate:write` |
| `misarpost contentripple history` | `GET /contentripple/history` | `posts:read` |
| `misarpost contentripple parse --body '{…}'` | `POST /contentripple/parse` | `generate:write` |
| `misarpost contentripple repurpose --body '{…}'` | `POST /contentripple` | `generate:write` |
| `misarpost contentripple schedule --body '{…}'` | `POST /contentripple/schedule` | `schedule:write` |
| `misarpost contentripple update-variants --body '{…}'` | `PATCH /contentripple/variants` | `posts:write` |
| `misarpost contentripple usage` | `GET /contentripple` | `posts:read` |
| `misarpost drafts create --body '{…}'` | `POST /drafts` | `posts:write` |
| `misarpost drafts list` | `GET /drafts` | `posts:read` |
| `misarpost generate create --body '{…}'` | `POST /generate` | `generate:write` |
| `misarpost generate enhance --body '{…}'` | `POST /generate/enhance` | `generate:write` |
| `misarpost generate hashtags --body '{…}'` | `POST /generate/hashtags` | `generate:write` |
| `misarpost generate image --body '{…}'` | `POST /generate/image` | `generate:write` |
| `misarpost generate optimize` | `GET /generate/optimize` | `generate:write` |
| `misarpost generate plan --body '{…}'` | `POST /generate/plan` | `generate:write` |
| `misarpost growth next-opportunity` | `GET /growth/next-opportunity` | `analytics:read` |
| `misarpost growth opportunities` | `GET /growth/opportunities` | `analytics:read` |
| `misarpost growth overview` | `GET /growth/overview` | `analytics:read` |
| `misarpost growth playbooks` | `GET /growth/playbooks` | `analytics:read` |
| `misarpost media delete <id>` | `DELETE /media/:id` | `media:write` |
| `misarpost media list` | `GET /media` | `media:read` |
| `misarpost notifications list` | `GET /notifications` | `notifications:read` |
| `misarpost notifications read-all` | `POST /notifications/read-all` | `notifications:write` |
| `misarpost notifications update <id>` | `PATCH /notifications/:id` | `notifications:write` |
| `misarpost personaforge approve-replies --body '{…}'` | `POST /personaforge/replies/approve` | `personas:write` |
| `misarpost personaforge bio --body '{…}'` | `POST /personaforge/bio` | `generate:write` |
| `misarpost personaforge create-competitors --body '{…}'` | `POST /personaforge/competitors` | `personas:write` |
| `misarpost personaforge create-persona --body '{…}'` | `POST /personaforge/personas` | `personas:write` |
| `misarpost personaforge create-replies --body '{…}'` | `POST /personaforge/replies` | `personas:write` |
| `misarpost personaforge create-voice` | `POST /personaforge/voice` | `personas:write` |
| `misarpost personaforge delete-persona <id>` | `DELETE /personaforge/personas/:id` | `personas:write` |
| `misarpost personaforge generate --body '{…}'` | `POST /personaforge/generate` | `generate:write` |
| `misarpost personaforge get-persona <id>` | `GET /personaforge/personas/:id` | `personas:read` |
| `misarpost personaforge get-voice` | `GET /personaforge/voice` | `personas:read` |
| `misarpost personaforge list-competitors` | `GET /personaforge/competitors` | `personas:read` |
| `misarpost personaforge list-personas` | `GET /personaforge/personas` | `personas:read` |
| `misarpost personaforge list-replies` | `GET /personaforge/replies` | `personas:read` |
| `misarpost personaforge persona-status <jobId>` | `GET /personaforge/personas/status/:jobId` | `personas:read` |
| `misarpost personaforge update-persona <id> --body '{…}'` | `PATCH /personaforge/personas/:id` | `personas:write` |
| `misarpost posts calendar` | `GET /calendar` | `posts:read` |
| `misarpost posts cancel --body '{…}'` | `DELETE /posts` | `posts:write` |
| `misarpost posts delete <id>` | `DELETE /posts/:id` | `posts:write` |
| `misarpost posts list` | `GET /posts` | `posts:read` |
| `misarpost posts reply <id> --body '{…}'` | `POST /posts/:id/reply` | `posts:write` |
| `misarpost posts revert <id>` | `POST /posts/:id/revert` | `posts:write` |
| `misarpost posts revert-batch --body '{…}'` | `POST /posts/revert-batch` | `posts:write` |
| `misarpost posts schedule --body '{…}'` | `POST /schedule` | `schedule:write` |
| `misarpost posts share <id>` | `POST /posts/:id/share` | `posts:write` |
| `misarpost posts unshare <id>` | `DELETE /posts/:id/share` | `posts:write` |
| `misarpost posts update <id> --body '{…}'` | `PATCH /posts/:id` | `posts:write` |
| `misarpost post-tags create --body '{…}'` | `POST /post-tags` | `posts:write` |
| `misarpost post-tags delete <id>` | `DELETE /post-tags/:id` | `posts:write` |
| `misarpost post-tags list` | `GET /post-tags` | `posts:read` |
| `misarpost post-tags update <id> --body '{…}'` | `PATCH /post-tags/:id` | `posts:write` |
| `misarpost post-templates create --body '{…}'` | `POST /post-templates` | `posts:write` |
| `misarpost post-templates delete <id>` | `DELETE /post-templates/:id` | `posts:write` |
| `misarpost post-templates get <id>` | `GET /post-templates/:id` | `posts:read` |
| `misarpost post-templates list` | `GET /post-templates` | `posts:read` |
| `misarpost post-templates update <id> --body '{…}'` | `PATCH /post-templates/:id` | `posts:write` |
| `misarpost trendpulse create-platform-content --body '{…}'` | `POST /trendpulse/platform-content` | `trends:write` |
| `misarpost trendpulse digest` | `POST /trendpulse/digest` | `trends:write` |
| `misarpost trendpulse fetch` | `POST /trendpulse/fetch` | `trends:write` |
| `misarpost trendpulse hooks` | `GET /trendpulse/hooks` | `trends:read` |
| `misarpost trendpulse list` | `GET /trendpulse` | `trends:read` |
| `misarpost trendpulse list-platform-content` | `GET /trendpulse/platform-content` | `trends:read` |
| `misarpost trendpulse performance` | `GET /trendpulse/performance` | `analytics:read` |
| `misarpost trendpulse pipeline --body '{…}'` | `POST /trendpulse/pipeline` | `schedule:write` |
| `misarpost trendpulse refresh --body '{…}'` | `POST /trendpulse` | `trends:write` |
| `misarpost trendpulse use-platform-content --body '{…}'` | `POST /trendpulse/platform-content/use` | `trends:write` |
| `misarpost video avatars` | `GET /video/avatars` | `media:read` |
| `misarpost video generate --body '{…}'` | `POST /video/generate` | `generate:write` |
| `misarpost video script --body '{…}'` | `POST /video/script` | `generate:write` |
| `misarpost video status <jobId>` | `GET /video/status/:jobId` | `media:read` |
| `misarpost video voices` | `GET /video/voices` | `media:read` |
| `misarpost webhooks create-outbound --body '{…}'` | `POST /webhooks/outbound` | `webhooks:write` |
| `misarpost webhooks delete-outbound <id>` | `DELETE /webhooks/outbound/:id` | `webhooks:write` |
| `misarpost webhooks list-outbound` | `GET /webhooks/outbound` | `webhooks:read` |
| `misarpost webhooks update-outbound <id> --body '{…}'` | `PATCH /webhooks/outbound/:id` | `webhooks:write` |
| `misarpost workspaces add-member <id> --body '{…}'` | `POST /workspaces/:id/members` | `workspaces:write` |
| `misarpost workspaces create --body '{…}'` | `POST /workspaces` | `workspaces:write` |
| `misarpost workspaces list` | `GET /workspaces` | `workspaces:read` |
| `misarpost workspaces members <id>` | `GET /workspaces/:id/members` | `workspaces:read` |
| `misarpost workspaces remove-member <id> <memberId>` | `DELETE /workspaces/:id/members` | `workspaces:write` |

---

## Client

| Thing | Detail |
| --- | --- |
| Entry point | `misarpost <resource> <command> [args…] [--body JSON-or-@file.json] [--query k=v …] [--all-pages] [--json]` |
| Base URL | `https://api.misar.io/post` (also served at `https://post.misar.io/api`) |
| Transport | Node 18+ built-in `fetch` |
| Retried | `429` throttles, `500`, `502`, `503`, `504` and network failures — exponential backoff from 200 ms honouring `Retry-After` |
| Never retried | Plan refusals |
| Exit codes | `0` ok · `1` API error · `2` plan limit · `64` usage |

---

## Quick start

```bash
misarpost connections list
misarpost generate create --body '{"prompt":"Announce our v2 launch","platforms":["linkedin"]}'
misarpost posts schedule --body @post.json
misarpost posts list --query status=queued --all-pages
```

## Pagination

`--all-pages` on any `GET` command walks `?page=` until the server's `totalPages` and prints every page.

## Plan limits

When a monthly allowance is spent, or a feature is not on the plan, the API answers
**402** with `code: "plan_limit_exceeded"` and an upgrade offer. The CLI prints an upgrade
card (headline, usage, plans, call to action, pricing link — all from the server), exits
with code `2`, and **never retries it**.

## Webhooks

```bash
misarpost webhooks verify --secret mpwh_… --signature 'sha256=…' --file body.json
```

Checks the `X-MisarPost-Signature` header (HMAC-SHA256 of the raw body) in constant time.

---

## Links

- Website — https://www.misarpost.com
- App — https://post.misar.io
- Parent — https://misar.io
- Documentation — https://docs.misar.io/post
- API reference — https://api.misar.io/post/openapi.json
- Source — https://github.com/Misar-AI/misarpost-sdks
- npm — https://www.npmjs.com/package/@misarpost/cli

MIT © [Misar.AI](https://misar.io)
