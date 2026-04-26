from __future__ import annotations
"""
StayVise — Custom exception hierarchy + FastAPI exception handlers.

All API errors return a consistent JSON shape:
    {
        "error": "NotFoundError",
        "detail": "User with id='abc' not found.",
        "request_id": "550e8400-e29b-..."
    }
"""


import logging
from typing import Optional, Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger("stayvise.exceptions")


# ══════════════════════════════════════════════════════════════════════════════
# Base exception
# ══════════════════════════════════════════════════════════════════════════════


class StayViseError(Exception):
    """Base class for all application-level exceptions."""

    status_code: int = 500
    error_type: str = "StayViseError"

    def __init__(self, detail: str = "An unexpected error occurred.", **kwargs: Any) -> None:
        self.detail = detail
        self.extra = kwargs
        super().__init__(detail)


# ══════════════════════════════════════════════════════════════════════════════
# Concrete exceptions
# ══════════════════════════════════════════════════════════════════════════════


class NotFoundError(StayViseError):
    status_code = 404
    error_type = "NotFoundError"

    def __init__(self, resource: str = "Resource", identifier: Any = None) -> None:
        detail = f"{resource} not found."
        if identifier is not None:
            detail = f"{resource} with id='{identifier}' not found."
        super().__init__(detail=detail)


class UnauthorizedError(StayViseError):
    status_code = 401
    error_type = "UnauthorizedError"

    def __init__(self, detail: str = "Authentication required.") -> None:
        super().__init__(detail=detail)


class ForbiddenError(StayViseError):
    status_code = 403
    error_type = "ForbiddenError"

    def __init__(self, detail: str = "You do not have permission to perform this action.") -> None:
        super().__init__(detail=detail)


class ValidationError(StayViseError):
    status_code = 422
    error_type = "ValidationError"

    def __init__(self, detail: str = "Validation failed.", errors: Optional[list[dict]] = None) -> None:
        self.errors = errors or []
        super().__init__(detail=detail)


class RateLimitError(StayViseError):
    status_code = 429
    error_type = "RateLimitError"

    def __init__(
        self, detail: str = "Too many requests.", retry_after: Optional[int] = None
    ) -> None:
        self.retry_after = retry_after
        super().__init__(detail=detail)


class OTPError(StayViseError):
    status_code = 400
    error_type = "OTPError"

    def __init__(self, detail: str = "OTP verification failed.") -> None:
        super().__init__(detail=detail)


class PaymentError(StayViseError):
    status_code = 402
    error_type = "PaymentError"

    def __init__(self, detail: str = "Payment processing failed.") -> None:
        super().__init__(detail=detail)


class MessengerError(StayViseError):
    status_code = 502
    error_type = "MessengerError"

    def __init__(self, detail: str = "Messenger API call failed.") -> None:
        super().__init__(detail=detail)


# ══════════════════════════════════════════════════════════════════════════════
# FastAPI exception handlers
# ══════════════════════════════════════════════════════════════════════════════


def _get_request_id(request: Request) -> str:
    """Extract request_id injected by RequestLoggingMiddleware."""
    return getattr(request.state, "request_id", "unknown")


def _build_error_response(
    request: Request, exc: StayViseError, status_code: Optional[int] = None
) -> JSONResponse:
    code = status_code or exc.status_code
    body: dict[str, Any] = {
        "error": exc.error_type,
        "detail": exc.detail,
        "request_id": _get_request_id(request),
    }

    # Include validation errors list when present
    if isinstance(exc, ValidationError) and exc.errors:
        body["errors"] = exc.errors

    # Include retry_after for rate limiting
    headers: dict[str, str] = {}
    if isinstance(exc, RateLimitError) and exc.retry_after:
        body["retry_after"] = exc.retry_after
        headers["Retry-After"] = str(exc.retry_after)

    logger.warning(
        "%s: %s [request_id=%s]",
        exc.error_type,
        exc.detail,
        body["request_id"],
    )

    return JSONResponse(status_code=code, content=body, headers=headers or None)


def register_exception_handlers(app: FastAPI) -> None:
    """
    Call from main.py to attach handlers for every custom exception.

    Usage::
        from app.core.exceptions import register_exception_handlers
        register_exception_handlers(app)
    """

    @app.exception_handler(StayViseError)
    async def stayvise_error_handler(request: Request, exc: StayViseError) -> JSONResponse:
        return _build_error_response(request, exc)

    @app.exception_handler(404)
    async def not_found_handler(request: Request, exc: Any) -> JSONResponse:
        return JSONResponse(
            status_code=404,
            content={
                "error": "NotFoundError",
                "detail": "The requested resource was not found.",
                "request_id": _get_request_id(request),
            },
        )

    @app.exception_handler(405)
    async def method_not_allowed_handler(request: Request, exc: Any) -> JSONResponse:
        return JSONResponse(
            status_code=405,
            content={
                "error": "MethodNotAllowed",
                "detail": f"Method {request.method} not allowed on {request.url.path}",
                "request_id": _get_request_id(request),
            },
        )
