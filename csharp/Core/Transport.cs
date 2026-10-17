using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace MisarPost;

/// <summary>
/// HTTP transport the generated resource layer is written against. One credential, one path in:
/// the account API key (<c>mpk_…</c>) sent as <c>Authorization: Bearer</c>. Retries throttles, 5xx and
/// network failures with exponential backoff from 200 ms honouring <c>Retry-After</c> — never a plan refusal.
/// </summary>
public sealed class Transport
{
    public const string Version = "1.0.0";
    public const string DefaultBaseUrl = "https://api.misar.io/post";
    private static readonly HashSet<int> Retryable = new() { 429, 500, 502, 503, 504 };

    private readonly string _apiKey;
    private readonly int _maxRetries;
    private readonly HttpClient _http;

    public string BaseUrl { get; }

    public Transport(string apiKey, string baseUrl = DefaultBaseUrl, int maxRetries = 3, TimeSpan? timeout = null, HttpClient? httpClient = null)
    {
        if (string.IsNullOrEmpty(apiKey))
        {
            throw new ArgumentException("A MisarPost API key is required. Create one at https://post.misar.io/dashboard/api-keys (it starts with mpk_).", nameof(apiKey));
        }
        _apiKey = apiKey;
        BaseUrl = baseUrl.TrimEnd('/');
        _maxRetries = Math.Max(1, maxRetries);
        _http = httpClient ?? new HttpClient { Timeout = timeout ?? TimeSpan.FromSeconds(30) };
    }

    /// <summary>Encode one path parameter.</summary>
    public static string Enc(string value) => Uri.EscapeDataString(value);

    private static string Query(IDictionary<string, string>? query)
    {
        if (query is null || query.Count == 0) return "";
        return "?" + string.Join("&", query.Where(kv => kv.Value is not null).Select(kv => $"{Enc(kv.Key)}={Enc(kv.Value)}"));
    }

    /// <summary>Send one API request; generated resources call this.</summary>
    public async Task<JsonElement> RequestAsync(string method, string path, IDictionary<string, string>? query, object? body, CancellationToken ct = default)
    {
        string? payload = body is null ? null : JsonSerializer.Serialize(body);
        var url = BaseUrl + path + Query(query);

        for (var attempt = 0; ; attempt++)
        {
            using var req = new HttpRequestMessage(new HttpMethod(method), url);
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _apiKey);
            req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
            req.Headers.UserAgent.ParseAdd($"misarpost-csharp/{Version}");
            if (payload is not null) req.Content = new StringContent(payload, Encoding.UTF8, "application/json");

            HttpResponseMessage resp;
            try
            {
                resp = await _http.SendAsync(req, ct).ConfigureAwait(false);
            }
            catch (HttpRequestException e)
            {
                if (attempt + 1 < _maxRetries) { await Task.Delay(Backoff(attempt, null), ct).ConfigureAwait(false); continue; }
                throw new MisarPostException(0, e.Message, "network_error", null, e);
            }

            using (resp)
            {
                var raw = await resp.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
                JsonElement? data = null;
                if (!string.IsNullOrWhiteSpace(raw))
                {
                    try { data = JsonDocument.Parse(raw).RootElement.Clone(); }
                    catch (JsonException) { data = JsonSerializer.SerializeToElement(raw); }
                }
                var status = (int)resp.StatusCode;
                if (status is >= 200 and < 300) return Normalize(data);

                // Plan refusals first, by code — never retried.
                if (data is { ValueKind: JsonValueKind.Object } obj && IsPlanLimitBody(obj)) throw PlanLimit(resp, obj);

                if (Retryable.Contains(status) && attempt + 1 < _maxRetries)
                {
                    await Task.Delay(Backoff(attempt, Header(resp, "Retry-After")), ct).ConfigureAwait(false);
                    continue;
                }

                string message = $"HTTP {status}", code = "api_error";
                if (data is { ValueKind: JsonValueKind.Object } o)
                {
                    message = Str(o, "error") ?? Str(o, "message") ?? message;
                    code = Str(o, "code") ?? code;
                }
                throw new MisarPostException(status, message, code, data);
            }
        }
    }

    internal static bool IsPlanLimitBody(JsonElement body) =>
        Str(body, "code") == "plan_limit_exceeded" ||
        (body.TryGetProperty("upgrade", out var up) && up.ValueKind == JsonValueKind.Object);

    private static MisarPostPlanLimitException PlanLimit(HttpResponseMessage resp, JsonElement body)
    {
        JsonElement? offer = body.TryGetProperty("upgrade", out var up) && up.ValueKind == JsonValueKind.Object ? up : null;
        int? retryAfter = int.TryParse(Header(resp, "Retry-After"), out var ra) ? ra : null;
        return new MisarPostPlanLimitException(
            (int)resp.StatusCode,
            Str(body, "error") ?? Path(offer, "headline") ?? "Plan limit exceeded",
            body,
            offer,
            Header(resp, "x-misar-plan") ?? Path(offer, "current_plan", "slug"),
            Header(resp, "x-misar-upgrade-url") ?? Path(offer, "urls", "pricing"),
            retryAfter,
            Path(offer, "feature"));
    }

    private static string? Header(HttpResponseMessage resp, string name) =>
        resp.Headers.TryGetValues(name, out var v) ? v.FirstOrDefault() : null;

    private static string? Str(JsonElement e, string key) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static string? Path(JsonElement? e, params string[] keys)
    {
        if (e is null) return null;
        var cur = e.Value;
        foreach (var k in keys)
        {
            if (cur.ValueKind != JsonValueKind.Object || !cur.TryGetProperty(k, out cur)) return null;
        }
        return cur.ValueKind == JsonValueKind.String ? cur.GetString() : null;
    }

    private static TimeSpan Backoff(int attempt, string? retryAfter)
    {
        if (double.TryParse(retryAfter, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var secs))
            return TimeSpan.FromSeconds(Math.Min(Math.Max(secs, 0), 60));
        return TimeSpan.FromMilliseconds(200 << attempt);
    }

    private static JsonElement Normalize(JsonElement? data)
    {
        if (data is null) return JsonSerializer.SerializeToElement(new Dictionary<string, object>());
        if (data.Value.ValueKind == JsonValueKind.Object) return data.Value;
        return JsonSerializer.SerializeToElement(new Dictionary<string, JsonElement> { ["data"] = data.Value });
    }
}
