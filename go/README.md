# MisarPost Go SDK

> Schedule, publish, generate and analyze social content from Go — standard library only.

[![Go Reference](https://pkg.go.dev/badge/github.com/Misar-AI/misarpost-sdks/go.svg)](https://pkg.go.dev/github.com/Misar-AI/misarpost-sdks/go/misarpost)
[![license](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

**17 resource groups · 102 methods · zero dependencies**

MisarPost is the AI social command center: publish to X, LinkedIn, Instagram, Threads, Bluesky, TikTok and more from one API, repurpose long-form content with ContentRipple, research trends with TrendPulse and write in your own voice with PersonaForge.

The resource layer is generated from the API's own route tree, so it always matches the server. Every call takes a `context.Context`.

---

## Install

```bash
go get github.com/Misar-AI/misarpost-sdks/go
```

```go
import "github.com/Misar-AI/misarpost-sdks/go/misarpost"
```

---

## Authentication

Create an API key at https://post.misar.io/dashboard/api-keys. It starts with `mpk_` and is
sent as `Authorization: Bearer mpk_…`. Each key carries scopes (`posts:read`,
`schedule:write`, `generate:write`, …); a call outside them answers **403** with
`code: "insufficient_scope"`. New keys get every scope unless you narrow them.

```go
client, err := misarpost.NewClient(os.Getenv("MISARPOST_API_KEY"))
```

---

## Resources

| Resource | Methods | Scopes |
| --- | --- | --- |
| `client.Analytics` | `Stats`, `Trends` | `analytics:read` |
| `client.Composer` | `DiscordChannels`, `HashnodePublications`, `HashnodeTags`, `LemmyCommunities`, `ListmonkLists`, `ListmonkTemplates`, `MediumPublications`, `PinterestBoards`, `RedditFlairs`, `SkoolGroups`, `SlackChannels`, `WhopForums` | `connections:read` |
| `client.Connections` | `List`, `Plugs`, `UpdatePlugs`, `WordpressTaxonomies` | `connections:read`, `connections:write` |
| `client.Contentripple` | `DeleteHistory`, `Feed`, `History`, `Parse`, `Repurpose`, `Schedule`, `UpdateVariants`, `Usage` | `posts:write`, `generate:write`, `posts:read`, `schedule:write` |
| `client.Drafts` | `Create`, `List` | `posts:write`, `posts:read` |
| `client.Generate` | `Create`, `Enhance`, `Hashtags`, `Image`, `Optimize`, `Plan` | `generate:write` |
| `client.Growth` | `NextOpportunity`, `Opportunities`, `Overview`, `Playbooks` | `analytics:read` |
| `client.Media` | `Delete`, `List` | `media:write`, `media:read` |
| `client.Notifications` | `List`, `ReadAll`, `Update` | `notifications:read`, `notifications:write` |
| `client.Personaforge` | `ApproveReplies`, `Bio`, `CreateCompetitors`, `CreatePersona`, `CreateReplies`, `CreateVoice`, `DeletePersona`, `Generate`, `GetPersona`, `GetVoice`, `ListCompetitors`, `ListPersonas`, `ListReplies`, `PersonaStatus`, `UpdatePersona` | `personas:write`, `generate:write`, `personas:read` |
| `client.Posts` | `Calendar`, `Cancel`, `Delete`, `List`, `Reply`, `Revert`, `RevertBatch`, `Schedule`, `Share`, `Unshare`, `Update` | `posts:read`, `posts:write`, `schedule:write` |
| `client.PostTags` | `Create`, `Delete`, `List`, `Update` | `posts:write`, `posts:read` |
| `client.PostTemplates` | `Create`, `Delete`, `Get`, `List`, `Update` | `posts:write`, `posts:read` |
| `client.Trendpulse` | `CreatePlatformContent`, `Digest`, `Fetch`, `Hooks`, `List`, `ListPlatformContent`, `Performance`, `Pipeline`, `Refresh`, `UsePlatformContent` | `trends:write`, `trends:read`, `analytics:read`, `schedule:write` |
| `client.Video` | `Avatars`, `Generate`, `Script`, `Status`, `Voices` | `media:read`, `generate:write` |
| `client.Webhooks` | `CreateOutbound`, `DeleteOutbound`, `ListOutbound`, `UpdateOutbound` | `webhooks:write`, `webhooks:read` |
| `client.Workspaces` | `AddMember`, `Create`, `List`, `Members`, `RemoveMember` | `workspaces:write`, `workspaces:read` |

Every method takes `ctx`, then path parameters, then `body map[string]any` (when the endpoint reads one), then `query map[string]string` (may be nil), and returns `(map[string]any, error)`.

---

## Client

| Thing | Detail |
| --- | --- |
| Entry point | `misarpost.NewClient(apiKey, misarpost.WithBaseURL(…), misarpost.WithMaxRetries(3), misarpost.WithTimeout(30*time.Second), misarpost.WithHTTPClient(h))` |
| Base URL | `https://api.misar.io/post` (also served at `https://post.misar.io/api`) |
| Transport | `net/http` |
| Retried | `429` throttles, `500`, `502`, `503`, `504` and network failures — exponential backoff from 200 ms honouring `Retry-After` |
| Never retried | Plan refusals (`*misarpost.PlanLimitError`) |
| Errors | `*misarpost.Error`, `*misarpost.NetworkError`, `*misarpost.PlanLimitError` |
| Also exported | `misarpost.Paginate`, `misarpost.VerifyWebhookSignature`, `client.Do` |

---

## Quick start

```go
ctx := context.Background()
client, _ := misarpost.NewClient("mpk_your_key")

accounts, err := client.Connections.List(ctx, nil)
if err != nil {
	log.Fatal(err)
}
_, err = client.Generate.Create(ctx, map[string]any{"prompt": "Announce our v2 launch", "platforms": []string{"linkedin"}}, nil)
_, err = client.Posts.Schedule(ctx, map[string]any{
	"accountIds":  []string{"<account id>"},
	"content":     "We just shipped v2",
	"scheduledAt": "2026-11-01T09:00:00Z",
}, nil)
_ = accounts
```

## Pagination

```go
err := misarpost.Paginate(ctx, func(ctx context.Context, page int) (map[string]any, error) {
	return client.Posts.List(ctx, map[string]string{"status": "queued", "page": strconv.Itoa(page)})
}, func(page map[string]any) bool {
	fmt.Println(page["posts"])
	return true
})
```

## Plan limits

When a monthly allowance is spent, or a feature is not on the plan, the API answers
**402** with `code: "plan_limit_exceeded"` and an `upgrade` offer. The SDK detects the
code before it looks at the status, returns `*misarpost.PlanLimitError`, and **never
retries it**. All copy comes from the server.

```go
_, err := client.Generate.Enhance(ctx, map[string]any{"content": "…"}, nil)
var limit *misarpost.PlanLimitError
if errors.As(err, &limit) {
	fmt.Println(limit.Offer["headline"], limit.Offer["cta"])
	fmt.Println("Upgrade:", limit.UpgradeURL, "resets in", limit.RetryAfter, "s")
}
```

## Webhooks

```go
ok := misarpost.VerifyWebhookSignature(secret, rawBody, r.Header.Get(misarpost.WebhookSignatureHeader))
```

## Method reference

| Call | HTTP | Scope |
| --- | --- | --- |
| `client.Analytics.Stats(ctx, …)` | `GET /stats` | `analytics:read` |
| `client.Analytics.Trends(ctx, …)` | `GET /analytics/trends` | `analytics:read` |
| `client.Composer.DiscordChannels(ctx, …)` | `GET /composer/discord/channels` | `connections:read` |
| `client.Composer.HashnodePublications(ctx, …)` | `GET /composer/hashnode/publications` | `connections:read` |
| `client.Composer.HashnodeTags(ctx, …)` | `GET /composer/hashnode/tags` | `connections:read` |
| `client.Composer.LemmyCommunities(ctx, …)` | `GET /composer/lemmy/communities` | `connections:read` |
| `client.Composer.ListmonkLists(ctx, …)` | `GET /composer/listmonk/lists` | `connections:read` |
| `client.Composer.ListmonkTemplates(ctx, …)` | `GET /composer/listmonk/templates` | `connections:read` |
| `client.Composer.MediumPublications(ctx, …)` | `GET /composer/medium/publications` | `connections:read` |
| `client.Composer.PinterestBoards(ctx, …)` | `GET /composer/pinterest/boards` | `connections:read` |
| `client.Composer.RedditFlairs(ctx, …)` | `GET /composer/reddit/flairs` | `connections:read` |
| `client.Composer.SkoolGroups(ctx, …)` | `GET /composer/skool/groups` | `connections:read` |
| `client.Composer.SlackChannels(ctx, …)` | `GET /composer/slack/channels` | `connections:read` |
| `client.Composer.WhopForums(ctx, …)` | `GET /composer/whop/forums` | `connections:read` |
| `client.Connections.List(ctx, …)` | `GET /connections` | `connections:read` |
| `client.Connections.Plugs(ctx, …)` | `GET /connections/:accountId/plugs` | `connections:read` |
| `client.Connections.UpdatePlugs(ctx, …)` | `PATCH /connections/:accountId/plugs` | `connections:write` |
| `client.Connections.WordpressTaxonomies(ctx, …)` | `GET /connections/:accountId/wordpress-taxonomies` | `connections:read` |
| `client.Contentripple.DeleteHistory(ctx, …)` | `DELETE /contentripple/history` | `posts:write` |
| `client.Contentripple.Feed(ctx, …)` | `POST /contentripple/feed` | `generate:write` |
| `client.Contentripple.History(ctx, …)` | `GET /contentripple/history` | `posts:read` |
| `client.Contentripple.Parse(ctx, …)` | `POST /contentripple/parse` | `generate:write` |
| `client.Contentripple.Repurpose(ctx, …)` | `POST /contentripple` | `generate:write` |
| `client.Contentripple.Schedule(ctx, …)` | `POST /contentripple/schedule` | `schedule:write` |
| `client.Contentripple.UpdateVariants(ctx, …)` | `PATCH /contentripple/variants` | `posts:write` |
| `client.Contentripple.Usage(ctx, …)` | `GET /contentripple` | `posts:read` |
| `client.Drafts.Create(ctx, …)` | `POST /drafts` | `posts:write` |
| `client.Drafts.List(ctx, …)` | `GET /drafts` | `posts:read` |
| `client.Generate.Create(ctx, …)` | `POST /generate` | `generate:write` |
| `client.Generate.Enhance(ctx, …)` | `POST /generate/enhance` | `generate:write` |
| `client.Generate.Hashtags(ctx, …)` | `POST /generate/hashtags` | `generate:write` |
| `client.Generate.Image(ctx, …)` | `POST /generate/image` | `generate:write` |
| `client.Generate.Optimize(ctx, …)` | `GET /generate/optimize` | `generate:write` |
| `client.Generate.Plan(ctx, …)` | `POST /generate/plan` | `generate:write` |
| `client.Growth.NextOpportunity(ctx, …)` | `GET /growth/next-opportunity` | `analytics:read` |
| `client.Growth.Opportunities(ctx, …)` | `GET /growth/opportunities` | `analytics:read` |
| `client.Growth.Overview(ctx, …)` | `GET /growth/overview` | `analytics:read` |
| `client.Growth.Playbooks(ctx, …)` | `GET /growth/playbooks` | `analytics:read` |
| `client.Media.Delete(ctx, …)` | `DELETE /media/:id` | `media:write` |
| `client.Media.List(ctx, …)` | `GET /media` | `media:read` |
| `client.Notifications.List(ctx, …)` | `GET /notifications` | `notifications:read` |
| `client.Notifications.ReadAll(ctx, …)` | `POST /notifications/read-all` | `notifications:write` |
| `client.Notifications.Update(ctx, …)` | `PATCH /notifications/:id` | `notifications:write` |
| `client.Personaforge.ApproveReplies(ctx, …)` | `POST /personaforge/replies/approve` | `personas:write` |
| `client.Personaforge.Bio(ctx, …)` | `POST /personaforge/bio` | `generate:write` |
| `client.Personaforge.CreateCompetitors(ctx, …)` | `POST /personaforge/competitors` | `personas:write` |
| `client.Personaforge.CreatePersona(ctx, …)` | `POST /personaforge/personas` | `personas:write` |
| `client.Personaforge.CreateReplies(ctx, …)` | `POST /personaforge/replies` | `personas:write` |
| `client.Personaforge.CreateVoice(ctx, …)` | `POST /personaforge/voice` | `personas:write` |
| `client.Personaforge.DeletePersona(ctx, …)` | `DELETE /personaforge/personas/:id` | `personas:write` |
| `client.Personaforge.Generate(ctx, …)` | `POST /personaforge/generate` | `generate:write` |
| `client.Personaforge.GetPersona(ctx, …)` | `GET /personaforge/personas/:id` | `personas:read` |
| `client.Personaforge.GetVoice(ctx, …)` | `GET /personaforge/voice` | `personas:read` |
| `client.Personaforge.ListCompetitors(ctx, …)` | `GET /personaforge/competitors` | `personas:read` |
| `client.Personaforge.ListPersonas(ctx, …)` | `GET /personaforge/personas` | `personas:read` |
| `client.Personaforge.ListReplies(ctx, …)` | `GET /personaforge/replies` | `personas:read` |
| `client.Personaforge.PersonaStatus(ctx, …)` | `GET /personaforge/personas/status/:jobId` | `personas:read` |
| `client.Personaforge.UpdatePersona(ctx, …)` | `PATCH /personaforge/personas/:id` | `personas:write` |
| `client.Posts.Calendar(ctx, …)` | `GET /calendar` | `posts:read` |
| `client.Posts.Cancel(ctx, …)` | `DELETE /posts` | `posts:write` |
| `client.Posts.Delete(ctx, …)` | `DELETE /posts/:id` | `posts:write` |
| `client.Posts.List(ctx, …)` | `GET /posts` | `posts:read` |
| `client.Posts.Reply(ctx, …)` | `POST /posts/:id/reply` | `posts:write` |
| `client.Posts.Revert(ctx, …)` | `POST /posts/:id/revert` | `posts:write` |
| `client.Posts.RevertBatch(ctx, …)` | `POST /posts/revert-batch` | `posts:write` |
| `client.Posts.Schedule(ctx, …)` | `POST /schedule` | `schedule:write` |
| `client.Posts.Share(ctx, …)` | `POST /posts/:id/share` | `posts:write` |
| `client.Posts.Unshare(ctx, …)` | `DELETE /posts/:id/share` | `posts:write` |
| `client.Posts.Update(ctx, …)` | `PATCH /posts/:id` | `posts:write` |
| `client.PostTags.Create(ctx, …)` | `POST /post-tags` | `posts:write` |
| `client.PostTags.Delete(ctx, …)` | `DELETE /post-tags/:id` | `posts:write` |
| `client.PostTags.List(ctx, …)` | `GET /post-tags` | `posts:read` |
| `client.PostTags.Update(ctx, …)` | `PATCH /post-tags/:id` | `posts:write` |
| `client.PostTemplates.Create(ctx, …)` | `POST /post-templates` | `posts:write` |
| `client.PostTemplates.Delete(ctx, …)` | `DELETE /post-templates/:id` | `posts:write` |
| `client.PostTemplates.Get(ctx, …)` | `GET /post-templates/:id` | `posts:read` |
| `client.PostTemplates.List(ctx, …)` | `GET /post-templates` | `posts:read` |
| `client.PostTemplates.Update(ctx, …)` | `PATCH /post-templates/:id` | `posts:write` |
| `client.Trendpulse.CreatePlatformContent(ctx, …)` | `POST /trendpulse/platform-content` | `trends:write` |
| `client.Trendpulse.Digest(ctx, …)` | `POST /trendpulse/digest` | `trends:write` |
| `client.Trendpulse.Fetch(ctx, …)` | `POST /trendpulse/fetch` | `trends:write` |
| `client.Trendpulse.Hooks(ctx, …)` | `GET /trendpulse/hooks` | `trends:read` |
| `client.Trendpulse.List(ctx, …)` | `GET /trendpulse` | `trends:read` |
| `client.Trendpulse.ListPlatformContent(ctx, …)` | `GET /trendpulse/platform-content` | `trends:read` |
| `client.Trendpulse.Performance(ctx, …)` | `GET /trendpulse/performance` | `analytics:read` |
| `client.Trendpulse.Pipeline(ctx, …)` | `POST /trendpulse/pipeline` | `schedule:write` |
| `client.Trendpulse.Refresh(ctx, …)` | `POST /trendpulse` | `trends:write` |
| `client.Trendpulse.UsePlatformContent(ctx, …)` | `POST /trendpulse/platform-content/use` | `trends:write` |
| `client.Video.Avatars(ctx, …)` | `GET /video/avatars` | `media:read` |
| `client.Video.Generate(ctx, …)` | `POST /video/generate` | `generate:write` |
| `client.Video.Script(ctx, …)` | `POST /video/script` | `generate:write` |
| `client.Video.Status(ctx, …)` | `GET /video/status/:jobId` | `media:read` |
| `client.Video.Voices(ctx, …)` | `GET /video/voices` | `media:read` |
| `client.Webhooks.CreateOutbound(ctx, …)` | `POST /webhooks/outbound` | `webhooks:write` |
| `client.Webhooks.DeleteOutbound(ctx, …)` | `DELETE /webhooks/outbound/:id` | `webhooks:write` |
| `client.Webhooks.ListOutbound(ctx, …)` | `GET /webhooks/outbound` | `webhooks:read` |
| `client.Webhooks.UpdateOutbound(ctx, …)` | `PATCH /webhooks/outbound/:id` | `webhooks:write` |
| `client.Workspaces.AddMember(ctx, …)` | `POST /workspaces/:id/members` | `workspaces:write` |
| `client.Workspaces.Create(ctx, …)` | `POST /workspaces` | `workspaces:write` |
| `client.Workspaces.List(ctx, …)` | `GET /workspaces` | `workspaces:read` |
| `client.Workspaces.Members(ctx, …)` | `GET /workspaces/:id/members` | `workspaces:read` |
| `client.Workspaces.RemoveMember(ctx, …)` | `DELETE /workspaces/:id/members` | `workspaces:write` |

---

## Links

- Website — https://www.misarpost.com
- App — https://post.misar.io
- Parent — https://misar.io
- Documentation — https://docs.misar.io/post
- API reference — https://api.misar.io/post/openapi.json
- Source — https://github.com/Misar-AI/misarpost-sdks
- pkg.go.dev — https://pkg.go.dev/github.com/Misar-AI/misarpost-sdks/go/misarpost

MIT © [Misar.AI](https://misar.io)
