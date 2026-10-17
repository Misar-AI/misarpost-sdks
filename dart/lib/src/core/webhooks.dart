import 'dart:convert';

import 'package:crypto/crypto.dart';

/// Outbound webhook deliveries carry `X-MisarPost-Signature: sha256=<hex>` — the
/// HMAC-SHA256 of the RAW request body keyed with the endpoint's `mpwh_` secret.
const webhookSignatureHeader = 'X-MisarPost-Signature';

String computeWebhookSignature(String secret, List<int> rawBody) =>
    'sha256=${Hmac(sha256, utf8.encode(secret)).convert(rawBody)}';

/// Constant-time check of [signatureHeader] against the raw body.
bool verifyWebhookSignature(String secret, List<int> rawBody, String? signatureHeader) {
  if (secret.isEmpty || signatureHeader == null) return false;
  final expected = utf8.encode(computeWebhookSignature(secret, rawBody));
  final given = utf8.encode(signatureHeader.trim().toLowerCase());
  if (expected.length != given.length) return false;
  var diff = 0;
  for (var i = 0; i < expected.length; i++) {
    diff |= expected[i] ^ given[i];
  }
  return diff == 0;
}
