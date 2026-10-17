use misarpost::{Client, MisarPostError, Query};
use serde_json::json;
use wiremock::matchers::{body_json, header, method, path, query_param};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn offer() -> serde_json::Value {
    json!({
        "feature": "ai_text_actions", "reason": "quota_exhausted", "headline": "limit reached",
        "current_plan": { "slug": "free" }, "urls": { "pricing": "https://post.misar.io/pricing" },
        "cta": "Upgrade to continue."
    })
}

async fn client(server: &MockServer) -> Client {
    Client::builder("mpk_test")
        .base_url(server.uri())
        .build()
        .unwrap()
}

#[test]
fn requires_api_key() {
    assert!(matches!(
        Client::new(""),
        Err(MisarPostError::MissingApiKey)
    ));
}

#[tokio::test]
async fn sends_bearer_and_query() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/posts"))
        .and(header("authorization", "Bearer mpk_test"))
        .and(query_param("status", "queued"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "posts": [] })))
        .expect(1)
        .mount(&server)
        .await;
    let mut q = Query::new();
    q.insert("status".into(), "queued".into());
    let res = client(&server).await.posts().list(Some(&q)).await.unwrap();
    assert_eq!(res, json!({ "posts": [] }));
}

#[tokio::test]
async fn encodes_path_and_sends_body() {
    let server = MockServer::start().await;
    Mock::given(method("PATCH"))
        .and(path("/posts/a%2Fb"))
        .and(body_json(json!({ "contentText": "hi" })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "post": {} })))
        .expect(1)
        .mount(&server)
        .await;
    client(&server)
        .await
        .posts()
        .update("a/b", Some(json!({ "contentText": "hi" })), None)
        .await
        .unwrap();
}

#[tokio::test]
async fn required_query_is_positional() {
    let server = MockServer::start().await;
    Mock::given(method("DELETE"))
        .and(path("/workspaces/ws1/members"))
        .and(query_param("memberId", "m1"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "ok": true })))
        .expect(1)
        .mount(&server)
        .await;
    client(&server)
        .await
        .workspaces()
        .remove_member("ws1", "m1", None)
        .await
        .unwrap();
}

#[tokio::test]
async fn retries_then_succeeds() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/stats"))
        .respond_with(
            ResponseTemplate::new(503)
                .insert_header("retry-after", "0")
                .set_body_json(json!({ "error": "busy" })),
        )
        .up_to_n_times(2)
        .expect(2)
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/stats"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "ok": true })))
        .expect(1)
        .mount(&server)
        .await;
    let res = client(&server).await.analytics().stats(None).await.unwrap();
    assert_eq!(res, json!({ "ok": true }));
}

#[tokio::test]
async fn plan_limit_is_typed_and_not_retried() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/generate/enhance"))
        .respond_with(
            ResponseTemplate::new(402)
                .insert_header("retry-after", "3600")
                .insert_header("x-misar-plan", "free")
                .set_body_json(
                    json!({ "error": "limit", "code": "plan_limit_exceeded", "upgrade": offer() }),
                ),
        )
        .expect(1)
        .mount(&server)
        .await;
    let err = client(&server)
        .await
        .generate()
        .enhance(Some(json!({ "content": "x" })), None)
        .await
        .unwrap_err();
    match err {
        MisarPostError::PlanLimit {
            status,
            plan,
            upgrade_url,
            retry_after,
            feature,
            offer,
            ..
        } => {
            assert_eq!(status, 402);
            assert_eq!(plan.as_deref(), Some("free"));
            assert_eq!(
                upgrade_url.as_deref(),
                Some("https://post.misar.io/pricing")
            );
            assert_eq!(retry_after, Some(3600));
            assert_eq!(feature.as_deref(), Some("ai_text_actions"));
            assert!(offer.is_some());
        }
        other => panic!("expected PlanLimit, got {other:?}"),
    }
}

#[tokio::test]
async fn plan_limit_detected_on_429() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/generate"))
        .respond_with(ResponseTemplate::new(429).set_body_json(
            json!({ "error": "quota", "code": "plan_limit_exceeded", "upgrade": offer() }),
        ))
        .expect(1)
        .mount(&server)
        .await;
    let err = client(&server)
        .await
        .generate()
        .create(Some(json!({ "prompt": "x" })), None)
        .await
        .unwrap_err();
    assert!(matches!(err, MisarPostError::PlanLimit { .. }));
}

#[tokio::test]
async fn scope_refusal_carries_code() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/webhooks/outbound"))
        .respond_with(
            ResponseTemplate::new(403)
                .set_body_json(json!({ "error": "lacks scope", "code": "insufficient_scope" })),
        )
        .mount(&server)
        .await;
    match client(&server)
        .await
        .webhooks()
        .list_outbound(None)
        .await
        .unwrap_err()
    {
        MisarPostError::Api { status, code, .. } => {
            assert_eq!(status, 403);
            assert_eq!(code, "insufficient_scope");
        }
        other => panic!("unexpected {other:?}"),
    }
}

#[tokio::test]
async fn paginates_until_total_pages() {
    let pages = misarpost::paginate(
        |page| async move { Ok(json!({ "posts": [page], "page": page, "totalPages": 3 })) },
        None,
    )
    .await
    .unwrap();
    assert_eq!(pages.len(), 3);
}

#[test]
fn verifies_webhook_signatures() {
    let body = br#"{"event":"post.published"}"#;
    let sig = misarpost::compute_webhook_signature("mpwh_secret", body);
    assert!(sig.starts_with("sha256="));
    assert!(misarpost::verify_webhook_signature(
        "mpwh_secret",
        body,
        &sig
    ));
    assert!(!misarpost::verify_webhook_signature(
        "mpwh_secret",
        br#"{"event":"tampered"}"#,
        &sig
    ));
}
