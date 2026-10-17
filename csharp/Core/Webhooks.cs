using System.Security.Cryptography;
using System.Text;

namespace MisarPost;

/// <summary>
/// Outbound webhook deliveries carry <c>X-MisarPost-Signature: sha256=&lt;hex&gt;</c> — the HMAC-SHA256 of the RAW
/// request body keyed with the endpoint's <c>mpwh_</c> secret.
/// </summary>
public static class Webhooks
{
    public const string SignatureHeader = "X-MisarPost-Signature";

    public static string ComputeSignature(string secret, byte[] rawBody)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        return "sha256=" + Convert.ToHexString(hmac.ComputeHash(rawBody)).ToLowerInvariant();
    }

    /// <summary>Constant-time check of <paramref name="signatureHeader"/> against the raw body.</summary>
    public static bool VerifyWebhookSignature(string secret, byte[] rawBody, string? signatureHeader)
    {
        if (string.IsNullOrEmpty(secret) || signatureHeader is null) return false;
        var expected = Encoding.UTF8.GetBytes(ComputeSignature(secret, rawBody));
        var given = Encoding.UTF8.GetBytes(signatureHeader.Trim().ToLowerInvariant());
        return CryptographicOperations.FixedTimeEquals(expected, given);
    }
}
