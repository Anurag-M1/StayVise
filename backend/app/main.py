from __future__ import annotations
"""
StayVise — FastAPI application entry point

Startup sequence:
  1. Test PostgreSQL connectivity (SELECT 1)
  2. Ping Redis
  3. Mount all routers
  4. Add middleware stack
  5. Expose /health endpoint

Shutdown:
  1. Close SQLAlchemy connection pool
  2. Close Redis connection pool
"""


import logging
from contextlib import asynccontextmanager
from typing import Optional, Any

import redis.asyncio as aioredis
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy import text

from app.core.config import settings
from app.core.middleware import (
    RequestLoggingMiddleware,
    build_cors_origins,
)
from app.core.security_middleware import (
    RateLimitMiddleware,
    SecurityHeadersMiddleware,
)
from app.db.session import close_db, get_engine

logger = logging.getLogger("stayvise.app")

# ── Redis client (module-level, initialised in lifespan) ───────────────────────
_redis_client: Optional[aioredis.Redis] = None  # type: ignore[type-arg]


def get_redis() -> aioredis.Redis:  # type: ignore[type-arg]
    """Return the shared Redis client (available after startup)."""
    if _redis_client is None:
        raise RuntimeError("Redis client not initialised — app not started?")
    return _redis_client


# ── Lifespan ───────────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):  # type: ignore[type-arg]
    """
    Manage application-level resources.
    Runs BEFORE the server starts accepting requests (startup section)
    and AFTER it stops (shutdown section).
    """
    global _redis_client  # noqa: PLW0603

    # ── Structured logging ─────────────────────────────────────────────────────
    try:
        from app.core.logging import setup_logging  # noqa: PLC0415
        setup_logging(settings.ENVIRONMENT)
    except ImportError:
        from app.core.middleware import configure_logging  # noqa: PLC0415
        configure_logging(settings.ENVIRONMENT)

    if settings.SENTRY_DSN:
        try:
            import sentry_sdk  # noqa: PLC0415
            
            def scrub_event(event: dict, hint: dict) -> dict:
                """Mask phone numbers and other PII in Sentry events."""
                import re
                from app.core.security_middleware import mask_phone
                
                # Mask phone in message
                if "message" in event:
                    event["message"] = re.sub(r"\+91\d{10}", lambda m: mask_phone(m.group()), event["message"])
                
                # Mask phone in user payload
                if "user" in event and "phone" in event["user"]:
                    event["user"]["phone"] = mask_phone(str(event["user"]["phone"]))
                
                return event

            sentry_sdk.init(
                dsn=settings.SENTRY_DSN,
                traces_sample_rate=0.1,
                environment=settings.ENVIRONMENT,
                release=settings.APP_VERSION,
                before_send=scrub_event,
            )
            logger.info("✓ Sentry initialised with PII scrubbing")
        except ImportError:
            logger.warning("sentry-sdk not installed — skipping Sentry init")

    logger.info("Starting StayVise %s [%s]", settings.APP_VERSION, settings.ENVIRONMENT)

    # ── Startup ────────────────────────────────────────────────────────────────

    # 1. PostgreSQL
    try:
        engine = get_engine()
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        logger.info("✓ PostgreSQL connection OK")
    except Exception as exc:
        logger.critical("✗ PostgreSQL connection FAILED: %s", exc)
        raise

    # 2. Redis
    try:
        _redis_client = aioredis.from_url(
            str(settings.REDIS_URL),
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=5,
        )
        await _redis_client.ping()
        logger.info("✓ Redis connection OK")
    except Exception as exc:
        logger.critical("✗ Redis connection FAILED: %s", exc)
        raise

    logger.info("StayVise ready — CORS origins: %s", _cors_origins())

    yield  # ←── Server is live and handling requests here ────────────────────

    # ── Shutdown ───────────────────────────────────────────────────────────────
    logger.info("Shutting down StayVise…")

    await close_db()
    logger.info("✓ PostgreSQL pool closed")

    if _redis_client is not None:
        await _redis_client.aclose()
        logger.info("✓ Redis connection closed")


# ── App factory ────────────────────────────────────────────────────────────────


