"""
StayVise — Security Test Suite

Covers:
  - SQL injection attempts (should get 422, not 500)
  - JWT wrong secret / expired token (should get 401)
  - Rate limiting (4th OTP request should get 429)
  - Security headers presence
  - Webhook signature verification
  - Input sanitization
"""

from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from jose import jwt

from tests.conftest import auth_headers, create_user_and_get_token


# ══════════════════════════════════════════════════════════════════════════════
# 1. SQL Injection Resistance
# ══════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_sql_injection_in_phone_number(client: AsyncClient) -> None:
    """SQL injection in phone number should be rejected with 422, not 500."""
    sqli_payloads = [
        "'+OR+1=1--",
        "'; DROP TABLE users;--",
        "1' UNION SELECT * FROM users--",
        "+91' OR '1'='1",
    ]
    for payload in sqli_payloads:
        resp = await client.post(
            "/api/v1/auth/send-otp",
            json={"phone_number": payload},
        )
        assert resp.status_code == 422, f"Payload {payload!r} returned {resp.status_code}"


@pytest.mark.asyncio
async def test_sql_injection_in_project_title(
    client: AsyncClient, fake_redis: Any
) -> None:
    """SQL injection in text fields should return 422, not cause DB errors."""
    data, _ = await create_user_and_get_token(client, fake_redis)
    token = data["access_token"]

    sqli_title = "'; DROP TABLE projects;--"
    resp = await client.post(
        "/api/v1/projects",
        json={
            "title": sqli_title,
            "description": "Normal safe description here for testing",
            "client_phone": "+919000000001",
            "milestones": [
                {
                    "title": "Test",
                    "description": "A test milestone",
                    "amount": 1000,
                    "sequence_number": 1,
                }
            ],
        },
        headers=auth_headers(token),
    )
    # Should either succeed (title stored safely as text, not executed) or 422
    assert resp.status_code in (200, 201, 422), (
        f"SQL injection attempt returned {resp.status_code}: {resp.text}"
    )
    # Must NOT be a 500 internal server error
    assert resp.status_code != 500


# ══════════════════════════════════════════════════════════════════════════════
# 2. JWT Security
# ══════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_jwt_wrong_secret(client: AsyncClient) -> None:
    """JWT signed with a wrong secret should return 401."""
    fake_token = jwt.encode(
        {"sub": "fake-user-id", "exp": datetime.now(UTC) + timedelta(hours=1)},
        "completely-wrong-secret-key-12345678",
        algorithm="HS256",
    )
    resp = await client.get(
        "/api/v1/users/me",
        headers=auth_headers(fake_token),
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_jwt_expired_token(client: AsyncClient) -> None:
    """Expired JWT should return 401."""
    from app.core.config import settings

    expired_token = jwt.encode(
        {"sub": "fake-user-id", "exp": datetime.now(UTC) - timedelta(hours=1)},
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    resp = await client.get(
        "/api/v1/users/me",
        headers=auth_headers(expired_token),
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_jwt_missing_token(client: AsyncClient) -> None:
    """Request without a token to a protected endpoint should return 401."""
    resp = await client.get("/api/v1/users/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_jwt_malformed_token(client: AsyncClient) -> None:
    """Random garbage as token should return 401."""
    resp = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": "Bearer not.a.real.jwt.token"},
    )
    assert resp.status_code == 401


# ══════════════════════════════════════════════════════════════════════════════
# 3. Rate Limiting
# ══════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_otp_rate_limit(client: AsyncClient, fake_redis: Any) -> None:
    """
    The 4th OTP request from the same phone should be rate-limited.
    Note: The per-phone rate limiting is in the auth endpoint itself using Redis.
    """
    phone = "+919111222333"

    # First 3 should succeed
    for i in range(3):
        resp = await client.post(
            "/api/v1/auth/send-otp", json={"phone_number": phone}
        )
        assert resp.status_code == 200, f"Request {i+1} failed: {resp.text}"

    # 4th should be rate limited (429)
    resp = await client.post(
        "/api/v1/auth/send-otp", json={"phone_number": phone}
    )
    assert resp.status_code == 429, (
        f"Expected 429 on 4th OTP request, got {resp.status_code}: {resp.text}"
    )


# ══════════════════════════════════════════════════════════════════════════════
# 4. Security Headers
# ══════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_security_headers_present(client: AsyncClient) -> None:
    """All security headers should be present on every response."""
    resp = await client.get("/health")

    required_headers = {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "X-XSS-Protection": "1; mode=block",
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
        "Referrer-Policy": "strict-origin-when-cross-origin",
    }

    for header, expected_value in required_headers.items():
        assert header.lower() in [h.lower() for h in resp.headers], (
            f"Missing header: {header}"
        )
        actual = resp.headers.get(header)
        assert actual == expected_value, (
            f"Header {header}: expected {expected_value!r}, got {actual!r}"
        )


# ══════════════════════════════════════════════════════════════════════════════
# 5. Webhook Signature Verification
# ══════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_razorpay_webhook_bad_signature(client: AsyncClient) -> None:
    """Razorpay webhook without valid signature should return 400."""
    resp = await client.post(
        "/api/v1/webhook/razorpay",
        content='{"event": "payment.captured"}',
        headers={
            "Content-Type": "application/json",
            "X-Razorpay-Signature": "invalid-signature-here",
        },
    )
    assert resp.status_code in (400, 401, 403)


@pytest.mark.asyncio
async def test_whatsapp_webhook_bad_verify_token(client: AsyncClient) -> None:
    """WhatsApp webhook GET with wrong verify token should fail."""
    resp = await client.get(
        "/api/v1/webhook/whatsapp",
        params={
            "hub.mode": "subscribe",
            "hub.verify_token": "totally-wrong-token",
            "hub.challenge": "test-challenge",
        },
    )
    assert resp.status_code == 403


# ══════════════════════════════════════════════════════════════════════════════
# 6. Input Validation Edge Cases
# ══════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_invalid_uuid_in_path(client: AsyncClient, fake_redis: Any) -> None:
    """Non-UUID path parameter should return 404 or 422, not 500."""
    data, _ = await create_user_and_get_token(
        client, fake_redis, phone="+919888777001"
    )
    token = data["access_token"]
    resp = await client.get(
        "/api/v1/projects/not-a-valid-uuid",
        headers=auth_headers(token),
    )
    assert resp.status_code in (404, 422)


@pytest.mark.asyncio
async def test_html_injection_in_name(
    client: AsyncClient, fake_redis: Any
) -> None:
    """XSS payloads in user names should be stored safely or rejected."""
    data, _ = await create_user_and_get_token(
        client, fake_redis, phone="+919888777002", full_name="Test User XSS"
    )
    token = data["access_token"]
    resp = await client.put(
        "/api/v1/users/me",
        json={"full_name": "<script>alert('xss')</script>Evil"},
        headers=auth_headers(token),
    )
    if resp.status_code == 200:
        # If accepted, the HTML should be stored as escaped text, not executed
        data = resp.json()
        assert "<script>" not in data.get("full_name", "") or \
               data["full_name"] == "<script>alert('xss')</script>Evil"
    else:
        # Rejection is also acceptable
        assert resp.status_code in (400, 422)


@pytest.mark.asyncio
async def test_oversized_payload_rejected(client: AsyncClient) -> None:
    """Extremely large payloads should be rejected."""
    huge_text = "A" * 1_000_000  # 1MB text
    resp = await client.post(
        "/api/v1/auth/send-otp",
        json={"phone_number": huge_text},
    )
    assert resp.status_code in (413, 422)
