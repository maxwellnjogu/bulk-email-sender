"""
Unit tests for HMAC-based unsubscribe token helpers.
These test pure logic — no DB needed.
"""

import time
import pytest
from unittest.mock import patch

from contacts.tokens import (
    generate_unsubscribe_token,
    verify_unsubscribe_token,
    TOKEN_TTL_SECONDS,
)


class TestUnsubscribeTokens:

    def test_generate_returns_string(self):
        token = generate_unsubscribe_token(42)
        assert isinstance(token, str)
        assert len(token) > 0

    def test_valid_token_returns_contact_id(self):
        token = generate_unsubscribe_token(42)
        assert verify_unsubscribe_token(token) == 42

    def test_different_contacts_different_tokens(self):
        t1 = generate_unsubscribe_token(1)
        t2 = generate_unsubscribe_token(2)
        assert t1 != t2

    def test_tampered_token_rejected(self):
        token = generate_unsubscribe_token(99)
        # flip a character in the middle
        mid = len(token) // 2
        tampered = token[:mid] + ('A' if token[mid] != 'A' else 'B') + token[mid + 1:]
        assert verify_unsubscribe_token(tampered) is None

    def test_expired_token_rejected(self):
        token = generate_unsubscribe_token(5)
        # Advance time past TTL
        future = time.time() + TOKEN_TTL_SECONDS + 1
        with patch('contacts.tokens.time') as mock_time:
            mock_time.time.return_value = future
            assert verify_unsubscribe_token(token) is None

    def test_empty_string_rejected(self):
        assert verify_unsubscribe_token('') is None

    def test_random_string_rejected(self):
        assert verify_unsubscribe_token('notavalidtoken!@#') is None

    def test_truncated_token_rejected(self):
        token = generate_unsubscribe_token(7)
        assert verify_unsubscribe_token(token[:10]) is None