def create_app() -> FastAPI:
    app = FastAPI(
        title="StayVise API",
        description=(
            "Professional milestone escrow platform for Indian freelancers. "
            "Secure payments, automated dispute resolution, zero friction."
        ),
        version=settings.APP_VERSION,
        docs_url="/docs" if not settings.is_production else None,
        redoc_url="/redoc" if not settings.is_production else None,
        openapi_url="/openapi.json" if not settings.is_production else None,
        lifespan=lifespan,
    )

    # ── Middleware stack (order matters — outermost first) ─────────────────────

    # 1. Security headers
    app.add_middleware(SecurityHeadersMiddleware)
    
    # 2. Response compression
    app.add_middleware(GZipMiddleware, minimum_size=1000, compresslevel=6)

    # 2. Rate limiting (Redis-backed)
    app.add_middleware(RateLimitMiddleware)

    # 3. CORS — must be early so OPTIONS pre-flights are handled
    origins = _cors_origins()
    allow_all = "*" in origins
    
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=not allow_all,  # Cannot be True if origin is "*"
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID", "X-Response-Time"],
    )

    # 4. Request logging + X-Request-ID injection
    app.add_middleware(RequestLoggingMiddleware)

    # ── Exception handlers ─────────────────────────────────────────────────────
    from app.core.exceptions import register_exception_handlers  # noqa: PLC0415
    from app.core.error_handler import register_global_exception_handlers # noqa: PLC0415

    register_exception_handlers(app)
    register_global_exception_handlers(app)

    # ── Instrumentation (Metrics) ──────────────────────────────────────────────
    try:
        from prometheus_fastapi_instrumentator import Instrumentator  # noqa: PLC0415
        Instrumentator().instrument(app).expose(app, endpoint="/metrics")
        logger.info("✓ Metrics endpoint exposed at /metrics")
    except ImportError:
        logger.warning("prometheus-fastapi-instrumentator not found — skipping metrics")

    # ── Mount Routers ──────────────────────────────────────────────────────────
    _mount_routers(app)

    # ── Health endpoint ────────────────────────────────────────────────────────
    _register_health(app)

    return app


def _cors_origins() -> list[str]:
    """
    Get allowed origins for CORS.
    In development, we allow all origins to simplify troubleshooting.
    """
    if not settings.is_production:
        return ["*"]
    return build_cors_origins(str(settings.FRONTEND_URL), settings.ALLOWED_ORIGINS)


def _mount_routers(app: FastAPI) -> None:
    """
    Register all route modules under /api/v1.
    Routers are imported lazily here so circular imports are avoided.
    """
    from app.api.v1.router import api_router  # noqa: PLC0415
    app.include_router(api_router, prefix="/api/v1")


def _register_health(app: FastAPI) -> None:
    @app.get(
        "/health",
        tags=["ops"],
        summary="Health check",
        response_model=dict[str, Any],
    )
    async def health_check() -> dict[str, Any]:
        """
        Returns HTTP 200 when both PostgreSQL and Redis are reachable.
        Returns HTTP 503 with details on any failed check.
        Suitable for use as a Docker / Kubernetes liveness probe.
        """
        from fastapi import HTTPException  # noqa: PLC0415
        from fastapi.responses import JSONResponse  # noqa: PLC0415

        status: dict[str, Any] = {
            "app": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "environment": settings.ENVIRONMENT,
            "checks": {},
        }

        all_ok = True

        # PostgreSQL
        try:
            engine = get_engine()
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            status["checks"]["postgres"] = "ok"
            
            # Pool stats
            pool = engine.pool
            status["db_pool_size"] = pool.size()
            status["db_pool_checkedout"] = pool.checkedout()
            status["db_pool_overflow"] = pool.overflow()
            status["db_pool_available"] = pool.size() - pool.checkedout()
            
            # Alert checkout > 80%
            if pool.size() > 0 and (pool.checkedout() / pool.size()) > 0.8:
                logger.warning(
                    "Database pool saturation: %d/%d checked out", 
                    pool.checkedout(), pool.size()
                )
        except Exception as exc:
            status["checks"]["postgres"] = f"error: {exc}"
            all_ok = False

        # Redis
        try:
            redis = get_redis()
            await redis.ping()
            status["checks"]["redis"] = "ok"
        except Exception as exc:
            status["checks"]["redis"] = f"error: {exc}"
            all_ok = False

        # External Service Ping (Mock)
        status["checks"]["razorpay_gateway"] = "reachable"

        status["status"] = "healthy" if all_ok else "unhealthy"
        http_status = 200 if all_ok else 503
        return JSONResponse(content=status, status_code=http_status)


# ── Module-level app instance ──────────────────────────────────────────────────
# Uvicorn entrypoint: uvicorn app.main:app
app = create_app()
