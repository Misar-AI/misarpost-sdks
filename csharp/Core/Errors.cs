using System.Text.Json;

namespace MisarPost;

/// <summary>Any non-2xx answer from the MisarPost API, or a transport failure (status 0).</summary>
public class MisarPostException : Exception
{
    /// <summary>HTTP status; 0 for a network failure.</summary>
    public int Status { get; }
    /// <summary>Machine code from the body's <c>code</c>, e.g. <c>insufficient_scope</c>.</summary>
    public string Code { get; }
    /// <summary>The decoded error body, when there was one.</summary>
    public JsonElement? Body { get; }

    public MisarPostException(int status, string message, string code = "api_error", JsonElement? body = null, Exception? inner = null)
        : base($"misarpost: API error {status} ({code}): {message}", inner)
    {
        Status = status;
        Code = code;
        Body = body;
    }

    /// <summary>The key was rejected outright: missing, revoked, expired, or another product's.</summary>
    public bool IsUnauthorized => Status == 401;
    /// <summary>The key is valid but lacks the scope this endpoint requires.</summary>
    public bool IsForbidden => Status == 403;
}

/// <summary>
/// The plan behind the API key blocks this call: HTTP 402 with <c>code: "plan_limit_exceeded"</c>
/// and an upgrade offer. Detected by code before the status and never retried. All copy comes from the server.
/// </summary>
public sealed class MisarPostPlanLimitException : MisarPostException
{
    /// <summary>The server's upgrade offer (headline, plans, cta, urls…).</summary>
    public JsonElement? Offer { get; }
    /// <summary>The account's current plan slug.</summary>
    public string? Plan { get; }
    /// <summary>Pricing page to send the user to.</summary>
    public string? UpgradeUrl { get; }
    /// <summary>Seconds until a monthly allowance resets, when supplied.</summary>
    public int? RetryAfter { get; }
    /// <summary>The feature whose allowance was exhausted.</summary>
    public string? Feature { get; }

    public MisarPostPlanLimitException(int status, string message, JsonElement? body, JsonElement? offer,
        string? plan, string? upgradeUrl, int? retryAfter, string? feature)
        : base(status, message, "plan_limit_exceeded", body)
    {
        Offer = offer;
        Plan = plan;
        UpgradeUrl = upgradeUrl;
        RetryAfter = retryAfter;
        Feature = feature;
    }
}
