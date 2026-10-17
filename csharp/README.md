# MisarPost .NET SDK

> Schedule, publish, generate and analyze social content from C# and .NET — async/await all the way.

[![NuGet](https://img.shields.io/nuget/v/MisarPost)](https://www.nuget.org/packages/MisarPost)
[![license](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

**17 resource groups · 102 async methods · System.Text.Json, no other dependencies**

MisarPost is the AI social command center: publish to X, LinkedIn, Instagram, Threads, Bluesky, TikTok and more from one API, repurpose long-form content with ContentRipple, research trends with TrendPulse and write in your own voice with PersonaForge.

The resource layer is generated from the API's own route tree, so it always matches the server.

---

## Install

### .NET CLI

```bash
dotnet add package MisarPost
```

### PackageReference

```xml
<PackageReference Include="MisarPost" Version="1.0.0" />
```

---

## Authentication

Create an API key at https://post.misar.io/dashboard/api-keys. It starts with `mpk_` and is
sent as `Authorization: Bearer mpk_…`. Each key carries scopes (`posts:read`,
`schedule:write`, `generate:write`, …); a call outside them answers **403** with
`code: "insufficient_scope"`. New keys get every scope unless you narrow them.

```csharp
using MisarPost;

var post = new MisarPostClient(Environment.GetEnvironmentVariable("MISARPOST_API_KEY")!);
```

---

## Resources

| Resource | Methods | Scopes |
| --- | --- | --- |
| `post.Analytics` | `Stats`, `Trends` | `analytics:read` |
| `post.Composer` | `DiscordChannels`, `HashnodePublications`, `HashnodeTags`, `LemmyCommunities`, `ListmonkLists`, `ListmonkTemplates`, `MediumPublications`, `PinterestBoards`, `RedditFlairs`, `SkoolGroups`, `SlackChannels`, `WhopForums` | `connections:read` |
| `post.Connections` | `List`, `Plugs`, `UpdatePlugs`, `WordpressTaxonomies` | `connections:read`, `connections:write` |
| `post.Contentripple` | `DeleteHistory`, `Feed`, `History`, `Parse`, `Repurpose`, `Schedule`, `UpdateVariants`, `Usage` | `posts:write`, `generate:write`, `posts:read`, `schedule:write` |
| `post.Drafts` | `Create`, `List` | `posts:write`, `posts:read` |
| `post.Generate` | `Create`, `Enhance`, `Hashtags`, `Image`, `Optimize`, `Plan` | `generate:write` |
| `post.Growth` | `NextOpportunity`, `Opportunities`, `Overview`, `Playbooks` | `analytics:read` |
| `post.Media` | `Delete`, `List` | `media:write`, `media:read` |
| `post.Notifications` | `List`, `ReadAll`, `Update` | `notifications:read`, `notifications:write` |
| `post.Personaforge` | `ApproveReplies`, `Bio`, `CreateCompetitors`, `CreatePersona`, `CreateReplies`, `CreateVoice`, `DeletePersona`, `Generate`, `GetPersona`, `GetVoice`, `ListCompetitors`, `ListPersonas`, `ListReplies`, `PersonaStatus`, `UpdatePersona` | `personas:write`, `generate:write`, `personas:read` |
| `post.Posts` | `Calendar`, `Cancel`, `Delete`, `List`, `Reply`, `Revert`, `RevertBatch`, `Schedule`, `Share`, `Unshare`, `Update` | `posts:read`, `posts:write`, `schedule:write` |
| `post.PostTags` | `Create`, `Delete`, `List`, `Update` | `posts:write`, `posts:read` |
| `post.PostTemplates` | `Create`, `Delete`, `Get`, `List`, `Update` | `posts:write`, `posts:read` |
| `post.Trendpulse` | `CreatePlatformContent`, `Digest`, `Fetch`, `Hooks`, `List`, `ListPlatformContent`, `Performance`, `Pipeline`, `Refresh`, `UsePlatformContent` | `trends:write`, `trends:read`, `analytics:read`, `schedule:write` |
| `post.Video` | `Avatars`, `Generate`, `Script`, `Status`, `Voices` | `media:read`, `generate:write` |
| `post.Webhooks` | `CreateOutbound`, `DeleteOutbound`, `ListOutbound`, `UpdateOutbound` | `webhooks:write`, `webhooks:read` |
| `post.Workspaces` | `AddMember`, `Create`, `List`, `Members`, `RemoveMember` | `workspaces:write`, `workspaces:read` |

Every method takes path parameters as `string`, then `body` (any JSON-serialisable object, when the endpoint reads one), then optional `query` and `CancellationToken`, and returns `Task<JsonElement>`.

---

## Client

| Thing | Detail |
| --- | --- |
| Entry point | `new MisarPostClient(apiKey, baseUrl, maxRetries: 3, timeout, httpClient)` |
| Base URL | `https://api.misar.io/post` (also served at `https://post.misar.io/api`) |
| Transport | `HttpClient` (pass your own from `IHttpClientFactory`) |
| Retried | `429` throttles, `500`, `502`, `503`, `504` and network failures — exponential backoff from 200 ms honouring `Retry-After` |
| Never retried | Plan refusals (`MisarPostPlanLimitException`) |
| Errors | `MisarPostException`, `MisarPostPlanLimitException` |
| Also exported | `Pagination.PaginateAsync`, `Webhooks.VerifyWebhookSignature` |

---

## Quick start

```csharp
var post = new MisarPostClient("mpk_your_key");

var accounts = await post.Connections.List();
await post.Generate.Create(new { prompt = "Announce our v2 launch", platforms = new[] { "linkedin" } });
await post.Posts.Schedule(new
{
    accountIds = new[] { "<account id>" },
    content = "We just shipped v2",
    scheduledAt = "2026-11-01T09:00:00Z",
});
```

## Pagination

```csharp
await foreach (var page in Pagination.PaginateAsync(n => post.Posts.List(new Dictionary<string, string> { ["status"] = "queued", ["page"] = n.ToString() })))
{
    Console.WriteLine(page.GetProperty("posts").GetArrayLength());
}
```

## Plan limits

When a monthly allowance is spent, or a feature is not on the plan, the API answers
**402** with `code: "plan_limit_exceeded"` and an `upgrade` offer. The SDK detects the
code before it looks at the status, throws `MisarPostPlanLimitException`, and **never
retries it**. All copy comes from the server.

```csharp
try
{
    await post.Generate.Enhance(new { content = "…" });
}
catch (MisarPostPlanLimitException e)
{
    Console.WriteLine(e.Offer?.GetProperty("headline"));
    Console.WriteLine($"Upgrade: {e.UpgradeUrl}, resets in {e.RetryAfter}s");
}
```

## Webhooks

```csharp
var ok = Webhooks.VerifyWebhookSignature(secret, rawBody, Request.Headers[Webhooks.SignatureHeader]);
```

## Method reference

| Call | HTTP | Scope |
| --- | --- | --- |
| `post.Analytics.Stats(…)` | `GET /stats` | `analytics:read` |
| `post.Analytics.Trends(…)` | `GET /analytics/trends` | `analytics:read` |
| `post.Composer.DiscordChannels(…)` | `GET /composer/discord/channels` | `connections:read` |
| `post.Composer.HashnodePublications(…)` | `GET /composer/hashnode/publications` | `connections:read` |
| `post.Composer.HashnodeTags(…)` | `GET /composer/hashnode/tags` | `connections:read` |
| `post.Composer.LemmyCommunities(…)` | `GET /composer/lemmy/communities` | `connections:read` |
| `post.Composer.ListmonkLists(…)` | `GET /composer/listmonk/lists` | `connections:read` |
| `post.Composer.ListmonkTemplates(…)` | `GET /composer/listmonk/templates` | `connections:read` |
| `post.Composer.MediumPublications(…)` | `GET /composer/medium/publications` | `connections:read` |
| `post.Composer.PinterestBoards(…)` | `GET /composer/pinterest/boards` | `connections:read` |
| `post.Composer.RedditFlairs(…)` | `GET /composer/reddit/flairs` | `connections:read` |
| `post.Composer.SkoolGroups(…)` | `GET /composer/skool/groups` | `connections:read` |
| `post.Composer.SlackChannels(…)` | `GET /composer/slack/channels` | `connections:read` |
| `post.Composer.WhopForums(…)` | `GET /composer/whop/forums` | `connections:read` |
| `post.Connections.List(…)` | `GET /connections` | `connections:read` |
| `post.Connections.Plugs(…)` | `GET /connections/:accountId/plugs` | `connections:read` |
| `post.Connections.UpdatePlugs(…)` | `PATCH /connections/:accountId/plugs` | `connections:write` |
| `post.Connections.WordpressTaxonomies(…)` | `GET /connections/:accountId/wordpress-taxonomies` | `connections:read` |
| `post.Contentripple.DeleteHistory(…)` | `DELETE /contentripple/history` | `posts:write` |
| `post.Contentripple.Feed(…)` | `POST /contentripple/feed` | `generate:write` |
| `post.Contentripple.History(…)` | `GET /contentripple/history` | `posts:read` |
| `post.Contentripple.Parse(…)` | `POST /contentripple/parse` | `generate:write` |
| `post.Contentripple.Repurpose(…)` | `POST /contentripple` | `generate:write` |
| `post.Contentripple.Schedule(…)` | `POST /contentripple/schedule` | `schedule:write` |
| `post.Contentripple.UpdateVariants(…)` | `PATCH /contentripple/variants` | `posts:write` |
| `post.Contentripple.Usage(…)` | `GET /contentripple` | `posts:read` |
| `post.Drafts.Create(…)` | `POST /drafts` | `posts:write` |
| `post.Drafts.List(…)` | `GET /drafts` | `posts:read` |
| `post.Generate.Create(…)` | `POST /generate` | `generate:write` |
| `post.Generate.Enhance(…)` | `POST /generate/enhance` | `generate:write` |
| `post.Generate.Hashtags(…)` | `POST /generate/hashtags` | `generate:write` |
| `post.Generate.Image(…)` | `POST /generate/image` | `generate:write` |
| `post.Generate.Optimize(…)` | `GET /generate/optimize` | `generate:write` |
| `post.Generate.Plan(…)` | `POST /generate/plan` | `generate:write` |
| `post.Growth.NextOpportunity(…)` | `GET /growth/next-opportunity` | `analytics:read` |
| `post.Growth.Opportunities(…)` | `GET /growth/opportunities` | `analytics:read` |
| `post.Growth.Overview(…)` | `GET /growth/overview` | `analytics:read` |
| `post.Growth.Playbooks(…)` | `GET /growth/playbooks` | `analytics:read` |
| `post.Media.Delete(…)` | `DELETE /media/:id` | `media:write` |
| `post.Media.List(…)` | `GET /media` | `media:read` |
| `post.Notifications.List(…)` | `GET /notifications` | `notifications:read` |
| `post.Notifications.ReadAll(…)` | `POST /notifications/read-all` | `notifications:write` |
| `post.Notifications.Update(…)` | `PATCH /notifications/:id` | `notifications:write` |
| `post.Personaforge.ApproveReplies(…)` | `POST /personaforge/replies/approve` | `personas:write` |
| `post.Personaforge.Bio(…)` | `POST /personaforge/bio` | `generate:write` |
| `post.Personaforge.CreateCompetitors(…)` | `POST /personaforge/competitors` | `personas:write` |
| `post.Personaforge.CreatePersona(…)` | `POST /personaforge/personas` | `personas:write` |
| `post.Personaforge.CreateReplies(…)` | `POST /personaforge/replies` | `personas:write` |
| `post.Personaforge.CreateVoice(…)` | `POST /personaforge/voice` | `personas:write` |
| `post.Personaforge.DeletePersona(…)` | `DELETE /personaforge/personas/:id` | `personas:write` |
| `post.Personaforge.Generate(…)` | `POST /personaforge/generate` | `generate:write` |
| `post.Personaforge.GetPersona(…)` | `GET /personaforge/personas/:id` | `personas:read` |
| `post.Personaforge.GetVoice(…)` | `GET /personaforge/voice` | `personas:read` |
| `post.Personaforge.ListCompetitors(…)` | `GET /personaforge/competitors` | `personas:read` |
| `post.Personaforge.ListPersonas(…)` | `GET /personaforge/personas` | `personas:read` |
| `post.Personaforge.ListReplies(…)` | `GET /personaforge/replies` | `personas:read` |
| `post.Personaforge.PersonaStatus(…)` | `GET /personaforge/personas/status/:jobId` | `personas:read` |
| `post.Personaforge.UpdatePersona(…)` | `PATCH /personaforge/personas/:id` | `personas:write` |
| `post.Posts.Calendar(…)` | `GET /calendar` | `posts:read` |
| `post.Posts.Cancel(…)` | `DELETE /posts` | `posts:write` |
| `post.Posts.Delete(…)` | `DELETE /posts/:id` | `posts:write` |
| `post.Posts.List(…)` | `GET /posts` | `posts:read` |
| `post.Posts.Reply(…)` | `POST /posts/:id/reply` | `posts:write` |
| `post.Posts.Revert(…)` | `POST /posts/:id/revert` | `posts:write` |
| `post.Posts.RevertBatch(…)` | `POST /posts/revert-batch` | `posts:write` |
| `post.Posts.Schedule(…)` | `POST /schedule` | `schedule:write` |
| `post.Posts.Share(…)` | `POST /posts/:id/share` | `posts:write` |
| `post.Posts.Unshare(…)` | `DELETE /posts/:id/share` | `posts:write` |
| `post.Posts.Update(…)` | `PATCH /posts/:id` | `posts:write` |
| `post.PostTags.Create(…)` | `POST /post-tags` | `posts:write` |
| `post.PostTags.Delete(…)` | `DELETE /post-tags/:id` | `posts:write` |
| `post.PostTags.List(…)` | `GET /post-tags` | `posts:read` |
| `post.PostTags.Update(…)` | `PATCH /post-tags/:id` | `posts:write` |
| `post.PostTemplates.Create(…)` | `POST /post-templates` | `posts:write` |
| `post.PostTemplates.Delete(…)` | `DELETE /post-templates/:id` | `posts:write` |
| `post.PostTemplates.Get(…)` | `GET /post-templates/:id` | `posts:read` |
| `post.PostTemplates.List(…)` | `GET /post-templates` | `posts:read` |
| `post.PostTemplates.Update(…)` | `PATCH /post-templates/:id` | `posts:write` |
| `post.Trendpulse.CreatePlatformContent(…)` | `POST /trendpulse/platform-content` | `trends:write` |
| `post.Trendpulse.Digest(…)` | `POST /trendpulse/digest` | `trends:write` |
| `post.Trendpulse.Fetch(…)` | `POST /trendpulse/fetch` | `trends:write` |
| `post.Trendpulse.Hooks(…)` | `GET /trendpulse/hooks` | `trends:read` |
| `post.Trendpulse.List(…)` | `GET /trendpulse` | `trends:read` |
| `post.Trendpulse.ListPlatformContent(…)` | `GET /trendpulse/platform-content` | `trends:read` |
| `post.Trendpulse.Performance(…)` | `GET /trendpulse/performance` | `analytics:read` |
| `post.Trendpulse.Pipeline(…)` | `POST /trendpulse/pipeline` | `schedule:write` |
| `post.Trendpulse.Refresh(…)` | `POST /trendpulse` | `trends:write` |
| `post.Trendpulse.UsePlatformContent(…)` | `POST /trendpulse/platform-content/use` | `trends:write` |
| `post.Video.Avatars(…)` | `GET /video/avatars` | `media:read` |
| `post.Video.Generate(…)` | `POST /video/generate` | `generate:write` |
| `post.Video.Script(…)` | `POST /video/script` | `generate:write` |
| `post.Video.Status(…)` | `GET /video/status/:jobId` | `media:read` |
| `post.Video.Voices(…)` | `GET /video/voices` | `media:read` |
| `post.Webhooks.CreateOutbound(…)` | `POST /webhooks/outbound` | `webhooks:write` |
| `post.Webhooks.DeleteOutbound(…)` | `DELETE /webhooks/outbound/:id` | `webhooks:write` |
| `post.Webhooks.ListOutbound(…)` | `GET /webhooks/outbound` | `webhooks:read` |
| `post.Webhooks.UpdateOutbound(…)` | `PATCH /webhooks/outbound/:id` | `webhooks:write` |
| `post.Workspaces.AddMember(…)` | `POST /workspaces/:id/members` | `workspaces:write` |
| `post.Workspaces.Create(…)` | `POST /workspaces` | `workspaces:write` |
| `post.Workspaces.List(…)` | `GET /workspaces` | `workspaces:read` |
| `post.Workspaces.Members(…)` | `GET /workspaces/:id/members` | `workspaces:read` |
| `post.Workspaces.RemoveMember(…)` | `DELETE /workspaces/:id/members` | `workspaces:write` |

---

## Links

- Website — https://www.misarpost.com
- App — https://post.misar.io
- Parent — https://misar.io
- Documentation — https://docs.misar.io/post
- API reference — https://api.misar.io/post/openapi.json
- Source — https://github.com/Misar-AI/misarpost-sdks
- NuGet — https://www.nuget.org/packages/MisarPost

MIT © [Misar.AI](https://misar.io)
