"""
Unsubscribe token helpers using HMAC-SHA256.

Token format (URL-safe base64):  <contact_id>:<timestamp>:<hmac>

- contact_id  : int, the Contact PK
- timestamp   : int, Unix epoch seconds when token was issued
- hmac        : hex digest of HMAC-SHA256(SECRET_KEY, f"{contact_id}:{timestamp}")

Tokens expire after TOKEN_TTL_DAYS days (default 30).
"""

import hashlib
import hmac
import time
import base64

from django.conf import settings

TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60   # 30 days


def _sign(contact_id: int, timestamp: int) -> str:
    message = f"{contact_id}:{timestamp}".encode()
    return hmac.new(
        settings.SECRET_KEY.encode(),
        message,
        hashlib.sha256
    ).hexdigest()


def generate_unsubscribe_token(contact_id: int) -> str:
    """Return a URL-safe base64-encoded token for the given contact."""
    ts = int(time.time())
    sig = _sign(contact_id, ts)
    raw = f"{contact_id}:{ts}:{sig}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def verify_unsubscribe_token(token: str) -> int | None:
    """
    Verify token and return the contact_id if valid and not expired.
    Returns None on any failure.
    """
    try:
        raw = base64.urlsafe_b64decode(token.encode()).decode()
        parts = raw.split(':', 2)
        if len(parts) != 3:
            return None

        contact_id_str, timestamp_str, provided_sig = parts
        contact_id = int(contact_id_str)
        timestamp = int(timestamp_str)

        # Check expiry
        if time.time() - timestamp > TOKEN_TTL_SECONDS:
            return None

        # Constant-time compare to prevent timing attacks
        expected_sig = _sign(contact_id, timestamp)
        if not hmac.compare_digest(expected_sig, provided_sig):
            return None

        return contact_id

    except Exception:
        return None
