from __future__ import annotations

from typing import Optional

import httpx

from .core.transport import DEFAULT_BASE_URL, Transport
from .generated.resources import GeneratedResources


class MisarPostClient(GeneratedResources):
    """MisarPost API client.

        post = MisarPostClient(os.environ["MISARPOST_API_KEY"])
        queued = post.posts.list({"status": "queued"})

    Every resource and method is generated from the API's own route tree
    (sdks/manifest.json). Each method has an ``a``-prefixed async twin.
    """

    def __init__(
        self,
        api_key: str,
        *,
        base_url: str = DEFAULT_BASE_URL,
        max_retries: int = 3,
        timeout: float = 30.0,
        http_client: Optional[httpx.Client] = None,
        async_http_client: Optional[httpx.AsyncClient] = None,
    ) -> None:
        self.transport = Transport(
            api_key,
            base_url,
            max_retries=max_retries,
            timeout=timeout,
            http_client=http_client,
            async_http_client=async_http_client,
        )
        super().__init__(self.transport)

    @property
    def base_url(self) -> str:
        return self.transport.base_url
