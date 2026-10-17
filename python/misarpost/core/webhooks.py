"""Verify an outbound webhook delivery from MisarPost.

Every delivery carries ``X-MisarPost-Signature: sha256=<hex>`` — the HMAC-SHA256 of
the RAW request body keyed with the endpoint's ``mpwh_`` signing secret. Verify the
raw bytes before parsing JSON.
"""

from __future__ import annotations

import hashlib
import hmac
from typing import Optional, Union

WEBHOOK_SIGNATURE_HEADER = "X-MisarPost-Signature"


def compute_webhook_signature(secret: str, raw_body: Union[str, bytes]) -> str:
    body = raw_body.encode() if isinstance(raw_body, str) else raw_body
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def verify_webhook_signature(secret: str, raw_body: Union[str, bytes], signature_header: Optional[str]) -> bool:
    if not secret or not signature_header:
        return False
    expected = compute_webhook_signature(secret, raw_body)
    return hmac.compare_digest(expected, signature_header.strip().lower())
