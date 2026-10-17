/// Any non-2xx answer from the MisarPost API, or a transport failure (status 0).
class MisarPostException implements Exception {
  /// HTTP status; 0 for a network failure.
  final int status;

  /// Machine code from the body's `code`, e.g. `insufficient_scope`.
  final String code;
  final String message;

  /// The decoded error body.
  final Object? body;

  MisarPostException(this.status, this.message, {this.code = 'api_error', this.body});

  /// The key was rejected outright: missing, revoked, expired, or another product's.
  bool get isUnauthorized => status == 401;

  /// The key is valid but lacks the scope this endpoint requires.
  bool get isForbidden => status == 403;

  @override
  String toString() => 'misarpost: API error $status ($code): $message';
}

/// The plan behind the API key blocks this call: HTTP 402 with
/// `code: "plan_limit_exceeded"` and an upgrade offer. Detected by code before
/// the status and never retried. All copy comes from the server.
class MisarPostPlanLimitException extends MisarPostException {
  /// The server's upgrade offer (headline, plans, cta, urls…).
  final Map<String, dynamic>? offer;

  /// The account's current plan slug.
  final String? plan;

  /// Pricing page to send the user to.
  final String? upgradeUrl;

  /// Seconds until a monthly allowance resets, when supplied.
  final int? retryAfter;

  /// The feature whose allowance was exhausted.
  final String? feature;

  MisarPostPlanLimitException(
    super.status,
    super.message, {
    super.body,
    this.offer,
    this.plan,
    this.upgradeUrl,
    this.retryAfter,
    this.feature,
  }) : super(code: 'plan_limit_exceeded');
}
