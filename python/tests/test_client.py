import json

import httpx
import pytest

from misarpost import (
    MisarPostClient,
    MisarPostError,
    MisarPostPlanLimitError,
    compute_webhook_signature,
    paginate,
    verify_webhook_signature,
)
from misarpost.core import transport as transport_module

OFFER = {
    "product": "post",
    "reason": "quota_exhausted",
    "feature": "ai_text_actions",
    "headline": "You've reached your Free plan's ai text actions limit (30/30 this month).",
    "current_plan": {"slug": "free", "name": "Free"},
    "urls": {"pricing": "https://post.misar.io/pricing"},
    "cta": "Upgrade to continue.",
    "plans": [],
}


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    monkeypatch.setattr(transport_module.time, "sleep", lambda s: None)


def client_with(responses, calls):
    queue = list(responses)

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        status, body, headers = queue.pop(0) if len(queue) > 1 else queue[0]
        return httpx.Response(status, json=body, headers=headers or {})

    http = httpx.Client(transport=httpx.MockTransport(handler))
    return MisarPostClient("mpk_test", http_client=http)


def test_requires_api_key():
    with pytest.raises(ValueError, match="API key is required"):
        MisarPostClient("")


def test_bearer_header_and_url():
    calls = []
    post = client_with([(200, {"posts": [], "totalPages": 0}, None)], calls)
    post.posts.list({"status": "queued", "page": 2})
    req = calls[0]
    assert str(req.url) == "https://api.misar.io/post/posts?status=queued&page=2"
    assert req.headers["authorization"] == "Bearer mpk_test"


def test_path_encoding_and_body():
    calls = []
    post = client_with([(200, {"post": {}}, None)], calls)
    post.posts.update("a/b", {"contentText": "hi"})
    assert calls[0].url.raw_path == b"/post/posts/a%2Fb"
    assert calls[0].method == "PATCH"
    assert json.loads(calls[0].content) == {"contentText": "hi"}


def test_required_query_is_positional():
    calls = []
    post = client_with([(200, {"ok": True}, None)], calls)
    post.workspaces.remove_member("ws1", "m1")
    assert calls[0].method == "DELETE"
    assert calls[0].url.params["memberId"] == "m1"


def test_retries_then_succeeds():
    calls = []
    post = client_with(
        [(503, {"error": "busy"}, {"retry-after": "0"}), (429, {"error": "slow"}, {"retry-after": "0"}), (200, {"ok": True}, None)],
        calls,
    )
    assert post.analytics.stats() == {"ok": True}
    assert len(calls) == 3


def test_plan_limit_is_typed_and_not_retried():
    calls = []
    post = client_with(
        [(402, {"error": "limit", "code": "plan_limit_exceeded", "upgrade": OFFER},
          {"retry-after": "3600", "x-misar-plan": "free", "x-misar-upgrade-url": "https://post.misar.io/pricing"})],
        calls,
    )
    with pytest.raises(MisarPostPlanLimitError) as info:
        post.generate.enhance({"content": "x"})
    err = info.value
    assert err.feature == "ai_text_actions"
    assert err.plan == "free"
    assert err.upgrade_url == "https://post.misar.io/pricing"
    assert err.retry_after == 3600
    assert err.offer["cta"] == "Upgrade to continue."
    assert len(calls) == 1


def test_plan_limit_detected_by_code_on_429():
    calls = []
    post = client_with([(429, {"error": "quota", "code": "plan_limit_exceeded", "upgrade": OFFER}, None)], calls)
    with pytest.raises(MisarPostPlanLimitError):
        post.generate.create({"prompt": "x"})
    assert len(calls) == 1


def test_scope_refusal():
    calls = []
    post = client_with([(403, {"error": "lacks scope", "code": "insufficient_scope"}, None)], calls)
    with pytest.raises(MisarPostError) as info:
        post.webhooks.list_outbound()
    assert info.value.status == 403
    assert info.value.code == "insufficient_scope"


def test_non_object_json_is_wrapped():
    calls = []
    post = client_with([(200, [1, 2], None)], calls)
    assert post.post_tags.list() == {"data": [1, 2]}


async def test_async_twin():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={"posts": []})

    post = MisarPostClient("mpk_test", async_http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    assert await post.posts.alist() == {"posts": []}
    assert calls[0].headers["authorization"] == "Bearer mpk_test"


def test_paginate():
    seen = [p["page"] for p in paginate(lambda n: {"posts": [n], "page": n, "totalPages": 3})]
    assert seen == [1, 2, 3]


def test_webhook_signature():
    sig = compute_webhook_signature("mpwh_secret", '{"event":"post.published"}')
    assert sig.startswith("sha256=") and len(sig) == 71
    assert verify_webhook_signature("mpwh_secret", '{"event":"post.published"}', sig)
    assert not verify_webhook_signature("mpwh_secret", '{"event":"tampered"}', sig)
