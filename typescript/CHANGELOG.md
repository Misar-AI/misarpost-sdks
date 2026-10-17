# Changelog

All notable changes to this SDK are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-10-16

First release under the canonical name `@misarpost/sdk` (replaces the unpublished
`@misar/social-sdk` draft).

- Every key-authenticated MisarPost endpoint as a method, generated from
  `sdks/manifest.json` — the same surface in all twelve MisarPost SDKs.
- Canonical base URL `https://api.misar.io/post` (the retired `/social` slug is gone).
- `MisarPostPlanLimitError` carries the server's upgrade offer; plan refusals are
  detected by `code: "plan_limit_exceeded"` before the status and are never retried.
- Retries for throttles, 5xx and network failures with `Retry-After` support.
- `paginate()` for `?page=` list endpoints and `verifyWebhookSignature()` for
  `X-MisarPost-Signature`.
