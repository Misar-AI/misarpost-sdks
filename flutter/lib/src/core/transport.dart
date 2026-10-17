import 'dart:convert';

import 'package:http/http.dart' as http;

import 'errors.dart';

/// HTTP transport the generated resource layer is written against. One
/// credential, one path in: the account API key (`mpk_…`) sent as
/// `Authorization: Bearer`. Retries throttles, 5xx and network failures with
/// exponential backoff from 200 ms honouring `Retry-After` — never a plan refusal.
class Transport {
  static const version = '1.0.0';
  static const defaultBaseUrl = 'https://api.misar.io/post';
  static const _retryable = {429, 500, 502, 503, 504};

  final String _apiKey;
  final String baseUrl;
  final int maxRetries;
  final Duration timeout;
  final http.Client _http;

  Transport(
    String apiKey, {
    String baseUrl = defaultBaseUrl,
    this.maxRetries = 3,
    this.timeout = const Duration(seconds: 30),
    http.Client? httpClient,
  })  : _apiKey = apiKey,
        baseUrl = baseUrl.replaceAll(RegExp(r'/+$'), ''),
        _http = httpClient ?? http.Client() {
    if (apiKey.isEmpty) {
      throw ArgumentError(
          'A MisarPost API key is required. Create one at https://post.misar.io/dashboard/api-keys (it starts with mpk_).');
    }
  }

  /// Encode one path parameter.
  static String enc(String value) => Uri.encodeComponent(value);

  /// Send one API request; generated resources call this.
  Future<Map<String, dynamic>> request(
    String method,
    String path, {
    Map<String, dynamic>? query,
    Map<String, dynamic>? body,
  }) async {
    final params = <String, String>{
      for (final e in (query ?? const <String, dynamic>{}).entries)
        if (e.value != null) e.key: e.value.toString(),
    };
    final url = Uri.parse('$baseUrl$path').replace(queryParameters: params.isEmpty ? null : params);
    final headers = {
      'Authorization': 'Bearer $_apiKey',
      'Accept': 'application/json',
      'User-Agent': 'misarpost-flutter/$version',
      if (body != null) 'Content-Type': 'application/json',
    };

    for (var attempt = 0;; attempt++) {
      http.Response resp;
      try {
        final req = http.Request(method, url)..headers.addAll(headers);
        if (body != null) req.body = jsonEncode(body);
        resp = await http.Response.fromStream(await _http.send(req).timeout(timeout));
      } catch (e) {
        if (e is MisarPostException) rethrow;
        if (attempt + 1 < maxRetries) {
          await Future<void>.delayed(_backoff(attempt, null));
          continue;
        }
        throw MisarPostException(0, e.toString(), code: 'network_error');
      }

      Object? data;
      if (resp.body.trim().isNotEmpty) {
        try {
          data = jsonDecode(resp.body);
        } on FormatException {
          data = resp.body;
        }
      }
      final status = resp.statusCode;
      if (status >= 200 && status < 300) {
        if (data == null) return <String, dynamic>{};
        if (data is Map<String, dynamic>) return data;
        return {'data': data};
      }

      // Plan refusals first, by code — never retried.
      if (data is Map<String, dynamic> && isPlanLimitBody(data)) {
        throw _planLimit(resp, data);
      }

      if (_retryable.contains(status) && attempt + 1 < maxRetries) {
        await Future<void>.delayed(_backoff(attempt, resp.headers['retry-after']));
        continue;
      }

      final obj = data is Map<String, dynamic> ? data : const <String, dynamic>{};
      final message = (obj['error'] ?? obj['message'] ?? 'HTTP $status').toString();
      throw MisarPostException(status, message, code: (obj['code'] ?? 'api_error').toString(), body: data);
    }
  }

  static bool isPlanLimitBody(Map<String, dynamic> body) =>
      body['code'] == 'plan_limit_exceeded' || body['upgrade'] is Map;

  static MisarPostPlanLimitException _planLimit(http.Response resp, Map<String, dynamic> body) {
    final offer = body['upgrade'] is Map ? Map<String, dynamic>.from(body['upgrade'] as Map) : null;
    String? str(List<String> path) {
      Object? cur = offer;
      for (final k in path) {
        cur = cur is Map ? cur[k] : null;
      }
      return cur is String ? cur : null;
    }

    return MisarPostPlanLimitException(
      resp.statusCode,
      (body['error'] ?? str(['headline']) ?? 'Plan limit exceeded').toString(),
      body: body,
      offer: offer,
      plan: resp.headers['x-misar-plan'] ?? str(['current_plan', 'slug']),
      upgradeUrl: resp.headers['x-misar-upgrade-url'] ?? str(['urls', 'pricing']),
      retryAfter: int.tryParse(resp.headers['retry-after'] ?? ''),
      feature: str(['feature']),
    );
  }

  static Duration _backoff(int attempt, String? retryAfter) {
    final secs = double.tryParse(retryAfter ?? '');
    if (secs != null) return Duration(milliseconds: (secs.clamp(0, 60) * 1000).round());
    return Duration(milliseconds: 200 << attempt);
  }

  /// Close the underlying HTTP client.
  void close() => _http.close();
}
