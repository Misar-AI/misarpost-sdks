# MisarPost SDKs

Official client SDKs for the [MisarPost](https://api.misar.io/social) API.

This repository is a **mirror**. The source of truth is the MisarPost monorepo
(`sdks/<lang>/`); each language directory here is rsynced to the repository root
so that per-language package managers and tooling can find a manifest where they
expect one. Edit the SDKs upstream, not here.

## Status

Only the TypeScript SDK carries real source today. The other eleven directories
are `Coming soon.` placeholders with no manifest.

| Language   | Source | Registry  | Package (planned)          | Published |
|------------|--------|-----------|----------------------------|-----------|
| typescript | yes    | npm       | see note below             | no        |
| python     | stub   | PyPI      | `misarpost`                | no        |
| rust       | stub   | crates.io | `misarpost`                | no        |
| ruby       | stub   | RubyGems  | `misarpost`                | no        |
| java       | stub   | Maven     | `io.misar:misarpost`       | no        |
| kotlin     | stub   | Maven     | `io.misar:misarpost`       | no        |
| csharp     | stub   | NuGet     | `MisarPost`                | no        |
| dart       | stub   | pub.dev   | `misarpost`                | no        |
| go         | stub   | proxy     | `…/misarpost-sdks/go`      | no        |
| php        | stub   | Packagist | `misarai/misarpost-php`    | no        |
| swift      | stub   | SwiftPM   | `misarpost-swift` (tag)    | no        |
| flutter    | stub   | —         | **not published, see below** | n/a      |

**TypeScript package name is unsettled.** `typescript/package.json` currently
declares `@misar/social-sdk`, while every sibling product publishes as
`@<product>/sdk`. Nothing is published under either name, so this is still free
to change — and npm names cannot be reclaimed once taken.

**There is one Dart package, not two.** `misarpost` is a pure-Dart package that
works from the Dart CLI, a Dart server and Flutter, on Android, iOS, Linux,
macOS and Windows. `flutter/` is mirrored for reference only; there is no
`publish-flutter.yml` and no `misarpost_flutter` package.

## Releasing

`auto-tag.yml` runs on every push to `main`. It tags each SDK whose directory
changed and whose manifest carries a usable `X.Y.Z` version, then **calls** the
matching `publish-<lang>.yml` as a job in the same run.

It calls rather than relying on the tag because a tag pushed with the default
`GITHUB_TOKEN` does not emit a push event — GitHub suppresses those so workflows
cannot retrigger themselves. Relying on `push: tags:` alone is why no publish
workflow had ever run in two sibling repositories.

Releases are gated by the repository variable `SDK_PUBLISH_TARGETS`:

| Value         | Effect                                              |
|---------------|-----------------------------------------------------|
| unset / empty | dry run — reports what it would tag, publishes none  |
| `python,rust` | only those languages                                |
| `all`         | every changed SDK                                   |

It ships unset. Enable one language, confirm it on the registry, then widen.

`go`, `php` and `swift` carry no version manifest — for all three the git tag is
the release — so they are tagged by hand and `split-standalone.yml` mirrors PHP
and Swift to their standalone repositories, which is where Packagist and SwiftPM
can actually see a root manifest.
