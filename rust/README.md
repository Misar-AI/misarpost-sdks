# MisarPost Rust SDK

> Schedule, publish, generate and analyze social content from async Rust.

[![crates.io](https://img.shields.io/crates/v/misarpost)](https://crates.io/crates/misarpost)
[![docs.rs](https://img.shields.io/docsrs/misarpost)](https://docs.rs/misarpost)
[![license](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

**17 resource groups · 102 methods · rustls, no OpenSSL**

MisarPost is the AI social command center: publish to X, LinkedIn, Instagram, Threads, Bluesky, TikTok and more from one API, repurpose long-form content with ContentRipple, research trends with TrendPulse and write in your own voice with PersonaForge.

The resource layer is generated from the API's own route tree, so it always matches the server.

---

## Install

```bash
cargo add misarpost
```

```toml
[dependencies]
misarpost = "1"
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

---

## Authentication

Create an API key at https://post.misar.io/dashboard/api-keys. It starts with `mpk_` and is
sent as `Authorization: Bearer mpk_…`. Each key carries scopes (`posts:read`,
`schedule:write`, `generate:write`, …); a call outside them answers **403** with
`code: "insufficient_scope"`. New keys get every scope unless you narrow them.

```rust
let client = misarpost::Client::new(std::env::var("MISARPOST_API_KEY")?)?;
```

---

## Resources

| Resource | Methods | Scopes |
| --- | --- | --- |
| `client.analytics()` | `stats`, `trends` | `analytics:read` |
| `client.composer()` | `discord_channels`, `hashnode_publications`, `hashnode_tags`, `lemmy_communities`, `listmonk_lists`, `listmonk_templates`, `medium_publications`, `pinterest_boards`, `reddit_flairs`, `skool_groups`, `slack_channels`, `whop_forums` | `connections:read` |
| `client.connections()` | `list`, `plugs`, `update_plugs`, `wordpress_taxonomies` | `connections:read`, `connections:write` |
| `client.contentripple()` | `delete_history`, `feed`, `history`, `parse`, `repurpose`, `schedule`, `update_variants`, `usage` | `posts:write`, `generate:write`, `posts:read`, `schedule:write` |
| `client.drafts()` | `create`, `list` | `posts:write`, `posts:read` |
| `client.generate()` | `create`, `enhance`, `hashtags`, `image`, `optimize`, `plan` | `generate:write` |
| `client.growth()` | `next_opportunity`, `opportunities`, `overview`, `playbooks` | `analytics:read` |
| `client.media()` | `delete`, `list` | `media:write`, `media:read` |
| `client.notifications()` | `list`, `read_all`, `update` | `notifications:read`, `notifications:write` |
| `client.personaforge()` | `approve_replies`, `bio`, `create_competitors`, `create_persona`, `create_replies`, `create_voice`, `delete_persona`, `generate`, `get_persona`, `get_voice`, `list_competitors`, `list_personas`, `list_replies`, `persona_status`, `update_persona` | `personas:write`, `generate:write`, `personas:read` |
| `client.posts()` | `calendar`, `cancel`, `delete`, `list`, `reply`, `revert`, `revert_batch`, `schedule`, `share`, `unshare`, `update` | `posts:read`, `posts:write`, `schedule:write` |
| `client.post_tags()` | `create`, `delete`, `list`, `update` | `posts:write`, `posts:read` |
| `client.post_templates()` | `create`, `delete`, `get`, `list`, `update` | `posts:write`, `posts:read` |
| `client.trendpulse()` | `create_platform_content`, `digest`, `fetch`, `hooks`, `list`, `list_platform_content`, `performance`, `pipeline`, `refresh`, `use_platform_content` | `trends:write`, `trends:read`, `analytics:read`, `schedule:write` |
| `client.video()` | `avatars`, `generate`, `script`, `status`, `voices` | `media:read`, `generate:write` |
| `client.webhooks()` | `create_outbound`, `delete_outbound`, `list_outbound`, `update_outbound` | `webhooks:write`, `webhooks:read` |
| `client.workspaces()` | `add_member`, `create`, `list`, `members`, `remove_member` | `workspaces:write`, `workspaces:read` |

Methods take path parameters as `&str`, then `body: Option<Value>` (when the endpoint reads one), then `query: Option<&Query>`, and return `Result<serde_json::Value>`.

---

## Client

| Thing | Detail |
| --- | --- |
| Entry point | `Client::new(key)` or `Client::builder(key).base_url(…).max_retries(3).timeout(…).build()` |
| Base URL | `https://api.misar.io/post` (also served at `https://post.misar.io/api`) |
| Transport | `reqwest` with rustls |
| Retried | `429` throttles, `500`, `502`, `503`, `504` and network failures — exponential backoff from 200 ms honouring `Retry-After` |
| Never retried | Plan refusals (`MisarPostError::PlanLimit`) |
| Errors | `MisarPostError::{Api, PlanLimit, Network, Json, MissingApiKey}` |
| Also exported | `paginate`, `verify_webhook_signature`, `Client::request` |

---

## Quick start

```rust
use serde_json::json;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = misarpost::Client::new("mpk_your_key")?;

    let accounts = client.connections().list(None).await?;
    client.generate().create(Some(json!({ "prompt": "Announce our v2 launch", "platforms": ["linkedin"] })), None).await?;
    client.posts().schedule(Some(json!({
        "accountIds": [accounts["accounts"][0]["id"]],
        "content": "We just shipped v2",
        "scheduledAt": "2026-11-01T09:00:00Z"
    })), None).await?;
    Ok(())
}
```

## Pagination

```rust
let pages = misarpost::paginate(|page| {
    let client = &client;
    async move {
        let mut q = misarpost::Query::new();
        q.insert("status".into(), "queued".into());
        q.insert("page".into(), page.to_string());
        client.posts().list(Some(&q)).await
    }
}, None).await?;
```

## Plan limits

When a monthly allowance is spent, or a feature is not on the plan, the API answers
**402** with `code: "plan_limit_exceeded"` and an `upgrade` offer. The SDK detects the
code before it looks at the status, returns `MisarPostError::PlanLimit`, and **never
retries it**. All copy comes from the server.

```rust
match client.generate().enhance(Some(json!({ "content": "…" })), None).await {
    Err(misarpost::MisarPostError::PlanLimit { offer, upgrade_url, retry_after, .. }) => {
        println!("{}", offer.unwrap_or_default()["headline"]);
        println!("Upgrade: {upgrade_url:?}, resets in {retry_after:?}s");
    }
    other => { other?; }
}
```

## Webhooks

```rust
let ok = misarpost::verify_webhook_signature(&secret, &raw_body, signature_header);
```

## Method reference

| Call | HTTP | Scope |
| --- | --- | --- |
| `client.analytics().stats(…)` | `GET /stats` | `analytics:read` |
| `client.analytics().trends(…)` | `GET /analytics/trends` | `analytics:read` |
| `client.composer().discord_channels(…)` | `GET /composer/discord/channels` | `connections:read` |
| `client.composer().hashnode_publications(…)` | `GET /composer/hashnode/publications` | `connections:read` |
| `client.composer().hashnode_tags(…)` | `GET /composer/hashnode/tags` | `connections:read` |
| `client.composer().lemmy_communities(…)` | `GET /composer/lemmy/communities` | `connections:read` |
| `client.composer().listmonk_lists(…)` | `GET /composer/listmonk/lists` | `connections:read` |
| `client.composer().listmonk_templates(…)` | `GET /composer/listmonk/templates` | `connections:read` |
| `client.composer().medium_publications(…)` | `GET /composer/medium/publications` | `connections:read` |
| `client.composer().pinterest_boards(…)` | `GET /composer/pinterest/boards` | `connections:read` |
| `client.composer().reddit_flairs(…)` | `GET /composer/reddit/flairs` | `connections:read` |
| `client.composer().skool_groups(…)` | `GET /composer/skool/groups` | `connections:read` |
| `client.composer().slack_channels(…)` | `GET /composer/slack/channels` | `connections:read` |
| `client.composer().whop_forums(…)` | `GET /composer/whop/forums` | `connections:read` |
| `client.connections().list(…)` | `GET /connections` | `connections:read` |
| `client.connections().plugs(…)` | `GET /connections/:accountId/plugs` | `connections:read` |
| `client.connections().update_plugs(…)` | `PATCH /connections/:accountId/plugs` | `connections:write` |
| `client.connections().wordpress_taxonomies(…)` | `GET /connections/:accountId/wordpress-taxonomies` | `connections:read` |
| `client.contentripple().delete_history(…)` | `DELETE /contentripple/history` | `posts:write` |
| `client.contentripple().feed(…)` | `POST /contentripple/feed` | `generate:write` |
| `client.contentripple().history(…)` | `GET /contentripple/history` | `posts:read` |
| `client.contentripple().parse(…)` | `POST /contentripple/parse` | `generate:write` |
| `client.contentripple().repurpose(…)` | `POST /contentripple` | `generate:write` |
| `client.contentripple().schedule(…)` | `POST /contentripple/schedule` | `schedule:write` |
| `client.contentripple().update_variants(…)` | `PATCH /contentripple/variants` | `posts:write` |
| `client.contentripple().usage(…)` | `GET /contentripple` | `posts:read` |
| `client.drafts().create(…)` | `POST /drafts` | `posts:write` |
| `client.drafts().list(…)` | `GET /drafts` | `posts:read` |
| `client.generate().create(…)` | `POST /generate` | `generate:write` |
| `client.generate().enhance(…)` | `POST /generate/enhance` | `generate:write` |
| `client.generate().hashtags(…)` | `POST /generate/hashtags` | `generate:write` |
| `client.generate().image(…)` | `POST /generate/image` | `generate:write` |
| `client.generate().optimize(…)` | `GET /generate/optimize` | `generate:write` |
| `client.generate().plan(…)` | `POST /generate/plan` | `generate:write` |
| `client.growth().next_opportunity(…)` | `GET /growth/next-opportunity` | `analytics:read` |
| `client.growth().opportunities(…)` | `GET /growth/opportunities` | `analytics:read` |
| `client.growth().overview(…)` | `GET /growth/overview` | `analytics:read` |
| `client.growth().playbooks(…)` | `GET /growth/playbooks` | `analytics:read` |
| `client.media().delete(…)` | `DELETE /media/:id` | `media:write` |
| `client.media().list(…)` | `GET /media` | `media:read` |
| `client.notifications().list(…)` | `GET /notifications` | `notifications:read` |
| `client.notifications().read_all(…)` | `POST /notifications/read-all` | `notifications:write` |
| `client.notifications().update(…)` | `PATCH /notifications/:id` | `notifications:write` |
| `client.personaforge().approve_replies(…)` | `POST /personaforge/replies/approve` | `personas:write` |
| `client.personaforge().bio(…)` | `POST /personaforge/bio` | `generate:write` |
| `client.personaforge().create_competitors(…)` | `POST /personaforge/competitors` | `personas:write` |
| `client.personaforge().create_persona(…)` | `POST /personaforge/personas` | `personas:write` |
| `client.personaforge().create_replies(…)` | `POST /personaforge/replies` | `personas:write` |
| `client.personaforge().create_voice(…)` | `POST /personaforge/voice` | `personas:write` |
| `client.personaforge().delete_persona(…)` | `DELETE /personaforge/personas/:id` | `personas:write` |
| `client.personaforge().generate(…)` | `POST /personaforge/generate` | `generate:write` |
| `client.personaforge().get_persona(…)` | `GET /personaforge/personas/:id` | `personas:read` |
| `client.personaforge().get_voice(…)` | `GET /personaforge/voice` | `personas:read` |
| `client.personaforge().list_competitors(…)` | `GET /personaforge/competitors` | `personas:read` |
| `client.personaforge().list_personas(…)` | `GET /personaforge/personas` | `personas:read` |
| `client.personaforge().list_replies(…)` | `GET /personaforge/replies` | `personas:read` |
| `client.personaforge().persona_status(…)` | `GET /personaforge/personas/status/:jobId` | `personas:read` |
| `client.personaforge().update_persona(…)` | `PATCH /personaforge/personas/:id` | `personas:write` |
| `client.posts().calendar(…)` | `GET /calendar` | `posts:read` |
| `client.posts().cancel(…)` | `DELETE /posts` | `posts:write` |
| `client.posts().delete(…)` | `DELETE /posts/:id` | `posts:write` |
| `client.posts().list(…)` | `GET /posts` | `posts:read` |
| `client.posts().reply(…)` | `POST /posts/:id/reply` | `posts:write` |
| `client.posts().revert(…)` | `POST /posts/:id/revert` | `posts:write` |
| `client.posts().revert_batch(…)` | `POST /posts/revert-batch` | `posts:write` |
| `client.posts().schedule(…)` | `POST /schedule` | `schedule:write` |
| `client.posts().share(…)` | `POST /posts/:id/share` | `posts:write` |
| `client.posts().unshare(…)` | `DELETE /posts/:id/share` | `posts:write` |
| `client.posts().update(…)` | `PATCH /posts/:id` | `posts:write` |
| `client.post_tags().create(…)` | `POST /post-tags` | `posts:write` |
| `client.post_tags().delete(…)` | `DELETE /post-tags/:id` | `posts:write` |
| `client.post_tags().list(…)` | `GET /post-tags` | `posts:read` |
| `client.post_tags().update(…)` | `PATCH /post-tags/:id` | `posts:write` |
| `client.post_templates().create(…)` | `POST /post-templates` | `posts:write` |
| `client.post_templates().delete(…)` | `DELETE /post-templates/:id` | `posts:write` |
| `client.post_templates().get(…)` | `GET /post-templates/:id` | `posts:read` |
| `client.post_templates().list(…)` | `GET /post-templates` | `posts:read` |
| `client.post_templates().update(…)` | `PATCH /post-templates/:id` | `posts:write` |
| `client.trendpulse().create_platform_content(…)` | `POST /trendpulse/platform-content` | `trends:write` |
| `client.trendpulse().digest(…)` | `POST /trendpulse/digest` | `trends:write` |
| `client.trendpulse().fetch(…)` | `POST /trendpulse/fetch` | `trends:write` |
| `client.trendpulse().hooks(…)` | `GET /trendpulse/hooks` | `trends:read` |
| `client.trendpulse().list(…)` | `GET /trendpulse` | `trends:read` |
| `client.trendpulse().list_platform_content(…)` | `GET /trendpulse/platform-content` | `trends:read` |
| `client.trendpulse().performance(…)` | `GET /trendpulse/performance` | `analytics:read` |
| `client.trendpulse().pipeline(…)` | `POST /trendpulse/pipeline` | `schedule:write` |
| `client.trendpulse().refresh(…)` | `POST /trendpulse` | `trends:write` |
| `client.trendpulse().use_platform_content(…)` | `POST /trendpulse/platform-content/use` | `trends:write` |
| `client.video().avatars(…)` | `GET /video/avatars` | `media:read` |
| `client.video().generate(…)` | `POST /video/generate` | `generate:write` |
| `client.video().script(…)` | `POST /video/script` | `generate:write` |
| `client.video().status(…)` | `GET /video/status/:jobId` | `media:read` |
| `client.video().voices(…)` | `GET /video/voices` | `media:read` |
| `client.webhooks().create_outbound(…)` | `POST /webhooks/outbound` | `webhooks:write` |
| `client.webhooks().delete_outbound(…)` | `DELETE /webhooks/outbound/:id` | `webhooks:write` |
| `client.webhooks().list_outbound(…)` | `GET /webhooks/outbound` | `webhooks:read` |
| `client.webhooks().update_outbound(…)` | `PATCH /webhooks/outbound/:id` | `webhooks:write` |
| `client.workspaces().add_member(…)` | `POST /workspaces/:id/members` | `workspaces:write` |
| `client.workspaces().create(…)` | `POST /workspaces` | `workspaces:write` |
| `client.workspaces().list(…)` | `GET /workspaces` | `workspaces:read` |
| `client.workspaces().members(…)` | `GET /workspaces/:id/members` | `workspaces:read` |
| `client.workspaces().remove_member(…)` | `DELETE /workspaces/:id/members` | `workspaces:write` |

---

## Links

- Website — https://www.misarpost.com
- App — https://post.misar.io
- Parent — https://misar.io
- Documentation — https://docs.misar.io/post
- API reference — https://api.misar.io/post/openapi.json
- Source — https://github.com/Misar-AI/misarpost-sdks
- crates.io — https://crates.io/crates/misarpost

MIT © [Misar.AI](https://misar.io)
