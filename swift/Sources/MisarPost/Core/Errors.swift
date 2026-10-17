import Foundation

/// Any non-2xx answer from the MisarPost API, or a transport failure (status 0).
public struct MisarPostError: Error, CustomStringConvertible {
    /// HTTP status; 0 for a network failure.
    public let status: Int
    /// Machine code from the body's `code`, e.g. `insufficient_scope`.
    public let code: String
    public let message: String
    /// The decoded error body.
    public let body: Any?

    public var description: String { "misarpost: API error \(status) (\(code)): \(message)" }

    /// The key was rejected outright: missing, revoked, expired, or another product's.
    public var isUnauthorized: Bool { status == 401 }
    /// The key is valid but lacks the scope this endpoint requires.
    public var isForbidden: Bool { status == 403 }
}

/// The plan behind the API key blocks this call: HTTP 402 with
/// `code: "plan_limit_exceeded"` and an upgrade offer. Detected by code before
/// the status and never retried. All copy comes from the server.
public struct MisarPostPlanLimitError: Error, CustomStringConvertible {
    public let status: Int
    public let message: String
    /// The server's upgrade offer (headline, plans, cta, urls…).
    public let offer: [String: Any]?
    /// The account's current plan slug.
    public let plan: String?
    /// Pricing page to send the user to.
    public let upgradeURL: String?
    /// Seconds until a monthly allowance resets, when supplied.
    public let retryAfter: Int?
    /// The feature whose allowance was exhausted.
    public let feature: String?

    public var description: String { "misarpost: plan limit (\(status), plan_limit_exceeded): \(message)" }
}
