import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// MisarPost API client. Every resource (`client.posts`, `client.generate`, …) is
/// generated from the API's own route tree (sdks/manifest.json).
///
///     let post = try MisarPostClient(apiKey: ProcessInfo.processInfo.environment["MISARPOST_API_KEY"]!)
///     let queued = try await post.posts.list(query: ["status": "queued"])
public final class MisarPostClient: Resources {
    public let transport: Transport

    public init(apiKey: String, baseURL: String = Transport.defaultBaseURL, maxRetries: Int = 3,
                timeout: TimeInterval = 30, session: URLSession = .shared) throws {
        let transport = try Transport(apiKey: apiKey, baseURL: baseURL, maxRetries: maxRetries,
                                      timeout: timeout, session: session)
        self.transport = transport
        super.init(transport)
    }

    public var baseURL: String { transport.baseURL }
}
