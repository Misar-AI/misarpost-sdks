# SDK Publishing Guide

Everything publishes from the public GitHub mirror,
**[github.com/Misar-AI/misarpost-sdks](https://github.com/Misar-AI/misarpost-sdks)**,
which `.forgejo/workflows/sync-sdks-to-github.yml` populates from this repository on
every push to `main`. The mirror keeps each language at its **root** —
`typescript/`, `go/`, … — not under `sdks/`, and carries `sdks/Package.swift` and
`sdks/.github/workflows/` at its root.

Nothing is published to any registry from this repository or from Forgejo CI.

## How a release happens

1. Bump the version in the SDK's own manifest (`package.json`, `pyproject.toml`,
   `Cargo.toml`, `misarpost.gemspec`, `MisarPost.csproj`, `pom.xml`,
   `build.gradle.kts`, `pubspec.yaml`) — or `sdks/VERSION` for Go, Swift and PHP,
   which have no manifest version — and add a CHANGELOG entry.
2. Merge to `main`. `sdk-tests.yml` already ran every language's tests and the
   `release-hygiene` job ran `scripts/sdk-release-plan.mjs` (refuses a version that
   goes backwards) and `scripts/check-sdk-release.mjs`.
3. The sync pushes the tree to the mirror. On the mirror, `auto-tag.yml` tags
   every SDK whose manifest version changed as `<language>/vX.Y.Z` (plus the
   tag-versioned Go/Swift/PHP riding the fleet version, and a bare `vX.Y.Z` that
   Swift PM needs).
4. `publish.yml` fires on each tag, re-runs `check-sdk-release.mjs` before any
   credential is touched, then publishes that one SDK.

Published versions are permanent — npm's unpublish window is 72 hours, crates.io
and the Go proxy are immutable, Maven Central has no delete. Bump forward, never
re-tag.

## Tags and registries

| SDK | Tag | Registry | Identifier |
|-----|-----|----------|------------|
| TypeScript | `typescript/v1.0.0` | npm | `@misarpost/sdk` |
| CLI | `cli/v1.0.0` | npm | `@misarpost/cli` |
| Python | `python/v1.0.0` | PyPI (Trusted Publishing) | `misarpost` |
| Rust | `rust/v1.0.0` | crates.io | `misarpost` |
| Ruby | `ruby/v1.0.0` | RubyGems | `misarpost` |
| C# | `csharp/v1.0.0` | NuGet | `MisarPost` |
| Java | `java/v1.0.0` | Maven Central | `io.misar:misarpost` |
| Kotlin | `kotlin/v1.0.0` | Maven Central | `io.misar:misarpost-kotlin` |
| Dart | `dart/v1.0.0` | pub.dev (automated publishing) | `misarpost` |
| Flutter | `flutter/v1.0.0` | pub.dev (automated publishing) | `misarpost_flutter` |
| Go | `go/v1.0.0` | Go module proxy | `github.com/Misar-AI/misarpost-sdks/go` |
| Swift | `v1.0.0` (+ `swift/v1.0.0`) | Swift PM (git tags) | `Misar-AI/misarpost-sdks` |
| PHP | `php/v1.0.0` | Packagist | `misarai/misarpost-php` |

## Go, Swift and PHP

**Go** — the module path is `github.com/Misar-AI/misarpost-sdks/go` with no major
suffix: Go accepts `/vN` only for N ≥ 2 and rejects a `/v1` path as malformed.
The `go/vX.Y.Z` tag on the mirror is the release.

**Swift** — `Package.swift` must sit at the repository root, so the mirror's root
manifest (`sdks/Package.swift`) reaches into `swift/` for its sources. Swift PM
only recognises a bare `vX.Y.Z` tag.

**PHP** — Packagist reads `composer.json` from a repository root and cannot index a
subdirectory. Submit a standalone `Misar-AI/misarpost-php` repository (a
`php/`-only split, as MisarMail does with `misarmail-php`) to Packagist; until
that split exists, `publish.yml`'s PHP job only pokes Packagist.

## Secrets on the mirror

Set on `Misar-AI/misarpost-sdks` → Settings → Secrets → Actions:

| Secret | Used by |
|--------|---------|
| `RELEASE_TOKEN` | `auto-tag.yml` — a PAT; tags pushed with `GITHUB_TOKEN` trigger nothing |
| `NPM_TOKEN` | npm (`@misarpost/sdk`, `@misarpost/cli`) |
| `CARGO_REGISTRY_TOKEN` | crates.io |
| `RUBYGEMS_API_KEY` | RubyGems |
| `NUGET_API_KEY` | NuGet |
| `MAVEN_CENTRAL_USERNAME`, `MAVEN_CENTRAL_PASSWORD` | Maven Central |
| `GPG_PRIVATE_KEY`, `GPG_PASSPHRASE` | Maven Central signing |
| `PACKAGIST_USERNAME`, `PACKAGIST_API_TOKEN` | Packagist re-crawl |

PyPI and pub.dev use OIDC (Trusted Publishing / automated publishing) and need no
stored secret — configure the `release` environment on the mirror instead.

On Forgejo, `sync-sdks-to-github.yml` needs `GH_SYNC_TOKEN` (push access to the
mirror).

## One-time registry setup

- **npm** — org `misarpost`; token with publish access.
- **PyPI** — add the mirror's `publish.yml` as a Trusted Publisher for `misarpost`.
- **crates.io** — sign in with GitHub, generate a token.
- **RubyGems** — the first `gem push` needs email confirmation; MFA is required.
- **pub.dev** — publish `misarpost` before `misarpost_flutter`; enable automated
  publishing from the mirror for both.
- **NuGet** — key scoped to `MisarPost`.
- **Maven Central** — the `io.misar` namespace is already verified (MisarMail,
  MisarReach); add the GPG key if not present.
- **Packagist** — see PHP above.

Publishing accounts (Misar AI/AGENTS.md): `noreply@misar.io` (default) →
`misaraitechnology@gmail.com` → `support@misar.io`.

## MCP server

`@misarpost/mcp` is published from `misar-io/packages/post-mcp-server`, not from
this pipeline. This repository only serves it (`/api/mcp`, `/mcp`).
