/**
 * Page through MisarPost's `?page=` list endpoints.
 *
 * List responses carry `page` and `totalPages` (e.g. `GET /posts` →
 * `{ posts, total, page, pageSize, totalPages }`). `paginate` keeps requesting
 * the next page until the server reports the last one, or a page comes back
 * empty when the endpoint does not report totals.
 *
 *   for await (const page of paginate((page) => client.posts.list({ status: "queued", page }))) {
 *     for (const post of page.posts as unknown[]) { ... }
 *   }
 */
export async function* paginate<T extends Record<string, unknown>>(
  fetchPage: (page: number) => Promise<T>,
  options: { startPage?: number; maxPages?: number } = {},
): AsyncGenerator<T> {
  const max = options.maxPages ?? Number.POSITIVE_INFINITY;
  for (let page = options.startPage ?? 1, n = 0; n < max; page++, n++) {
    const result = await fetchPage(page);
    yield result;
    const total = typeof result.totalPages === "number" ? result.totalPages : null;
    if (total !== null) {
      if (page >= total) return;
      continue;
    }
    const items = Object.values(result).find(Array.isArray) as unknown[] | undefined;
    if (!items || items.length === 0) return;
  }
}
