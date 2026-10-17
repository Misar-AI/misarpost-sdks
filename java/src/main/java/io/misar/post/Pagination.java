package io.misar.post;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.IntFunction;

/**
 * Page through MisarPost's {@code ?page=} list endpoints: calls the fetcher with
 * page 1, 2, … until the page the server reports as {@code totalPages} — or,
 * when an endpoint reports no totals, until a page comes back empty.
 *
 * <pre>{@code
 * List<Map<String, Object>> pages = Pagination.paginate(page ->
 *     client.posts.list(Map.of("status", "queued", "page", page)), 0);
 * }</pre>
 */
public final class Pagination {
    private Pagination() { }

    /** @param maxPages 0 for no limit */
    public static List<Map<String, Object>> paginate(IntFunction<Map<String, Object>> fetchPage, int maxPages) {
        List<Map<String, Object>> pages = new ArrayList<>();
        for (int page = 1; maxPages <= 0 || pages.size() < maxPages; page++) {
            Map<String, Object> result = fetchPage.apply(page);
            pages.add(result);
            Object total = result.get("totalPages");
            if (total instanceof Number) {
                if (page >= ((Number) total).intValue()) break;
                continue;
            }
            List<?> items = null;
            for (Object v : result.values()) {
                if (v instanceof List) { items = (List<?>) v; break; }
            }
            if (items == null || items.isEmpty()) break;
        }
        return pages;
    }
}
