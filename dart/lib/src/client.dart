import 'package:http/http.dart' as http;

import 'core/transport.dart';
import 'generated/resources.dart';

/// MisarPost API client. Every resource (`client.posts`, `client.generate`, …)
/// is generated from the API's own route tree (sdks/manifest.json).
///
/// ```dart
/// final post = MisarPostClient(Platform.environment['MISARPOST_API_KEY']!);
/// final queued = await post.posts.list(query: {'status': 'queued'});
/// ```
class MisarPostClient extends Resources {
  final Transport transport;

  MisarPostClient._(this.transport) : super(transport);

  factory MisarPostClient(
    String apiKey, {
    String baseUrl = Transport.defaultBaseUrl,
    int maxRetries = 3,
    Duration timeout = const Duration(seconds: 30),
    http.Client? httpClient,
  }) =>
      MisarPostClient._(Transport(apiKey,
          baseUrl: baseUrl, maxRetries: maxRetries, timeout: timeout, httpClient: httpClient));

  String get baseUrl => transport.baseUrl;

  /// Close the underlying HTTP client.
  void close() => transport.close();
}
