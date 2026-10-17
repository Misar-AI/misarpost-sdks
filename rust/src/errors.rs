use serde_json::Value;
use thiserror::Error;

/// Everything a MisarPost call can fail with.
#[derive(Debug, Error)]
pub enum MisarPostError {
    /// No API key was supplied.
    #[error(
        "a MisarPost API key is required; create one at https://post.misar.io/dashboard/api-keys"
    )]
    MissingApiKey,

    /// Any non-2xx answer that is not a plan refusal.
    #[error("API error {status} ({code}): {message}")]
    Api {
        status: u16,
        /// Machine code from the body's `code`, e.g. `insufficient_scope`.
        code: String,
        message: String,
        body: Value,
    },

    /// The plan behind the API key blocks this call: HTTP 402 with
    /// `code: "plan_limit_exceeded"` and an upgrade offer. Detected by code
    /// before the status and never retried — retrying cannot help until the
    /// allowance resets or the plan changes.
    #[error("Plan limit ({status}, plan_limit_exceeded): {message}")]
    PlanLimit {
        status: u16,
        message: String,
        /// The server's upgrade offer; all copy comes from the server.
        offer: Option<Value>,
        /// The account's current plan slug.
        plan: Option<String>,
        /// Pricing page to send the user to.
        upgrade_url: Option<String>,
        /// Seconds until a monthly allowance resets, when supplied.
        retry_after: Option<u64>,
        /// The feature whose allowance was exhausted.
        feature: Option<String>,
    },

    /// Transport failure after retries were exhausted.
    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
}

impl MisarPostError {
    /// HTTP status of an API answer (0 for transport errors).
    pub fn status(&self) -> u16 {
        match self {
            MisarPostError::Api { status, .. } | MisarPostError::PlanLimit { status, .. } => {
                *status
            }
            _ => 0,
        }
    }

    /// The pricing URL to send the user to, when this is a plan refusal.
    pub fn upgrade_url(&self) -> Option<&str> {
        match self {
            MisarPostError::PlanLimit { upgrade_url, .. } => upgrade_url.as_deref(),
            _ => None,
        }
    }
}

/// True when an error body carries the API's plan-refusal marker.
pub(crate) fn is_plan_limit_body(body: &Value) -> bool {
    body.get("code").and_then(Value::as_str) == Some("plan_limit_exceeded")
        || body.get("upgrade").map(Value::is_object).unwrap_or(false)
}
