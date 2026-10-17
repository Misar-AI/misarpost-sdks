"""HTTP transport the generated resource layer is written against.

One credential, one path in: the account API key (``mpk_…``), sent as
``Authorization: Bearer``. What a key may do is decided server-side from its scopes
and its plan; the SDK carries the key and surfaces the answer.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any, Mapping, Optional
from urllib.parse import quote

import httpx

from ..errors import (
    MisarPostError,
    MisarPostNetworkError,
    MisarPostPlanLimitError,
    is_plan_limit_body,
)

SDK_VERSION = "1.0.0"
DEFAULT_BASE_URL = "https://api.misar.io/post"
RETRYABLE_STATUSES = frozenset({429, 500, 502, 503, 504})


def enc(value: Any) -> str:
    """Encode one path parameter."""
    return quote(str(value), safe="")


def _clean(params: Optional[Mapping[str, Any]]) -> dict:
    if not params:
        return {}
    out = {}
    for k, v in params.items():
        if v is None:
            continue
        if isinstance(v, bool):
            v = "true" if v else "false"
        out[k] = v
    return out


def _backoff(attempt: int, response: Optional[httpx.Response] = None) -> float:
    """Exponential backoff from 200 ms, honouring Retry-After (capped at 60 s)."""
    if response is not None:
        header = response.headers.get("retry-after")
        if header:
            try:
                return min(float(header), 60.0)
            except ValueError:
                pass
    return 0.2 * (2 ** attempt)


def _normalize(value: Any) -> Any:
    """Every method returns a dict: non-object JSON is wrapped as {"data": value}."""
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    return {"data": value}


def _decode(response: httpx.Response) -> Any:
    try:
        return response.json() if response.content else None
    except ValueError:
        return response.text


class Transport:
    """Low-level request plumbing shared by every generated resource."""

    def __init__(
        self,
        api_key: str,
        base_url: str = DEFAULT_BASE_URL,
        *,
        max_retries: int = 3,
        timeout: float = 30.0,
        http_client: Optional[httpx.Client] = None,
        async_http_client: Optional[httpx.AsyncClient] = None,
    ) -> None:
        if not api_key:
            raise ValueError(
                "A MisarPost API key is required. Create one at "
                "https://post.misar.io/dashboard/api-keys (it starts with mpk_)."
            )
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.max_retries = max(1, max_retries)
        self.timeout = timeout
        self._client = http_client
        self._aclient = async_http_client

    @property
    def headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "application/json",
            "User-Agent": f"misarpost-python/{SDK_VERSION}",
        }

    def _raise_or_retry(self, response: httpx.Response, attempt: int) -> Optional[float]:
        """Raise for a terminal error; return a delay when the call should be retried."""
        data = _decode(response)
        if is_plan_limit_body(data):
            message = str(data.get("error") or (data.get("upgrade") or {}).get("headline") or "Plan limit exceeded")
            raise MisarPostPlanLimitError(response.status_code, message, data, dict(response.headers))
        if response.status_code in RETRYABLE_STATUSES and attempt + 1 < self.max_retries:
            return _backoff(attempt, response)
        body = data if isinstance(data, dict) else {}
        message = body.get("error") or body.get("message") or (data if isinstance(data, str) and data else None) or response.reason_phrase or f"HTTP {response.status_code}"
        raise MisarPostError(response.status_code, str(message), str(body.get("code") or "api_error"), data)

    def request(self, method: str, path: str, *, json: Any = None, params: Optional[Mapping[str, Any]] = None) -> Any:
        url = f"{self.base_url}{path}"
        client = self._client or httpx.Client(timeout=self.timeout)
        try:
            attempt = 0
            while True:
                try:
                    response = client.request(method, url, headers=self.headers, json=json, params=_clean(params))
                except httpx.HTTPError as exc:
                    if attempt + 1 < self.max_retries:
                        time.sleep(_backoff(attempt))
                        attempt += 1
                        continue
                    raise MisarPostNetworkError(str(exc), exc) from exc
                if response.is_success:
                    return _normalize(_decode(response))
                delay = self._raise_or_retry(response, attempt)
                time.sleep(delay or 0)
                attempt += 1
        finally:
            if self._client is None:
                client.close()

    async def arequest(self, method: str, path: str, *, json: Any = None, params: Optional[Mapping[str, Any]] = None) -> Any:
        url = f"{self.base_url}{path}"
        client = self._aclient or httpx.AsyncClient(timeout=self.timeout)
        try:
            attempt = 0
            while True:
                try:
                    response = await client.request(method, url, headers=self.headers, json=json, params=_clean(params))
                except httpx.HTTPError as exc:
                    if attempt + 1 < self.max_retries:
                        await asyncio.sleep(_backoff(attempt))
                        attempt += 1
                        continue
                    raise MisarPostNetworkError(str(exc), exc) from exc
                if response.is_success:
                    return _normalize(_decode(response))
                delay = self._raise_or_retry(response, attempt)
                await asyncio.sleep(delay or 0)
                attempt += 1
        finally:
            if self._aclient is None:
                await client.aclose()
