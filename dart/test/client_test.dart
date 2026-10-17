import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:misarpost/misarpost.dart';
import 'package:test/test.dart';

const offer = {
  'feature': 'ai_text_actions',
  'headline': 'limit',
  'current_plan': {'slug': 'free'},
  'urls': {'pricing': 'https://post.misar.io/pricing'},
  'cta': 'Upgrade to continue.',
};

typedef Reply = (int, Object?, Map<String, String>);

(MisarPostClient, List<http.Request>) client(List<Reply> replies) {
  final seen = <http.Request>[];
  final queue = [...replies];
  final mock = MockClient((req) async {
    seen.add(req);
    final (status, body, headers) = queue.length > 1 ? queue.removeAt(0) : queue.first;
    return http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json', ...headers});
  });
  return (MisarPostClient('mpk_test', httpClient: mock), seen);
}

void main() {
  test('requires an API key', () {
    expect(() => MisarPostClient(''), throwsArgumentError);
  });

  test('sends the key as a bearer token with query params', () async {
    final (post, seen) = client([(200, {'posts': []}, {})]);
    await post.posts.list(query: {'status': 'queued', 'page': 2});
    expect(seen.single.url.toString(), 'https://api.misar.io/post/posts?status=queued&page=2');
    expect(seen.single.headers['Authorization'], 'Bearer mpk_test');
  });

  test('encodes path params and sends JSON bodies', () async {
    final (post, seen) = client([(200, {'post': {}}, {})]);
    await post.posts.update('a/b', body: {'contentText': 'hi'});
    expect(seen.single.method, 'PATCH');
    expect(seen.single.url.toString(), 'https://api.misar.io/post/posts/a%2Fb');
    expect(jsonDecode(seen.single.body), {'contentText': 'hi'});
  });

  test('passes required query params positionally', () async {
    final (post, seen) = client([(200, {'ok': true}, {})]);
    await post.workspaces.removeMember('ws1', 'm1');
    expect(seen.single.url.queryParameters, {'memberId': 'm1'});
  });

  test('retries throttles and 5xx, then succeeds', () async {
    final (post, seen) = client([
      (503, {'error': 'busy'}, {'retry-after': '0'}),
      (429, {'error': 'slow'}, {'retry-after': '0'}),
      (200, {'ok': true}, {}),
    ]);
    expect(await post.analytics.stats(), {'ok': true});
    expect(seen.length, 3);
  });

  test('plan refusals are typed and never retried', () async {
    final (post, seen) = client([
      (402, {'error': 'limit', 'code': 'plan_limit_exceeded', 'upgrade': offer}, {'retry-after': '3600', 'x-misar-plan': 'free'}),
    ]);
    try {
      await post.generate.enhance(body: {'content': 'x'});
      fail('expected a plan-limit exception');
    } on MisarPostPlanLimitException catch (e) {
      expect(e.feature, 'ai_text_actions');
      expect(e.plan, 'free');
      expect(e.upgradeUrl, 'https://post.misar.io/pricing');
      expect(e.retryAfter, 3600);
      expect(e.offer?['cta'], 'Upgrade to continue.');
    }
    expect(seen.length, 1);
  });

  test('a plan refusal on a 429 is detected by code', () async {
    final (post, seen) = client([(429, {'error': 'quota', 'code': 'plan_limit_exceeded', 'upgrade': offer}, {})]);
    await expectLater(post.generate.create(body: {'prompt': 'x'}), throwsA(isA<MisarPostPlanLimitException>()));
    expect(seen.length, 1);
  });

  test('scope refusals carry the server code', () async {
    final (post, _) = client([(403, {'error': 'lacks scope', 'code': 'insufficient_scope'}, {})]);
    await expectLater(
      post.webhooks.listOutbound(),
      throwsA(isA<MisarPostException>().having((e) => e.status, 'status', 403).having((e) => e.code, 'code', 'insufficient_scope')),
    );
  });

  test('non-object JSON is wrapped', () async {
    final (post, _) = client([(200, [1, 2], {})]);
    expect(await post.postTags.list(), {'data': [1, 2]});
  });

  test('paginate walks pages until totalPages', () async {
    final pages = await paginate((p) async => {'posts': [p], 'totalPages': 3}).toList();
    expect(pages.length, 3);
  });

  test('verifies webhook signatures', () {
    final body = utf8.encode('{"event":"post.published"}');
    final sig = computeWebhookSignature('mpwh_secret', body);
    expect(sig, startsWith('sha256='));
    expect(verifyWebhookSignature('mpwh_secret', body, sig), isTrue);
    expect(verifyWebhookSignature('mpwh_secret', utf8.encode('{"event":"tampered"}'), sig), isFalse);
  });
}
