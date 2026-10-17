import Foundation

/// Page through MisarPost's `?page=` list endpoints: calls `fetchPage` with page
/// 1, 2, … until the page the server reports as `totalPages` — or, when an
/// endpoint reports no totals, until a page comes back empty.
///
///     let pages = try await paginate { page in
///         try await post.posts.list(query: ["status": "queued", "page": String(page)])
///     }
public func paginate(maxPages: Int = 0,
                     _ fetchPage: (Int) async throws -> [String: Any]) async throws -> [[String: Any]] {
    var pages: [[String: Any]] = []
    var page = 1
    while maxPages <= 0 || pages.count < maxPages {
        let result = try await fetchPage(page)
        pages.append(result)
        if let total = result["totalPages"] as? Int {
            if page >= total { break }
        } else {
            let items = result.values.first { $0 is [Any] } as? [Any]
            if items?.isEmpty ?? true { break }
        }
        page += 1
    }
    return pages
}
