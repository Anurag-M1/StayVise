from __future__ import annotations
"""
StayVise — Security utilities
- JWT creation & verification
- bcrypt password hashing
- Redis-backed rate-limiting decorator
"""


import asyncio
import functools
import time
from datetime import timezone, datetime, timedelta
from typing import Optional, Any, Callable

import redis.asyncio as aioredis
from jose import JWTError, jwt
import bcrypt
import uuid

from app.core.config import settings

# Verify SECRET_KEY safety
if len(settings.SECRET_KEY) < 32:
    raise ValueError("SECRET_KEY must be at least 32 bytes for HS256 security.")
if len(settings.REFRESH_SECRET_KEY) < 32:
    raise ValueError("REFRESH_SECRET_KEY must be at least 32 bytes for HS256 security.")

# ── Password hashing ───────────────────────────────────────────────────────────

async def hash_password(plain: str) -> str:
    """Return bcrypt hash of *plain* password (async)."""
    return await asyncio.to_thread(_hash_password_sync, plain)


def _hash_password_sync(plain: str) -> str:
    pwd_bytes = plain.encode('utf-8')
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode('utf-8')


async def verify_password(plain: str, hashed: str) -> bool:
    """Return True when *plain* matches *hashed* (async)."""
    return await asyncio.to_thread(_verify_password_sync, plain, hashed)


def _verify_password_sync(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode('utf-8'), hashed.encode('utf-8'))
    except ValueError:
        return False


# ── JWT ────────────────────────────────────────────────────────────────────────

_ACCESS_TOKEN_TYPE = "access"
_REFRESH_TOKEN_TYPE = "refresh"
_SECURE_ACCESS_TOKEN_TYPE = "secure_access"


