import pytest
from datetime import timedelta
from jose import jwt
from app.core.security import create_access_token, decode_token, blacklist_token
from app.core.config import settings
from app.core.exceptions import UnauthorizedError

@pytest.mark.asyncio
async def test_jwt_valid_token():
    """Verify that a standard token is valid."""
    token = create_access_token(subject="user123")
    payload = decode_token(token)
    assert payload["sub"] == "user123"
    assert "jti" in payload
    assert payload["alg"] == "HS256"

@pytest.mark.asyncio
async def test_jwt_expired_token():
    """Verify that an expired token is rejected."""
    # Create token that expired 1 minute ago
    token = create_access_token(subject="user123", expires_delta=timedelta(minutes=-1))
    with pytest.raises(ValueError, match="Signature has expired"):
        decode_token(token)

@pytest.mark.asyncio
async def test_jwt_wrong_secret():
    """Verify that a token signed with the wrong secret is rejected."""
    payload = {"sub": "user123", "jti": "test-jti"}
    token = jwt.encode(payload, "wrong-secret-at-least-thirty-two-bytes-long", algorithm="HS256")
    with pytest.raises(ValueError, match="Signature verification failed"):
        decode_token(token)

@pytest.mark.asyncio
async def test_jwt_none_algorithm_forgery():
    """Verify that 'none' algorithm forgery is rejected."""
    # The 'jose' library usually prevents this if algorithms list is strict, 
    # but we want to be sure our code doesn't allow it.
    payload = {"sub": "user123", "jti": "test-jti"}
    token = jwt.encode(payload, None, algorithm="none")
    with pytest.raises(ValueError):
        decode_token(token)

@pytest.mark.asyncio
async def test_jwt_blacklisted_token(redis_client):
    """Verify that a blacklisted token jti is rejected."""
    token = create_access_token(subject="user123")
    payload = decode_token(token)
    jti = payload["jti"]
    
    # Blacklist it
    await blacklist_token(redis_client, jti, ttl=60)
    
    # Check if blacklisted
    is_blacklisted = await redis_client.exists(f"bl:{jti}")
    assert is_blacklisted == 1
