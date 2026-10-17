"""Page through MisarPost's ``?page=`` list endpoints.

List responses carry ``page`` and ``totalPages`` (``GET /posts`` →
``{posts, total, page, pageSize, totalPages}``). ``paginate`` requests page 1, 2, …
until the server reports the last page, or — when an endpoint reports no totals —
until a page comes back empty.

    for page in paginate(lambda n: post.posts.list({"status": "queued", "page": n})):
        for item in page["posts"]:
            ...
"""

from __future__ import annotations

from typing import Any, AsyncIterator, Awaitable, Callable, Iterator, Optional


def _done(page_no: int, result: Any) -> bool:
    if not isinstance(result, dict):
        return True
    total = result.get("totalPages")
    if isinstance(total, int) and not isinstance(total, bool):
        return page_no >= total
    items = next((v for v in result.values() if isinstance(v, list)), None)
    return not items


def paginate(fetch_page: Callable[[int], Any], *, start_page: int = 1, max_pages: Optional[int] = None) -> Iterator[Any]:
    page_no, seen = start_page, 0
    while max_pages is None or seen < max_pages:
        result = fetch_page(page_no)
        yield result
        if _done(page_no, result):
            return
        page_no += 1
        seen += 1


async def apaginate(
    fetch_page: Callable[[int], Awaitable[Any]], *, start_page: int = 1, max_pages: Optional[int] = None
) -> AsyncIterator[Any]:
    page_no, seen = start_page, 0
    while max_pages is None or seen < max_pages:
        result = await fetch_page(page_no)
        yield result
        if _done(page_no, result):
            return
        page_no += 1
        seen += 1