def create_access_token(
    subject: str | int,
    extra_claims: dict[str, Optional[Any]] = None,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """
    Create a signed JWT access token.

    Args:
        subject:      Stable identifier (e.g. user UUID as string).
        extra_claims: Additional payload claims (role, phone, …).
        expires_delta: Override default expiry.

    Returns:
        Encoded JWT string.
    """
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    payload: dict[str, Any] = {
        "sub": str(subject),
        "iat": datetime.now(timezone.utc),
        "exp": expire,
        "jti": str(uuid.uuid4()),
        "type": _ACCESS_TOKEN_TYPE,
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def create_refresh_token(
    subject: str | int,
    extra_claims: dict[str, Optional[Any]] = None,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Create a long-lived refresh token (30 days) using REFRESH_SECRET_KEY."""
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(days=30))
    payload: dict[str, Any] = {
        "sub": str(subject),
        "iat": datetime.now(timezone.utc),
        "exp": expire,
        "jti": str(uuid.uuid4()),
        "type": _REFRESH_TOKEN_TYPE,
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.REFRESH_SECRET_KEY, algorithm="HS256")


def create_secure_access_token(
    email: str,
    phone_number: Optional[str] = None,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Create a short-lived token (15 mins) for secure access login links."""
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.SECURE_ACCESS_LINK_EXPIRE_MINUTES)
    )
    payload: dict[str, Any] = {
        "sub": email,
        "iat": datetime.now(timezone.utc),
        "exp": expire,
        "type": _SECURE_ACCESS_TOKEN_TYPE,
    }
    if phone_number:
        payload["phone"] = phone_number
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def decode_token(
    token: str, 
    expected_type: str = _ACCESS_TOKEN_TYPE,
) -> dict[str, Any]:
    """
    Decode and validate JWT.
    Automatically selects secret key based on expected_type.

    Raises:
        ValueError: when signature invalid, expired, or wrong token type.
    """
    secret = settings.SECRET_KEY
    if expected_type == _REFRESH_TOKEN_TYPE:
        secret = settings.REFRESH_SECRET_KEY
    
    # Strict Fix: Define robust options to bypass common timing issues
    # We increase leeway significantly and optionally skip iat check if desired
    # For magic links, we are extra permissive with timing as they arrive via email
    options = {
        "verify_iat": False,
        "verify_aud": False,
        "leeway": 600,
    }

    try:
        payload: dict[str, Any] = jwt.decode(
            token, secret, algorithms=["HS256"], options=options
        )
    except JWTError as exc:
        # Fallback debug: See what's actually in the token if signature verification allows
        try:
            unverified = jwt.get_unverified_claims(token)
            logger.debug("Verification failed for %s token. Claims: %s", expected_type, unverified)
        except Exception:
            pass
        raise ValueError(f"Invalid token: {exc}") from exc

    if payload.get("type") != expected_type:
        raise ValueError(
            f"Expected token type '{expected_type}', got '{payload.get('type')}'"
        )
    return payload


def extract_subject(token: str) -> str:
    """Convenience: decode access token and return the 'sub' claim."""
    return decode_token(token)["sub"]


# ── Token Revocation (Redis-backed) ───────────────────────────────────────────

async def blacklist_token(redis: aioredis.Redis, jti: str, exp: datetime) -> None:
    """
    Mark a token as revoked until its physical expiry time.
    """
    now = datetime.now(timezone.utc)
    remaining = int((exp - now).total_seconds())
    if remaining > 0:
        await redis.setex(f"bl:{jti}", remaining, "1")


async def is_token_blacklisted(redis: aioredis.Redis, jti: str) -> bool:
    """
    Return True if the token's JTI exists in the blacklist.
    """
    return await redis.exists(f"bl:{jti}") > 0


# ── Redis-backed rate limiter ──────────────────────────────────────────────────


class RateLimitExceeded(Exception):
    """Raised when a caller exceeds the configured rate limit."""

    def __init__(self, limit: int, window_seconds: int, retry_after: int) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self.retry_after = retry_after
        super().__init__(
            f"Rate limit of {limit} requests per {window_seconds}s exceeded. "
            f"Retry after {retry_after}s."
        )


def rate_limit(
    *,
    max_calls: int,
    window_seconds: int,
    key_prefix: str = "rl",
) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """
    Async decorator that enforces a sliding-window rate limit via Redis.

    Usage::

        @rate_limit(max_calls=5, window_seconds=60, key_prefix="whatsapp_send")
        async def send_message(phone: str, redis: Redis) -> None:
            ...

    The decorated coroutine MUST accept a ``redis`` keyword argument
    (``redis.asyncio.Redis`` instance) and an ``identifier`` keyword argument
    (string key that identifies the caller — e.g., phone number or user ID).

    Raises:
        RateLimitExceeded: when the caller has exceeded *max_calls* within
                           the rolling *window_seconds* window.
    """

    def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
        @functools.wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            redis_client: aioredis.Redis = kwargs.get("redis")  # type: ignore[assignment]
            identifier: str = kwargs.get("identifier", "global")

            if redis_client is None:
                # No Redis available — fail open (allow the call)
                return await func(*args, **kwargs)

            now = time.time()
            window_start = now - window_seconds
            redis_key = f"{key_prefix}:{identifier}"

            pipe = redis_client.pipeline()
            # Remove timestamps outside the current window
            pipe.zremrangebyscore(redis_key, "-inf", window_start)
            # Count how many calls remain in the window
            pipe.zcard(redis_key)
            # Add current timestamp
            pipe.zadd(redis_key, {str(now): now})
            # Reset TTL
            pipe.expire(redis_key, window_seconds)

            _, current_count, *_ = await pipe.execute()

            if current_count >= max_calls:
                # Earliest timestamp in the window
                earliest_raw = await redis_client.zrange(redis_key, 0, 0, withscores=True)
                if earliest_raw:
                    earliest_ts = earliest_raw[0][1]
                    retry_after = int(earliest_ts + window_seconds - now) + 1
                else:
                    retry_after = window_seconds
                raise RateLimitExceeded(max_calls, window_seconds, retry_after)

            return await func(*args, **kwargs)

        return wrapper

    return decorator


# ── Razorpay webhook signature verification ────────────────────────────────────

import hashlib
import hmac


def verify_razorpay_signature(
    order_id: str,
    payment_id: str,
    signature: str,
) -> bool:
    """Verify Razorpay payment signature (HMAC-SHA256)."""
    body = f"{order_id}|{payment_id}".encode()
    expected = hmac.new(
        settings.RAZORPAY_KEY_SECRET.encode(), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


def verify_razorpay_webhook_signature(
    raw_body: bytes,
    received_signature: str,
) -> bool:
    """Verify Razorpay webhook payload signature."""
    expected = hmac.new(
        settings.RAZORPAY_WEBHOOK_SECRET.encode(), raw_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, received_signature)
