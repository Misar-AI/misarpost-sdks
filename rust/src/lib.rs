//! Async Rust client for MisarPost's social publishing API at
//! <https://api.misar.io/post>: schedule and publish posts across every
//! connected channel, generate and repurpose content with AI, research trends,
//! run PersonaForge and read analytics.
//!
//! Every resource (`client.posts()`, `client.generate()`, …) is generated from
//! the API's own route tree. Calls authenticate with a MisarPost API key
//! (`mpk_…`) sent as `Authorization: Bearer`, retry throttles, 5xx and network
//! failures with exponential back-off honouring `Retry-After`, and surface plan
//! refusals as [`MisarPostError::PlanLimit`] without retrying.

// PlanLimit carries the full upgrade offer by design; boxing it would make
// every caller's match arm noisier for no practical gain.
#![allow(clippy::result_large_err)]

use std::collections::BTreeMap;
use std::time::Duration;

use reqwest::{Method, StatusCode};
use serde_json::Value;

mod errors;
// Generated from sdks/manifest.json; formatting is the generator's, not rustfmt's.
#[rustfmt::skip]
pub mod generated;
mod pagination;
mod webhooks;

pub use errors::MisarPostError;
pub use generated::*;
pub use pagination::paginate;
pub use webhooks::{compute_webhook_signature, verify_webhook_signature, WEBHOOK_SIGNATURE_HEADER};

/// SDK version sent in the User-Agent.
pub const VERSION: &str = "1.0.0";
/// Canonical API base (also served at `https://post.misar.io/api`).
pub const DEFAULT_BASE_URL: &str = "https://api.misar.io/post";

/// Optional query parameters for a call.
pub type Query = BTreeMap<String, String>;
/// Result alias for every call.
pub type Result<T> = std::result::Result<T, MisarPostError>;

const RETRYABLE: [u16; 5] = [429, 500, 502, 503, 504];

/// The MisarPost API client.
#[derive(Clone, Debug)]
pub struct Client {
    api_key: String,
    base_url: String,
    max_retries: u32,
    http: reqwest::Client,
}

/// Builder for [`Client`].
#[derive(Debug)]
pub struct ClientBuilder {
    api_key: String,
    base_url: String,
    max_retries: u32,
    timeout: Duration,
}

impl ClientBuilder {
    /// Override the API base URL.
    pub fn base_url(mut self, url: impl Into<String>) -> Self {
        self.base_url = url.into().trim_end_matches('/').to_string();
        self
    }
    /// Total attempts for retryable failures (default 3).
    pub fn max_retries(mut self, n: u32) -> Self {
        self.max_retries = n.max(1);
        self
    }
    /// Per-request timeout (default 30 s).
    pub fn timeout(mut self, d: Duration) -> Self {
        self.timeout = d;
        self
    }
    pub fn build(self) -> Result<Client> {
        if self.api_key.is_empty() {
            return Err(MisarPostError::MissingApiKey);
        }
        let http = reqwest::Client::builder()
            .timeout(self.timeout)
            .user_agent(format!("misarpost-rust/{VERSION}"))
            .build()?;
        Ok(Client {
            api_key: self.api_key,
            base_url: self.base_url,
            max_retries: self.max_retries,
            http,
        })
    }
}

impl Client {
    /// A client with default settings for the given API key (create one at
    /// <https://post.misar.io/dashboard/api-keys> — it starts with `mpk_`).
    pub fn new(api_key: impl Into<String>) -> Result<Self> {
        Self::builder(api_key).build()
    }

