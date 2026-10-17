# MisarPost SDKs

Official client libraries for the [MisarPost](https://www.misarpost.com) API —
publishing and scheduling across every connected channel, AI generation and
ContentRipple repurposing, TrendPulse, PersonaForge, analytics and workspaces.

Every SDK covers the full key-authenticated API surface — **102 methods across
17 resource groups**, generated from `sdks/manifest.json`, which is itself
generated from the API's route tree (`scripts/sync-sdk-manifest.mjs`). They
speak only HTTPS and authenticate with a MisarPost API key (`mpk_…`) sent as
`Authorization: Bearer` — create one at
[post.misar.io/dashboard/api-keys](https://post.misar.io/dashboard/api-keys).

Base URL: `https://api.misar.io/post` (dual-served at `https://post.misar.io/api`).

## Install

| Language | Registry | Package |
|---|---|---|
| TypeScript / JavaScript | npm | `@misarpost/sdk` |
| CLI | npm | `@misarpost/cli` (bin `misarpost`) |
| Python | PyPI | `misarpost` |
| Go | module proxy | `github.com/Misar-AI/misarpost-sdks/go` |
| Rust | crates.io | `misarpost` |
| Java | Maven Central | `io.misar:misarpost` |
| Kotlin | Maven Central | `io.misar:misarpost-kotlin` |
| Swift | Swift PM | `https://github.com/Misar-AI/misarpost-sdks` (product `MisarPost`) |
| Ruby | RubyGems | `misarpost` |
| PHP | Packagist | `misarai/misarpost-php` |
| C# / .NET | NuGet | `MisarPost` |
| Dart | pub.dev | `misarpost` |
| Flutter | pub.dev | `misarpost_flutter` |

Each language directory has its own README with install, authentication, the
resource table, quick start, pagination, plan limits and webhooks for that SDK.

## Quick start

```ts
import { MisarPostClient } from "@misarpost/sdk";

const post = new MisarPostClient(process.env.MISARPOST_API_KEY!);
const { posts } = await post.posts.list<{ posts: unknown[] }>({ status: "queued" });
```

## Shared behaviour

- **Scopes** — each method needs one API-key scope (listed per method in every
  README and as `x-misarpost-scope` in the OpenAPI document). A missing scope
  answers `403` with `code: "insufficient_scope"`.
- **Plan limits** — a spent monthly allowance or a locked feature answers `402`
  with `code: "plan_limit_exceeded"` and an upgrade offer. Every SDK detects it by
  code before the status, raises a typed plan-limit error carrying the offer, and
  never retries it.
- **Retries** — `429` throttles, `500/502/503/504` and network failures, with
  exponential backoff from 200 ms honouring `Retry-After`.
- **Pagination** — a helper per language walks `?page=` until `totalPages`.
- **Webhooks** — `X-MisarPost-Signature: sha256=<hex>` (HMAC-SHA256 of the raw body
  with the endpoint's `mpwh_` secret) verification in every SDK.

## Development

```bash
pnpm sdk:sync    # manifest → generated SDK layers + READMEs → OpenAPI
pnpm sdk:check   # the CI gates: drift, 100% coverage, lockfiles, release readiness
```

Only the generated directories and READMEs are written by the generator; each
language's core is hand-written. Releases: see [PUBLISHING.md](./PUBLISHING.md).

## Links

- Documentation — https://docs.misar.io/post
- OpenAPI — https://api.misar.io/post/openapi.json
- MCP server — https://api.misar.io/post/mcp (`npx -y @misarpost/mcp`)
- Source mirror — https://github.com/Misar-AI/misarpost-sdks
