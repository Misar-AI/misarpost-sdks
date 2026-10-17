package io.misar.post

/**
 * Page through MisarPost's `?page=` list endpoints: calls [fetchPage] with page 1,
 * 2, … until the page the server reports as `totalPages` — or, when an endpoint
 * reports no totals, until a page comes back empty.
 *
 * ```
 * val pages = paginate { page -> post.posts.list(mapOf("status" to "queued", "page" to page)) }
 * ```
 */
suspend fun paginate(maxPages: Int = 0, fetchPage: suspend (Int) -> Map<String, Any?>): List<Map<String, Any?>> {
    val pages = mutableListOf<Map<String, Any?>>()
    var page = 1
    while (maxPages <= 0 || pages.size < maxPages) {
        val result = fetchPage(page)
        pages += result
        val total = result["totalPages"]
        if (total is Number) {
            if (page >= total.toInt()) break
        } else {
            val items = result.values.firstOrNull { it is List<*> } as? List<*>
            if (items.isNullOrEmpty()) break
        }
        page++
    }
    return pages
}
