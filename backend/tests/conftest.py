"""
StayVise — test conftest (rewritten for auth testing).

Provides:
  - Async Postgres test DB (SQLite fallback removed — use real PG via Docker)
  - HTTPX AsyncClient with dependency overrides
  - Redis mock (fakeredis)
  - Authenticated client helper
"""

from __future__ import annotations

import asyncio
from app.core.config import settings
settings.ENVIRONMENT = "test"
settings.RAZORPAY_KEY_ID = "rzp_test_mock_123456789"
settings.RAZORPAY_KEY_SECRET = "mock_secret_123456789"
settings.RAZORPAY_WEBHOOK_SECRET = "mock_webhook_secret"

from collections.abc import AsyncGenerator
from typing import Any
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.deps import get_redis
from app.db.session import get_db

# ── Use fakeredis for tests ────────────────────────────────────────────────────
# Install: pip install fakeredis
# If unavailable, we provide a minimal in-memory mock below.

try:
    import fakeredis.aioredis as fakeredis_aio

    def _make_fake_redis():  # type: ignore[no-untyped-def]
        return fakeredis_aio.FakeRedis(decode_responses=True)

except ImportError:
    # Minimal dict-backed Redis mock for CI when fakeredis is not installed
    class _FakeRedis:
        """Minimal async Redis mock backed by a dict — enough for OTP tests."""

        def __init__(self) -> None:
            self._store: dict[str, Any] = {}
            self._ttls: dict[str, int] = {}

        async def get(self, key: str) -> str | None:
            return self._store.get(key)

        async def setex(self, key: str, ttl: int, value: str) -> None:
            self._store[key] = value
            self._ttls[key] = ttl

        async def set(self, key: str, value: str, ex: int | None = None) -> None:
            self._store[key] = value
            if ex:
                self._ttls[key] = ex

        async def delete(self, *keys: str) -> int:
            count = 0
            for k in keys:
                if k in self._store:
                    del self._store[k]
                    self._ttls.pop(k, None)
                    count += 1
            return count

        async def incr(self, key: str) -> int:
            val = int(self._store.get(key, 0)) + 1
            self._store[key] = str(val)
            return val

        async def expire(self, key: str, ttl: int) -> None:
            self._ttls[key] = ttl

        async def ttl(self, key: str) -> int:
            return self._ttls.get(key, -1)

        async def ping(self) -> bool:
            return True

        async def aclose(self) -> None:
            pass

        def pipeline(self) -> "_FakePipeline":
            return _FakePipeline(self)

    class _FakePipeline:
        def __init__(self, redis: _FakeRedis) -> None:
            self._redis = redis
            self._commands: list[tuple[str, tuple]] = []

        def setex(self, key: str, ttl: int, value: str) -> "_FakePipeline":
            self._commands.append(("setex", (key, ttl, value)))
            return self

        def delete(self, *keys: str) -> "_FakePipeline":
            self._commands.append(("delete", keys))
            return self

        def incr(self, key: str) -> "_FakePipeline":
            self._commands.append(("incr", (key,)))
            return self

        def expire(self, key: str, ttl: int) -> "_FakePipeline":
            self._commands.append(("expire", (key, ttl)))
            return self

        async def execute(self) -> list[Any]:
            results = []
            for cmd, args in self._commands:
                fn = getattr(self._redis, cmd)
                result = await fn(*args)
                results.append(result)
            self._commands.clear()
            return results

    def _make_fake_redis():  # type: ignore[no-untyped-def]
        return _FakeRedis()


# ── Fixtures ───────────────────────────────────────────────────────────────────

# Use an in-memory SQLite for fast tests (no real PG required)
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def event_loop_policy():
    return asyncio.DefaultEventLoopPolicy()


@pytest_asyncio.fixture(scope="session")
async def test_engine():
    from app.db.models import Base  # noqa: PLC0415
    import app.db.models  # noqa: F401

    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(test_engine) -> AsyncGenerator[AsyncSession, None]:
    factory = async_sessionmaker(test_engine, expire_on_commit=False)
    async with factory() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def fake_redis():
    r = _make_fake_redis()
    yield r


@pytest_asyncio.fixture
async def async_client(
    db_session: AsyncSession,
    fake_redis: Any,
) -> AsyncGenerator[AsyncClient, None]:
    from app.main import app  # noqa: PLC0415

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    async def override_get_redis() -> Any:
        return fake_redis

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_redis] = override_get_redis

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def client(async_client: AsyncClient) -> AsyncClient:
    """Alias for async_client to support tests using either name."""
    return async_client


# ── Helper: get an authenticated client ────────────────────────────────────────


async def create_user_and_get_token(
    client: AsyncClient,
    fake_redis: Any,
    phone: str = "+919876543210",
    full_name: str = "Test User",
) -> tuple[str, dict]:
    """
    Helper that runs the full OTP flow and returns (access_token, user_dict).
    """
    # Send OTP
    resp = await client.post("/api/v1/auth/send-otp", json={"phone_number": phone})
    assert resp.status_code == 200
    otp = resp.json()["otp"]

    # Verify OTP
    resp = await client.post(
        "/api/v1/auth/verify-otp",
        json={"phone_number": phone, "otp": otp, "full_name": full_name},
    )
    assert resp.status_code == 200
    data = resp.json()
    return data, data["user"]


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}
