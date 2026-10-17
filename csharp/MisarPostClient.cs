namespace MisarPost;

/// <summary>
/// MisarPost API client. Every resource (<c>client.Posts</c>, <c>client.Generate</c>, …) is generated from the
/// API's own route tree (sdks/manifest.json).
/// </summary>
/// <example>
/// <code>
/// var post = new MisarPostClient(Environment.GetEnvironmentVariable("MISARPOST_API_KEY")!);
/// var queued = await post.Posts.List(new Dictionary&lt;string, string&gt; { ["status"] = "queued" });
/// </code>
/// </example>
public sealed class MisarPostClient : Generated.Resources
{
    public Transport Transport { get; }

    public MisarPostClient(string apiKey, string baseUrl = Transport.DefaultBaseUrl, int maxRetries = 3, TimeSpan? timeout = null, HttpClient? httpClient = null)
        : this(new Transport(apiKey, baseUrl, maxRetries, timeout, httpClient)) { }

    private MisarPostClient(Transport transport) : base(transport) => Transport = transport;

    public string BaseUrl => Transport.BaseUrl;
}
