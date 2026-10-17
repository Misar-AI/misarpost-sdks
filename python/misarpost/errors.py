"""Typed errors for the MisarPost SDK.

Plan refusals are detected by the body's ``code == "plan_limit_exceeded"`` (or an
``upgrade`` object) BEFORE the status is consulted, and are never retried — a quota
block must not be mistaken for an ordinary throttle.
"""

from __future__ import annotations

from typing import Any, Mapping, Optional


class MisarPostError(Exception):
    """Any non-2xx answer from the MisarPost API."""

    def __init__(self, status: int, message: str, code: str = "api_error", body: Any = None) -> None:
        self.status = status
        self.code = code
        self.body = body
        self.message = message
        super().__init__(f"misarpost: API error {status} ({code}): {message}")

    @property
    def is_unauthorized(self) -> bool:
        """The key was rejected outright: missing, revoked, expired, or another product's."""
        return self.status == 401

    @property
    def is_forbidden(self) -> bool:
        """The key is valid but lacks the scope this endpoint requires."""
        return self.status == 403

    @property
    def is_retryable(self) -> bool:
        """Worth retrying as-is: a transient server condition or a throttle."""
        return self.status == 429 or 500 <= self.status < 600


class MisarPostNetworkError(MisarPostError):
    def __init__(self, message: str, cause: Optional[BaseException] = None) -> None:
        self.cause = cause
        super().__init__(0, message, "network_error")


class MisarPostPlanLimitError(MisarPostError):
    """The plan behind the API key blocks this call (HTTP 402, ``plan_limit_exceeded``).

    A monthly allowance is spent, or the feature is not on the plan. Never retried —
    retrying cannot help until the allowance resets or the plan changes.

    Attributes:
        offer: the server's upgrade offer (all copy comes from the server).
        plan: the account's current plan slug.
        upgrade_url: pricing page to send the user to.
        retry_after: seconds until a monthly allowance resets, when supplied.
        feature: the feature whose allowance was exhausted.
    """

    def __init__(self, status: int, message: str, body: Any = None, headers: Optional[Mapping[str, str]] = None) -> None:
        h = {k.lower(): v for k, v in (headers or {}).items()}
        data = body if isinstance(body, dict) else {}
        offer = data.get("upgrade") if isinstance(data.get("upgrade"), dict) else None
        self.offer: Optional[dict] = offer
        current = (offer or {}).get("current_plan") or {}
        self.plan: Optional[str] = h.get("x-misar-plan") or current.get("slug")
        self.upgrade_url: Optional[str] = h.get("x-misar-upgrade-url") or ((offer or {}).get("urls") or {}).get("pricing")
        retry = h.get("retry-after")
        self.retry_after: Optional[int] = int(retry) if retry and str(retry).isdigit() else None
        self.feature: Optional[str] = (offer or {}).get("feature")
        super().__init__(status, message, "plan_limit_exceeded", body)


def is_plan_limit_body(data: Any) -> bool:
    """True when an error body carries the API's plan-refusal marker."""
    return isinstance(data, dict) and (
        data.get("code") == "plan_limit_exceeded" or isinstance(data.get("upgrade"), dict)
    )
