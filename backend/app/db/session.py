from __future__ import annotations
"""
StayVise — Async SQLAlchemy engine & session factory
"""


from collections.abc import AsyncGenerator
from typing import Annotated, Optional

from fastapi import Depends
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

# ── Engine ─────────────────────────────────────────────────────────────────────

_engine: Optional[AsyncEngine] = None


from sqlalchemy.pool import NullPool

def get_engine() -> AsyncEngine:
    """Return (and lazily create) the shared async SQLAlchemy engine."""
    global _engine  # noqa: PLW0603
    if _engine is None:
        _engine = create_async_engine(
            str(settings.DATABASE_URL),
            echo=False,                  # NEVER True in production
            poolclass=NullPool,
            pool_pre_ping=True,          # Detect stale connections before use
            connect_args={
                "server_settings": {
                    "application_name": settings.APP_NAME,
                    "jit": "off",        # Disable JIT — safer for short queries
                    "statement_timeout": "30s",
                    "lock_timeout": "5s",
                    "idle_in_transaction_session_timeout": "60s",
                }
            },
        )
    return _engine


# ── Session factory ────────────────────────────────────────────────────────────

_AsyncSessionLocal: Optional[async_sessionmaker[AsyncSession]] = None


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    """Return (and lazily create) the shared session factory."""
    global _AsyncSessionLocal  # noqa: PLW0603
    if _AsyncSessionLocal is None:
        _AsyncSessionLocal = async_sessionmaker(
            bind=get_engine(),
            class_=AsyncSession,
            expire_on_commit=False,   # Avoid lazy-load errors after commit
            autoflush=False,
            autocommit=False,
        )
    return _AsyncSessionLocal


# ── FastAPI dependency ─────────────────────────────────────────────────────────


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency that yields an ``AsyncSession`` and handles
    commit / rollback automatically.

    Usage::

        @router.get("/example")
        async def example(db: DbSession) -> dict:
            result = await db.execute(select(User))
            ...
    """
    factory = get_session_factory()
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# Annotated alias for cleaner router signatures
DbSession = Annotated[AsyncSession, Depends(get_db)]


# ── Lifecycle helpers (called from app lifespan) ───────────────────────────────


async def close_db() -> None:
    """Dispose the engine connection pool cleanly on shutdown."""
    global _engine  # noqa: PLW0603
    if _engine is not None:
        await _engine.dispose()
        _engine = None
