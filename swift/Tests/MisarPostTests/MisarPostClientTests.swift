import Foundation
import Testing
@testable import MisarPost
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Serves canned replies and records every request — no network.
final class StubProtocol: URLProtocol {
    struct Reply { let status: Int; let body: String; let headers: [String: String] }
    nonisolated(unsafe) static var replies: [Reply] = []
    nonisolated(unsafe) static var requests: [URLRequest] = []
    nonisolated(unsafe) static var bodies: [Data] = []

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        StubProtocol.requests.append(request)
        if let stream = request.httpBodyStream {
            stream.open()
            var data = Data()
            var buffer = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable {
                let n = stream.read(&buffer, maxLength: buffer.count)
                if n <= 0 { break }
                data.append(buffer, count: n)
            }
            stream.close()
            StubProtocol.bodies.append(data)
        } else {
            StubProtocol.bodies.append(request.httpBody ?? Data())
        }
        let reply = StubProtocol.replies.count > 1 ? StubProtocol.replies.removeFirst() : StubProtocol.replies[0]
        var headers = reply.headers
        headers["Content-Type"] = "application/json"
        let response = HTTPURLResponse(url: request.url!, statusCode: reply.status, httpVersion: nil, headerFields: headers)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(reply.body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

// swift-testing (Swift 6 toolchains, macOS Command Line Tools and Linux alike).
// Serialized: the URLProtocol stub keeps its replies in static state.
@Suite(.serialized)
struct MisarPostClientTests {
    let offer = #"{"feature":"ai_text_actions","headline":"limit","current_plan":{"slug":"free"},"urls":{"pricing":"https://post.misar.io/pricing"},"cta":"Upgrade to continue."}"#

    init() {
        StubProtocol.replies = []
        StubProtocol.requests = []
        StubProtocol.bodies = []
    }

    func client() throws -> MisarPostClient {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubProtocol.self]
        return try MisarPostClient(apiKey: "mpk_test", baseURL: "https://api.misar.io/post", session: URLSession(configuration: config))
    }

    @Test func testRequiresApiKey() {
        #expect(throws: MisarPostError.self) { try MisarPostClient(apiKey: "") }
    }

    @Test func testBearerAndQuery() async throws {
        StubProtocol.replies = [.init(status: 200, body: #"{"posts":[]}"#, headers: [:])]
        _ = try await client().posts.list(query: ["status": "queued"])
        let req = StubProtocol.requests[0]
        #expect(req.url?.absoluteString == "https://api.misar.io/post/posts?status=queued")
        #expect(req.value(forHTTPHeaderField: "Authorization") == "Bearer mpk_test")
    }

    @Test func testPathEncodingAndBody() async throws {
        StubProtocol.replies = [.init(status: 200, body: #"{"post":{}}"#, headers: [:])]
        _ = try await client().posts.update("a/b", body: ["contentText": "hi"])
        #expect(StubProtocol.requests[0].httpMethod == "PATCH")
        #expect(StubProtocol.requests[0].url?.absoluteString == "https://api.misar.io/post/posts/a%2Fb")
        let sent = try JSONSerialization.jsonObject(with: StubProtocol.bodies[0]) as? [String: String]
        #expect(sent == ["contentText": "hi"])
    }

    @Test func testRequiredQuery() async throws {
        StubProtocol.replies = [.init(status: 200, body: #"{"ok":true}"#, headers: [:])]
        _ = try await client().workspaces.removeMember("ws1", "m1")
        #expect(StubProtocol.requests[0].url?.query == "memberId=m1")
    }

    @Test func testRetriesThenSucceeds() async throws {
        StubProtocol.replies = [
            .init(status: 503, body: #"{"error":"busy"}"#, headers: ["Retry-After": "0"]),
            .init(status: 429, body: #"{"error":"slow"}"#, headers: ["Retry-After": "0"]),
            .init(status: 200, body: #"{"ok":true}"#, headers: [:]),
        ]
        let res = try await client().analytics.stats()
        #expect(res["ok"] as? Bool == true)
        #expect(StubProtocol.requests.count == 3)
    }

    @Test func testPlanLimitNotRetried() async throws {
        StubProtocol.replies = [.init(status: 402, body: #"{"error":"limit","code":"plan_limit_exceeded","upgrade":"# + offer + "}",
                                      headers: ["Retry-After": "3600", "x-misar-plan": "free"])]
        do {
            _ = try await client().generate.enhance(body: ["content": "x"])
            Issue.record("expected a plan-limit error")
        } catch let limit as MisarPostPlanLimitError {
            #expect(limit.feature == "ai_text_actions")
            #expect(limit.plan == "free")
            #expect(limit.upgradeURL == "https://post.misar.io/pricing")
            #expect(limit.retryAfter == 3600)
        }
        #expect(StubProtocol.requests.count == 1)
    }

    @Test func testPlanLimitOn429() async throws {
        StubProtocol.replies = [.init(status: 429, body: #"{"error":"quota","code":"plan_limit_exceeded","upgrade":"# + offer + "}", headers: [:])]
        do {
            _ = try await client().generate.create(body: ["prompt": "x"])
            Issue.record("expected a plan-limit error")
        } catch is MisarPostPlanLimitError {}
        #expect(StubProtocol.requests.count == 1)
    }

    @Test func testScopeRefusal() async throws {
        StubProtocol.replies = [.init(status: 403, body: #"{"error":"lacks scope","code":"insufficient_scope"}"#, headers: [:])]
        do {
            _ = try await client().webhooks.listOutbound()
            Issue.record("expected an error")
        } catch let error as MisarPostError {
            #expect(error.status == 403)
            #expect(error.code == "insufficient_scope")
        }
    }

    @Test func testPaginate() async throws {
        let pages = try await paginate { page in ["posts": [page], "totalPages": 3] }
        #expect(pages.count == 3)
    }

    @Test func testWebhookSignature() {
        let body = Data(#"{"event":"post.published"}"#.utf8)
        let sig = Webhooks.computeSignature(secret: "mpwh_secret", rawBody: body)
        // Known-answer check against Node's crypto.createHmac for the same input.
        #expect(sig.hasPrefix("sha256="))
        #expect(Webhooks.verifyWebhookSignature(secret: "mpwh_secret", rawBody: body, signatureHeader: sig))
        #expect(!Webhooks.verifyWebhookSignature(secret: "mpwh_secret", rawBody: Data(#"{"event":"tampered"}"#.utf8), signatureHeader: sig))
    }

    @Test func testSHA256KnownAnswer() {
        let digest = Webhooks.sha256(Array("abc".utf8)).map { String(format: "%02x", $0) }.joined()
        #expect(digest == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
        let mac = Webhooks.computeSignature(secret: "key", rawBody: Data("The quick brown fox jumps over the lazy dog".utf8))
        #expect(mac == "sha256=f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8")
    }
}
