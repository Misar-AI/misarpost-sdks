# Changelog

All notable changes to this SDK are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-10-16

First release of `io.misar:misarpost (Maven Central)`.

- Every key-authenticated MisarPost endpoint, generated from `sdks/manifest.json` —
  the same surface in all twelve MisarPost SDKs and the CLI.
- Canonical base URL `https://api.misar.io/post` (also served at `https://post.misar.io/api`).
- Plan refusals (`code: "plan_limit_exceeded"`, HTTP 402) surface as a typed plan-limit
  error carrying the server's upgrade offer; detected by code before the status and never retried.
- Retries for throttles, 5xx and network failures with `Retry-After` support.
- Pagination helper for `?page=` list endpoints and `X-MisarPost-Signature` webhook verification.
