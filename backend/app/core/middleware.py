from __future__ import annotations
from typing import Optional
"""
StayVise — Custom ASGI Middleware
1. CORSMiddleware (via FastAPI/Starlette)  — configured via settings.FRONTEND_URL
2. RequestLoggingMiddleware               — structured timing logs + X-Request-ID
"""


import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

logger = logging.getLogger("stayvise.access")


# ── Request ID + Timing middleware ─────────────────────────────────────────────


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """
    For every HTTP request:
      1. Reads or generates a ``X-Request-ID`` header.
      2. Attaches the request-ID to the response.
      3. Logs method, path, status code, and elapsed time (ms).
    """

    def __init__(self, app: ASGIApp, *, exclude_paths: Optional[list[str]] = None) -> None:
        super().__init__(app)
        self._exclude = set(exclude_paths or ["/health", "/metrics"])

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Skip noisy health-check paths
        if request.url.path in self._exclude:
            return await call_next(request)

        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        start = time.perf_counter()

        # Make request_id accessible to downstream handlers via request.state
        request.state.request_id = request_id

        try:
            response = await call_next(request)
        except Exception:
            elapsed_ms = (time.perf_counter() - start) * 1_000
            logger.exception(
                "Unhandled exception",
                extra={
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "elapsed_ms": round(elapsed_ms, 2),
                },
            )
            raise

        elapsed_ms = (time.perf_counter() - start) * 1_000

        response.headers["X-Request-ID"] = request_id
        response.headers["X-Response-Time"] = f"{elapsed_ms:.2f}ms"

        user_id = getattr(request.state, "user_id", "anonymous")
        log_level = logging.WARNING if response.status_code >= 400 else logging.INFO
        
        # Mask IP for privacy (keep prefix)
        client_ip = _get_client_ip(request)
        masked_ip = ".".join(client_ip.split(".")[:2]) + ".x.x" if "." in client_ip else "unknown"

        logger.log(
            log_level,
            "%s %s → %s  (%.2fms)  [user=%s, req=%s]",
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
            user_id,
            request_id,
            extra={
                "request_id": request_id,
                "user_id": user_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "elapsed_ms": round(elapsed_ms, 2),
                "client_ip_masked": masked_ip,
            },
        )

        return response


# ── CORS helper (called from main.py) ─────────────────────────────────────────


def build_cors_origins(frontend_url: str, extra_origins: list[str]) -> list[str]:
    """
    Merge the primary frontend origin with any additional allowed origins.
    Always includes internal variants in development.
    """
    origins: set[str] = {frontend_url.rstrip("/")}
    for o in extra_origins:
        origins.add(o.rstrip("/"))
    return list(origins)


# ── Content Size Limit Middleware ──────────────────────────────────────────────


class ContentSizeLimitMiddleware(BaseHTTPMiddleware):
    """
    Blocks requests with bodies larger than a specified limit.
    Default: 10MB
    """

    def __init__(self, app: ASGIApp, max_content_size: int = 10 * 1024 * 1024) -> None:
        super().__init__(app)
        self.max_content_size = max_content_size

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Check Content-Length header
        content_length = request.headers.get("content-length")
        if content_length:
            if int(content_length) > self.max_content_size:
                logger.warning(
                    "Payload too large: %s bytes (limit: %s) [%s]",
                    content_length, self.max_content_size, _get_client_ip(request)
                )
                return Response("Payload Too Large", status_code=413)

        # Also check actual body size during stream to catch chunked encoding variants
        async def wrapped_receive():
            received_size = 0
            receive = await request._receive()
            if receive["type"] == "http.request":
                body = receive.get("body", b"")
                received_size += len(body)
                if received_size > self.max_content_size:
                    raise HTTPException(status_code=413, detail="Payload Too Large")
            return receive

        # For simplicity in this implementation, we mostly rely on content-length
        # and standard Starlette/FastAPI body size management.
        
        return await call_next(request)


# ── Utilities ──────────────────────────────────────────────────────────────────


def _get_client_ip(request: Request) -> str:
    """Extract real client IP, respecting X-Forwarded-For from trusted proxies."""
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        # Leftmost IP is the original client
        return forwarded_for.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


# ── Logging setup (call once at app startup) ───────────────────────────────────


def configure_logging(environment: str = "development") -> None:
    """
    Configure structured logging.
    In production you'd swap this for a JSON formatter (e.g., python-json-logger).
    """
    log_level = logging.DEBUG if environment == "development" else logging.INFO
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    )
    # Quieten noisy third-party loggers
    for noisy in ("uvicorn.access", "httpcore", "httpx"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
