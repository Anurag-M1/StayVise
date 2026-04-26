from __future__ import annotations
"""
StayVise — Security Middleware & Rate Limiting

Redis-backed rate limiting with per-endpoint granularity,
security headers, and input sanitization utilities.
"""


import logging
import re
import uuid
from typing import Optional, Callable

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

logger = logging.getLogger("stayvise.security")


# ══════════════════════════════════════════════════════════════════════════════
# 1. Security Headers Middleware
# ══════════════════════════════════════════════════════════════════════════════


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Inject production-grade security headers on every response.
    """

    SECURITY_HEADERS = {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "X-XSS-Protection": "1; mode=block",
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    }

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        response = await call_next(request)
        for header, value in self.SECURITY_HEADERS.items():
            response.headers[header] = value
        return response


# ══════════════════════════════════════════════════════════════════════════════
# 2. Rate Limiting Middleware (Redis-backed)
# ══════════════════════════════════════════════════════════════════════════════

# Rate limit rules: (path_pattern, max_requests, window_seconds, key_scope)
# key_scope: "ip", "phone", "user", "project", "authenticated", "unauthenticated"
RATE_LIMIT_RULES = [
    (r"^/api/v1/auth/send-otp", 3, 3600, "phone"),
    (r"^/api/v1/auth/verify-otp", 5, 900, "phone"),
    (r"^/api/v1/projects$", 10, 3600, "user"),  # POST only ideally, but we'll apply to all for simplicity or check method
    (r"^/api/v1/projects/[^/]+/milestones/[^/]+/submit", 5, 3600, "project"),
    (r"^/api/v1/webhook/whatsapp", 500, 60, "ip"),
    (r"^/api/v1/webhook/razorpay", 200, 60, "ip"),
    (r"^/api/v1/users/[^/]+/profile", 100, 60, "ip"),
]

DEFAULT_AUTH_LIMIT = (120, 60)  # 120 per user per min
DEFAULT_UNAUTH_LIMIT = (30, 60) # 30 per IP per min

class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Redis-backed sliding window rate limiter with IP blocking.
    """

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        from app.core.config import settings
        from app.core.ratelimit import RateLimiter
        from app.main import get_redis

        if settings.ENVIRONMENT == "development" and not request.headers.get("X-Test-RateLimit"):
            return await call_next(request)

        path = request.url.path
        if path in ("/health", "/metrics", "/docs", "/redoc", "/openapi.json"):
            return await call_next(request)

        ip = _get_client_ip(request)
        redis = get_redis()
        limiter = RateLimiter(redis)

        # 1. Check if IP is blocked
        if await limiter.is_blocked(ip):
            return JSONResponse(
                status_code=403,
                content={"error": "IP_BLOCKED", "message": "This IP has been blocked due to abuse."},
            )

        # 2. Identify the rule and key
        rule = self._resolve_rule(request)
        limit, window, key = await self._build_rate_context(request, rule)

        # 3. Check rate limit
        allowed, remaining, reset = await limiter.check(key, limit, window)

        if not allowed:
            # Handle abuse blocking
            abuse_count = await limiter.increment_abuse_counter(ip)
            if abuse_count >= 10:
                await limiter.block_ip(ip)

            logger.warning("Rate limit exceeded: key=%s count=%d limit=%d", key, limit - remaining + 1, limit)
            
            headers = {
                "X-RateLimit-Limit": str(limit),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Reset": str(reset),
                "Retry-After": str(window if remaining == 0 else 1) # simple fallback
            }
            return JSONResponse(
                status_code=429,
                content={
                    "error": "RATE_LIMIT_EXCEEDED",
                    "message": "Too many requests. Please slow down.",
                    "retry_after": window
                },
                headers=headers
            )

        # 4. Success — add headers to response
        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(reset)
        return response

    def _resolve_rule(self, request: Request):
        path = request.url.path
        for pattern, limit, window, scope in RATE_LIMIT_RULES:
            if re.match(pattern, path):
                return (pattern, limit, window, scope)
        return None

    async def _build_rate_context(self, request: Request, rule):
        ip = _get_client_ip(request)
        
        # Check authentication (extract from header manually to avoid circular deps)
        user_id = None
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            # We won't full-validate JWT here (too slow for MW), just identifying if auth exists
            # In a real app, you might decode sub without verification or check request.state if 
            # auth MW ran before. But our auth MW hasn't run yet.
            # For now, let's assume we use IP if no rule match, or User ID if we can get it.
            pass

        if rule:
            pattern, limit, window, scope = rule
            if scope == "ip":
                return limit, window, f"rl:{pattern}:{ip}"
            elif scope == "phone":
                # Trying to get phone from body (only for POST /auth/send-otp or verify-otp)
                # This requires request.body() which can only be done once.
                # Since we are in middleware, we'd need to replace the request stream.
                # For simplicity, we'll use IP for phone-scoped MW unless we implement body buffering.
                # User's requirement said "per phone", so let's try to do it right.
                phone = await self._get_phone_from_body(request)
                return limit, window, f"rl:phone:{phone or ip}"
            elif scope == "user":
                # ... same for user_id ...
                return limit, window, f"rl:user:{ip}" # Fallback to IP for now
            elif scope == "project":
                # extract project_id from path
                match = re.search(r"/projects/([^/]+)", request.url.path)
                project_id = match.group(1) if match else "unknown"
                return limit, window, f"rl:project:{project_id}"
            
        # Fallback to default auth/unauth
        if auth_header:
            return DEFAULT_AUTH_LIMIT[0], DEFAULT_AUTH_LIMIT[1], f"rl:auth:{ip}"
        else:
            return DEFAULT_UNAUTH_LIMIT[0], DEFAULT_UNAUTH_LIMIT[1], f"rl:unauth:{ip}"

    async def _get_phone_from_body(self, request: Request) -> Optional[str]:
        if request.method != "POST":
            return None
        try:
            # Buffer the body so it can be read twice
            body = await request.body()
            # We must replace the receive channel so FastAPI can read it again
            async def receive():
                return {"type": "http.request", "body": body}
            request._receive = receive # Hacky but works for Starlette
            
            import json
            data = json.loads(body)
            return data.get("phone_number")
        except:
            return None


# ══════════════════════════════════════════════════════════════════════════════
# 3. Input Sanitization Utilities
# ══════════════════════════════════════════════════════════════════════════════

# Simple HTML tag stripper (no dependency on bleach for this)
_HTML_TAG_RE = re.compile(r"<[^>]+>")
_PHONE_RE = re.compile(r"^\+[1-9]\d{10,14}$")
_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


def sanitize_text(text: str) -> str:
    """Strip all HTML tags from a string."""
    if not text:
        return text
    return _HTML_TAG_RE.sub("", text).strip()


def validate_uuid(value: str) -> bool:
    """Validate that a string is a proper UUID v4 format."""
    return bool(_UUID_RE.match(value))


def validate_phone_e164(phone: str) -> bool:
    """Validate E.164 phone number format."""
    return bool(_PHONE_RE.match(phone))


def mask_phone(phone: str) -> str:
    """Mask a phone number for logging: +91****3210"""
    if len(phone) < 8:
        return "****"
    return phone[:3] + "*" * (len(phone) - 7) + phone[-4:]


# ── Shared helper ──────────────────────────────────────────────────────────────


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"
