using System.Text.Json;

namespace MisarPost;

/// <summary>
/// Page through MisarPost's <c>?page=</c> list endpoints: calls the fetcher with page 1, 2, … until the page the
/// server reports as <c>totalPages</c> — or, when an endpoint reports no totals, until a page comes back empty.
/// </summary>
public static class Pagination
{
    public static async IAsyncEnumerable<JsonElement> PaginateAsync(Func<int, Task<JsonElement>> fetchPage, int maxPages = 0)
    {
        for (int page = 1, seen = 0; maxPages <= 0 || seen < maxPages; page++, seen++)
        {
            var result = await fetchPage(page).ConfigureAwait(false);
            yield return result;
            if (result.ValueKind != JsonValueKind.Object) yield break;
            if (result.TryGetProperty("totalPages", out var total) && total.ValueKind == JsonValueKind.Number)
            {
                if (page >= total.GetInt32()) yield break;
                continue;
            }
            var items = result.EnumerateObject().Select(p => p.Value).FirstOrDefault(v => v.ValueKind == JsonValueKind.Array);
            if (items.ValueKind != JsonValueKind.Array || items.GetArrayLength() == 0) yield break;
        }
    }
}
