import Foundation
// On Linux, URLSession/URLRequest/HTTPURLResponse live in FoundationNetworking.
#if canImport(FoundationNetworking)
import FoundationNetworking

/// swift-corelibs-foundation has no async `data(for:)`; bridge the
/// completion-handler API so the package builds and runs on Linux.
extension URLSession {
    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        try await withCheckedThrowingContinuation { continuation in
            let task = dataTask(with: request) { data, response, error in
                if let error {
                    continuation.resume(throwing: error)
                } else if let data, let response {
                    continuation.resume(returning: (data, response))
                } else {
                    continuation.resume(throwing: URLError(.badServerResponse))
                }
            }
            task.resume()
        }
    }
}
#endif

/// HTTP transport the generated resource layer is written against. One
/// credential, one path in: the account API key (`mpk_…`) sent as
/// `Authorization: Bearer`. Retries throttles, 5xx and network failures with
/// exponential backoff from 200 ms honouring `Retry-After` — never a plan refusal.
public final class Transport {
    public static let version = "1.0.0"
    public static let defaultBaseURL = "https://api.misar.io/post"
    static let retryable: Set<Int> = [429, 500, 502, 503, 504]

    public let baseURL: String
    private let apiKey: String
    private let maxRetries: Int
    private let session: URLSession
    private let timeout: TimeInterval

    public init(apiKey: String, baseURL: String = Transport.defaultBaseURL, maxRetries: Int = 3,
                timeout: TimeInterval = 30, session: URLSession = .shared) throws {
        guard !apiKey.isEmpty else {
            throw MisarPostError(status: 0, code: "missing_api_key",
                                 message: "A MisarPost API key is required. Create one at https://post.misar.io/dashboard/api-keys (it starts with mpk_).",
                                 body: nil)
        }
        self.apiKey = apiKey
        var base = baseURL
        while base.hasSuffix("/") { base.removeLast() }
        self.baseURL = base
        self.maxRetries = max(1, maxRetries)
        self.timeout = timeout
        self.session = session
    }

    /// Encode one path parameter.
    public static func enc(_ value: String) -> String {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
    }

    /// Send one API request; generated resources call this.
    public func request(_ method: String, _ path: String, query: [String: String]? = nil,
                        body: [String: Any]? = nil) async throws -> [String: Any] {
        var components = URLComponents(string: baseURL + path)!
        if let query, !query.isEmpty {
            components.queryItems = query.keys.sorted().map { URLQueryItem(name: $0, value: query[$0]) }
        }
        var request = URLRequest(url: components.url!, timeoutInterval: timeout)
        request.httpMethod = method
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("misarpost-swift/\(Transport.version)", forHTTPHeaderField: "User-Agent")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }

        var attempt = 0
        while true {
            let data: Data
            let response: URLResponse
            do {
                (data, response) = try await session.data(for: request)
            } catch {
                if attempt + 1 < maxRetries {
                    try await Task.sleep(nanoseconds: Transport.backoff(attempt, nil))
                    attempt += 1
                    continue
                }
                throw MisarPostError(status: 0, code: "network_error", message: "\(error)", body: nil)
            }
            let http = response as? HTTPURLResponse
            let status = http?.statusCode ?? 0
            let decoded: Any? = data.isEmpty ? nil : (try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]))
                ?? String(data: data, encoding: .utf8)

            if (200..<300).contains(status) {
                if decoded == nil { return [:] }
                if let object = decoded as? [String: Any] { return object }
                return ["data": decoded as Any]
            }

            // Plan refusals first, by code — never retried.
            if let object = decoded as? [String: Any], Transport.isPlanLimitBody(object) {
                throw Transport.planLimit(status: status, response: http, body: object)
            }

            if Transport.retryable.contains(status) && attempt + 1 < maxRetries {
                try await Task.sleep(nanoseconds: Transport.backoff(attempt, http?.value(forHTTPHeaderField: "retry-after")))
                attempt += 1
                continue
            }

            let object = decoded as? [String: Any] ?? [:]
            let message = (object["error"] as? String) ?? (object["message"] as? String) ?? "HTTP \(status)"
            throw MisarPostError(status: status, code: (object["code"] as? String) ?? "api_error", message: message, body: decoded)
        }
    }

    static func isPlanLimitBody(_ body: [String: Any]) -> Bool {
        (body["code"] as? String) == "plan_limit_exceeded" || body["upgrade"] is [String: Any]
    }

    static func backoff(_ attempt: Int, _ retryAfter: String?) -> UInt64 {
        if let retryAfter, let secs = Double(retryAfter.trimmingCharacters(in: .whitespaces)) {
            return UInt64(min(secs, 60) * 1_000_000_000)
        }
        return UInt64(200_000_000) << UInt64(attempt)
    }

    static func planLimit(status: Int, response: HTTPURLResponse?, body: [String: Any]) -> MisarPostPlanLimitError {
        let offer = body["upgrade"] as? [String: Any]
        func str(_ path: String...) -> String? {
            var cur: Any? = offer
            for key in path { cur = (cur as? [String: Any])?[key] }
            return cur as? String
        }
        let header = { (name: String) in response?.value(forHTTPHeaderField: name) }
        return MisarPostPlanLimitError(
            status: status,
            message: (body["error"] as? String) ?? str("headline") ?? "Plan limit exceeded",
            offer: offer,
            plan: header("x-misar-plan") ?? str("current_plan", "slug"),
            upgradeURL: header("x-misar-upgrade-url") ?? str("urls", "pricing"),
            retryAfter: header("retry-after").flatMap { Int($0) },
            feature: str("feature")
        )
    }
}
