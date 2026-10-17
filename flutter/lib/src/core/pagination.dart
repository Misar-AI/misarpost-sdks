/// Page through MisarPost's `?page=` list endpoints: calls [fetchPage] with page
/// 1, 2, … until the page the server reports as `totalPages` — or, when an
/// endpoint reports no totals, until a page comes back empty.
///
/// ```dart
/// await for (final page in paginate((p) => post.posts.list(query: {'status': 'queued', 'page': p}))) {
///   print(page['posts']);
/// }
/// ```
Stream<Map<String, dynamic>> paginate(
  Future<Map<String, dynamic>> Function(int page) fetchPage, {
  int maxPages = 0,
}) async* {
  for (var page = 1, seen = 0; maxPages <= 0 || seen < maxPages; page++, seen++) {
    final result = await fetchPage(page);
    yield result;
    final total = result['totalPages'];
    if (total is int) {
      if (page >= total) return;
      continue;
    }
    final items = result.values.whereType<List<dynamic>>().firstOrNull;
    if (items == null || items.isEmpty) return;
  }
}
