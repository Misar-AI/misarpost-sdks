package io.misar.post

/** Any non-2xx answer from the MisarPost API, or a transport failure (status 0). */
open class MisarPostException(
    val status: Int,
    message: String,
    /** Machine code from the body's `code`, e.g. `insufficient_scope`. */
    val code: String = "api_error",
    val body: Any? = null,
    cause: Throwable? = null,
) : RuntimeException("misarpost: API error $status ($code): $message", cause) {
    /** The key was rejected outright: missing, revoked, expired, or another product's. */
    val isUnauthorized: Boolean get() = status == 401

    /** The key is valid but lacks the scope this endpoint requires. */
    val isForbidden: Boolean get() = status == 403
}

/**
 * The plan behind the API key blocks this call: HTTP 402 with
 * `code: "plan_limit_exceeded"` and an upgrade offer. Detected by code before the
 * status and never retried. All copy comes from the server.
 */
class PlanLimitException(
    status: Int,
    message: String,
    body: Any?,
    /** The server's upgrade offer (headline, plans, cta, urls…). */
    val offer: Map<String, Any?>?,
    /** The account's current plan slug. */
    val plan: String?,
    /** Pricing page to send the user to. */
    val upgradeUrl: String?,
    /** Seconds until a monthly allowance resets, when supplied. */
    val retryAfter: Int?,
    /** The feature whose allowance was exhausted. */
    val feature: String?,
) : MisarPostException(status, message, "plan_limit_exceeded", body)