    pub fn builder(api_key: impl Into<String>) -> ClientBuilder {
        ClientBuilder {
            api_key: api_key.into(),
            base_url: DEFAULT_BASE_URL.to_string(),
            max_retries: 3,
            timeout: Duration::from_secs(30),
        }
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    /// Send one API request. Generated resources call this; it is public for
    /// endpoints added after this SDK version.
    pub async fn request(
        &self,
        method: Method,
        path: &str,
        query: Option<&Query>,
        body: Option<Value>,
    ) -> Result<Value> {
        let url = format!("{}{}", self.base_url, path);
        let mut attempt = 0u32;
        loop {
            let mut req = self
                .http
                .request(method.clone(), &url)
                .header("Authorization", format!("Bearer {}", self.api_key))
                .header("Accept", "application/json");
            if let Some(q) = query {
                req = req.query(q);
            }
            if let Some(b) = &body {
                req = req.json(b);
            }

            let resp = match req.send().await {
                Ok(r) => r,
                Err(e) => {
                    if attempt + 1 < self.max_retries {
                        tokio::time::sleep(backoff(attempt, None)).await;
                        attempt += 1;
                        continue;
                    }
                    return Err(MisarPostError::Network(e));
                }
            };

            let status = resp.status();
            let headers = resp.headers().clone();
            let text = resp.text().await?;
            let data: Value = if text.trim().is_empty() {
                Value::Null
            } else {
                serde_json::from_str(&text).unwrap_or(Value::String(text))
            };

            if status.is_success() {
                return Ok(match data {
                    Value::Object(_) => data,
                    Value::Null => Value::Object(Default::default()),
                    other => serde_json::json!({ "data": other }),
                });
            }

            // Plan refusals first, by code — never retried.
            if errors::is_plan_limit_body(&data) {
                return Err(plan_limit(status, &headers, data));
            }

            if RETRYABLE.contains(&status.as_u16()) && attempt + 1 < self.max_retries {
                tokio::time::sleep(backoff(
                    attempt,
                    headers.get("retry-after").and_then(|v| v.to_str().ok()),
                ))
                .await;
                attempt += 1;
                continue;
            }

            let message = data
                .get("error")
                .or_else(|| data.get("message"))
                .and_then(Value::as_str)
                .map(str::to_owned)
                .unwrap_or_else(|| status.canonical_reason().unwrap_or("error").to_owned());
            let code = data
                .get("code")
                .and_then(Value::as_str)
                .unwrap_or("api_error")
                .to_owned();
            return Err(MisarPostError::Api {
                status: status.as_u16(),
                code,
                message,
                body: data,
            });
        }
    }
}

/// Exponential backoff from 200 ms, honouring Retry-After (capped at 60 s).
fn backoff(attempt: u32, retry_after: Option<&str>) -> Duration {
    if let Some(secs) = retry_after.and_then(|v| v.trim().parse::<f64>().ok()) {
        return Duration::from_secs_f64(secs.clamp(0.0, 60.0));
    }
    Duration::from_millis(200u64 << attempt.min(8))
}

fn plan_limit(
    status: StatusCode,
    headers: &reqwest::header::HeaderMap,
    data: Value,
) -> MisarPostError {
    let header = |name: &str| {
        headers
            .get(name)
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned)
    };
    let offer = data.get("upgrade").filter(|v| v.is_object()).cloned();
    let pick = |path: &[&str]| -> Option<String> {
        let mut cur = offer.as_ref()?;
        for key in path {
            cur = cur.get(*key)?;
        }
        cur.as_str().map(str::to_owned)
    };
    MisarPostError::PlanLimit {
        status: status.as_u16(),
        message: data
            .get("error")
            .and_then(Value::as_str)
            .map(str::to_owned)
            .or_else(|| pick(&["headline"]))
            .unwrap_or_else(|| "Plan limit exceeded".into()),
        plan: header("x-misar-plan").or_else(|| pick(&["current_plan", "slug"])),
        upgrade_url: header("x-misar-upgrade-url").or_else(|| pick(&["urls", "pricing"])),
        retry_after: header("retry-after").and_then(|v| v.parse().ok()),
        feature: pick(&["feature"]),
        offer,
    }
}

/// Encode one path parameter.
pub(crate) fn enc(value: &str) -> String {
    urlencoding::encode(value).into_owned()
}
