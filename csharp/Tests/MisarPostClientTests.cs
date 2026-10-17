using System.Net;
using System.Text;
using System.Text.Json;
using MisarPost;
using Xunit;

public class StubHandler : HttpMessageHandler
{
    public readonly List<(int Status, string Body, Dictionary<string, string> Headers)> Replies = new();
    public readonly List<(HttpRequestMessage Request, string? Body)> Seen = new();

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        Seen.Add((request, request.Content is null ? null : await request.Content.ReadAsStringAsync(ct)));
        var reply = Replies.Count > 1 ? Replies[0] : Replies[^1];
        if (Replies.Count > 1) Replies.RemoveAt(0);
        var resp = new HttpResponseMessage((HttpStatusCode)reply.Status) { Content = new StringContent(reply.Body, Encoding.UTF8, "application/json") };
        foreach (var (k, v) in reply.Headers) resp.Headers.TryAddWithoutValidation(k, v);
        return resp;
    }
}

public class MisarPostClientTests
{
    private const string Offer = "{\"feature\":\"ai_text_actions\",\"headline\":\"limit\",\"current_plan\":{\"slug\":\"free\"},\"urls\":{\"pricing\":\"https://post.misar.io/pricing\"},\"cta\":\"Upgrade to continue.\"}";
    private static readonly Dictionary<string, string> None = new();

    private static (MisarPostClient, StubHandler) Client(params (int, string, Dictionary<string, string>)[] replies)
    {
        var stub = new StubHandler();
        stub.Replies.AddRange(replies);
        return (new MisarPostClient("mpk_test", httpClient: new HttpClient(stub)), stub);
    }

    [Fact]
    public void RequiresApiKey() => Assert.Throws<ArgumentException>(() => new MisarPostClient(""));

    [Fact]
    public async Task SendsBearerAndQuery()
    {
        var (post, stub) = Client((200, "{\"posts\":[]}", None));
        await post.Posts.List(new Dictionary<string, string> { ["status"] = "queued" });
        var req = stub.Seen[0].Request;
        Assert.Equal("https://api.misar.io/post/posts?status=queued", req.RequestUri!.AbsoluteUri);
        Assert.Equal("Bearer mpk_test", req.Headers.Authorization!.ToString());
    }

    [Fact]
    public async Task EncodesPathAndSendsBody()
    {
        var (post, stub) = Client((200, "{\"post\":{}}", None));
        await post.Posts.Update("a/b", new { contentText = "hi" });
        Assert.Equal("PATCH", stub.Seen[0].Request.Method.Method);
        Assert.Equal("/post/posts/a%2Fb", stub.Seen[0].Request.RequestUri!.AbsolutePath);
        Assert.Equal("{\"contentText\":\"hi\"}", stub.Seen[0].Body);
    }

    [Fact]
    public async Task RequiredQueryIsPositional()
    {
        var (post, stub) = Client((200, "{\"ok\":true}", None));
        await post.Workspaces.RemoveMember("ws1", "m1");
        Assert.Equal("?memberId=m1", stub.Seen[0].Request.RequestUri!.Query);
    }

    [Fact]
    public async Task RetriesThenSucceeds()
    {
        var zero = new Dictionary<string, string> { ["Retry-After"] = "0" };
        var (post, stub) = Client((503, "{\"error\":\"busy\"}", zero), (429, "{\"error\":\"slow\"}", zero), (200, "{\"ok\":true}", None));
        var res = await post.Analytics.Stats();
        Assert.True(res.GetProperty("ok").GetBoolean());
        Assert.Equal(3, stub.Seen.Count);
    }

    [Fact]
    public async Task PlanLimitIsTypedAndNotRetried()
    {
        var headers = new Dictionary<string, string> { ["Retry-After"] = "3600", ["x-misar-plan"] = "free" };
        var (post, stub) = Client((402, "{\"error\":\"limit\",\"code\":\"plan_limit_exceeded\",\"upgrade\":" + Offer + "}", headers));
        var e = await Assert.ThrowsAsync<MisarPostPlanLimitException>(() => post.Generate.Enhance(new { content = "x" }));
        Assert.Equal("ai_text_actions", e.Feature);
        Assert.Equal("free", e.Plan);
        Assert.Equal("https://post.misar.io/pricing", e.UpgradeUrl);
        Assert.Equal(3600, e.RetryAfter);
        Assert.Single(stub.Seen);
    }

    [Fact]
    public async Task PlanLimitDetectedOn429()
    {
        var (post, stub) = Client((429, "{\"error\":\"quota\",\"code\":\"plan_limit_exceeded\",\"upgrade\":" + Offer + "}", None));
        await Assert.ThrowsAsync<MisarPostPlanLimitException>(() => post.Generate.Create(new { prompt = "x" }));
        Assert.Single(stub.Seen);
    }

    [Fact]
    public async Task ScopeRefusalCarriesCode()
    {
        var (post, _) = Client((403, "{\"error\":\"lacks scope\",\"code\":\"insufficient_scope\"}", None));
        var e = await Assert.ThrowsAsync<MisarPostException>(() => post.Webhooks.ListOutbound());
        Assert.Equal(403, e.Status);
        Assert.Equal("insufficient_scope", e.Code);
    }

    [Fact]
    public async Task WrapsNonObjectJson()
    {
        var (post, _) = Client((200, "[1,2]", None));
        var res = await post.PostTags.List();
        Assert.Equal(2, res.GetProperty("data").GetArrayLength());
    }

    [Fact]
    public async Task Paginates()
    {
        var count = 0;
        await foreach (var _ in Pagination.PaginateAsync(p => Task.FromResult(JsonSerializer.SerializeToElement(new { posts = new[] { p }, totalPages = 3 })))) count++;
        Assert.Equal(3, count);
    }

    [Fact]
    public void VerifiesWebhookSignatures()
    {
        var body = Encoding.UTF8.GetBytes("{\"event\":\"post.published\"}");
        var sig = Webhooks.ComputeSignature("mpwh_secret", body);
        Assert.StartsWith("sha256=", sig);
        Assert.True(Webhooks.VerifyWebhookSignature("mpwh_secret", body, sig));
        Assert.False(Webhooks.VerifyWebhookSignature("mpwh_secret", Encoding.UTF8.GetBytes("{\"event\":\"tampered\"}"), sig));
    }
}
