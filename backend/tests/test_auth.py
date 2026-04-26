"""
StayVise — Auth & User management tests (15 tests).

Tests grouped:
  1. OTP flow — happy path, expired, wrong code, lockout, rate limit
  2. User creation — automatic on first OTP verify
  3. JWT — protected endpoints, expired token, refresh
  4. Profile — /users/me, update, public profile, onboarding
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.conftest import auth_headers, create_user_and_get_token


# ══════════════════════════════════════════════════════════════════════════════
# 1. OTP Flow
# ══════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_send_otp_success(client: AsyncClient) -> None:
    """POST /auth/send-otp should return OTP in dev mode."""
    resp = await client.post(
        "/api/v1/auth/send-otp",
        json={"phone_number": "+919876543210"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["message"] == "OTP sent"
    assert data["expires_in"] == 600
    # Dev mode returns OTP in response
    assert "otp" in data
    assert len(data["otp"]) == 6
    assert data["otp"].isdigit()


@pytest.mark.asyncio
async def test_send_otp_invalid_phone(client: AsyncClient) -> None:
    """Reject non-Indian phone numbers."""
    resp = await client.post(
        "/api/v1/auth/send-otp",
        json={"phone_number": "+1234567890"},
    )
    assert resp.status_code == 422  # Pydantic validation error


@pytest.mark.asyncio
async def test_verify_otp_happy_path(client: AsyncClient, fake_redis) -> None:
    """Full OTP flow: send → verify → get token + new user."""
    data, user = await create_user_and_get_token(
        client, fake_redis, phone="+919111111111", full_name="Happy User"
    )
    token = data["access_token"]
    assert token
    assert user["phone_number"] == "+919111111111"
    assert user["full_name"] == "Happy User"
    assert user["role"] == "freelancer"
    assert user["is_verified"] is True


@pytest.mark.asyncio
async def test_verify_otp_wrong_code(client: AsyncClient, fake_redis) -> None:
    """Wrong OTP should return 400 with remaining attempts."""
    phone = "+919222222222"

    # Send OTP
    resp = await client.post("/api/v1/auth/send-otp", json={"phone_number": phone})
    assert resp.status_code == 200

    # Try wrong OTP
    resp = await client.post(
        "/api/v1/auth/verify-otp",
        json={"phone_number": phone, "otp": "000000", "full_name": "Wrong"},
    )
    assert resp.status_code == 400
    assert "Incorrect OTP" in resp.json()["detail"]
    assert "attempt" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_verify_otp_expired(client: AsyncClient, fake_redis) -> None:
    """Attempting to verify with no OTP in Redis should fail."""
    resp = await client.post(
        "/api/v1/auth/verify-otp",
        json={"phone_number": "+919333333333", "otp": "123456", "full_name": "Expired"},
    )
    assert resp.status_code == 400
    assert "expired" in resp.json()["detail"].lower() or "not found" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_verify_otp_lockout_after_5_attempts(client: AsyncClient, fake_redis) -> None:
    """After 5 wrong attempts, OTP is invalidated and user is locked out."""
    phone = "+919444444444"

    # Send OTP
    resp = await client.post("/api/v1/auth/send-otp", json={"phone_number": phone})
    assert resp.status_code == 200

    # Submit 5 wrong OTPs
    for i in range(5):
        resp = await client.post(
            "/api/v1/auth/verify-otp",
            json={"phone_number": phone, "otp": f"{i:06d}", "full_name": "Lockout Test"},
        )
        assert resp.status_code == 400

    # 6th attempt should say "too many attempts" / need new OTP
    resp = await client.post(
        "/api/v1/auth/verify-otp",
        json={"phone_number": phone, "otp": "999999", "full_name": "Lockout Test"},
    )
    assert resp.status_code == 400
    detail = resp.json()["detail"].lower()
    assert "too many" in detail or "new otp" in detail or "expired" in detail


@pytest.mark.asyncio
async def test_send_otp_rate_limit(client: AsyncClient, fake_redis) -> None:
    """Max 3 OTP sends per phone per hour."""
    phone = "+919555555555"

    for _ in range(3):
        resp = await client.post("/api/v1/auth/send-otp", json={"phone_number": phone})
        assert resp.status_code == 200

    # 4th request should be rate limited
    resp = await client.post("/api/v1/auth/send-otp", json={"phone_number": phone})
    assert resp.status_code == 429
    assert "too many" in resp.json()["detail"].lower()


# ══════════════════════════════════════════════════════════════════════════════
# 2. User Creation
# ══════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_new_user_creation_requires_name(client: AsyncClient, fake_redis) -> None:
    """First-time OTP verify without full_name should fail."""
    phone = "+919666666666"

    resp = await client.post("/api/v1/auth/send-otp", json={"phone_number": phone})
    otp = resp.json()["otp"]

    resp = await client.post(
        "/api/v1/auth/verify-otp",
        json={"phone_number": phone, "otp": otp},
    )
    assert resp.status_code == 400
    assert "full_name" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_existing_user_login(client: AsyncClient, fake_redis) -> None:
    """Second OTP verify for same phone should NOT create a new user."""
    phone = "+919777777777"

    # First login
    data1, user1 = await create_user_and_get_token(
        client, fake_redis, phone=phone, full_name="Returning User"
    )
    token1 = data1["access_token"]

    # Second login
    resp = await client.post("/api/v1/auth/send-otp", json={"phone_number": phone})
    otp = resp.json()["otp"]

    resp = await client.post(
        "/api/v1/auth/verify-otp",
        json={"phone_number": phone, "otp": otp},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_new_user"] is False
    assert data["user"]["id"] == user1["id"]


# ══════════════════════════════════════════════════════════════════════════════
# 3. JWT / Protected Endpoints
# ══════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_me_without_token(client: AsyncClient) -> None:
    """GET /auth/me without Authorization header should return 401."""
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_me_with_valid_token(client: AsyncClient, fake_redis) -> None:
    """GET /auth/me with valid JWT should return user data."""
    data, user = await create_user_and_get_token(
        client, fake_redis, phone="+919888888888", full_name="Token User"
    )
    token = data["access_token"]

    resp = await client.get("/api/v1/auth/me", headers=auth_headers(token))
    assert resp.status_code == 200
    assert resp.json()["phone_number"] == "+919888888888"


@pytest.mark.asyncio
async def test_me_with_invalid_token(client: AsyncClient) -> None:
    """GET /auth/me with garbage token should return 401."""
    resp = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer not.a.real.jwt.token"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_refresh_token(client: AsyncClient, fake_redis) -> None:
    """POST /auth/refresh should return a new access token."""
    import asyncio  # inline import for sleep
    data, _ = await create_user_and_get_token(
        client, fake_redis, phone="+919999999999", full_name="Refresh User"
    )
    access_token = data["access_token"]
    refresh_token = data["refresh_token"]

    await asyncio.sleep(1)  # Ensure expiry stamp is at least 1 second different

    resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert resp.status_code == 200
    new_data = resp.json()
    new_token = new_data["access_token"]
    assert new_token  # Non-empty
    assert new_token != access_token  # Should be a different token (new iat/exp)


# ══════════════════════════════════════════════════════════════════════════════
# 4. Profile Endpoints
# ══════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_update_profile(client: AsyncClient, fake_redis) -> None:
    """PUT /users/me should update user fields."""
    data, user = await create_user_and_get_token(
        client, fake_redis, phone="+916111111111", full_name="Original Name"
    )
    token = data["access_token"]

    resp = await client.put(
        "/api/v1/users/me",
        headers=auth_headers(token),
        json={"full_name": "Updated Name", "email": "test@example.com"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["full_name"] == "Updated Name"
    assert data["email"] == "test@example.com"


@pytest.mark.asyncio
async def test_complete_onboarding(client: AsyncClient, fake_redis) -> None:
    """POST /users/me/complete-onboarding sets role and onboarding flag."""
    data, user = await create_user_and_get_token(
        client, fake_redis, phone="+916222222222", full_name="Onboard User"
    )
    token = data["access_token"]

    resp = await client.post(
        "/api/v1/users/me/complete-onboarding",
        headers=auth_headers(token),
        json={"role": "client"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["onboarding_complete"] is True
    assert data["role"] == "client"

    # Second call should fail
    resp = await client.post(
        "/api/v1/users/me/complete-onboarding",
        headers=auth_headers(token),
        json={"role": "freelancer"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_public_profile(client: AsyncClient, fake_redis) -> None:
    """GET /users/{id}/profile should return safe public data."""
    data, user = await create_user_and_get_token(
        client, fake_redis, phone="+916333333333", full_name="Public User"
    )
    token = data["access_token"]
    user_id = user["id"]

    resp = await client.get(f"/api/v1/users/{user_id}/profile")
    assert resp.status_code == 200
    data = resp.json()
    assert data["full_name"] == "Public User"
    # Should NOT contain private fields
    assert "phone_number" not in data
    assert "email" not in data
    assert "password_hash" not in data
    assert "badges" in data


@pytest.mark.asyncio
async def test_public_profile_not_found(client: AsyncClient) -> None:
    """GET /users/{id}/profile with non-existent ID should return 404."""
    resp = await client.get("/api/v1/users/00000000-0000-0000-0000-000000000000/profile")
    assert resp.status_code == 404
    assert resp.json()["error"] == "NotFoundError"
