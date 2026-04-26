from __future__ import annotations
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("stayvise.error_handler")

def register_global_exception_handlers(app: FastAPI):
    """
    Register catch-all handlers for production hardening.
    Prevents leakage of database schemas or internal stack traces.
    """

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "error": "VALIDATION_ERROR",
                "message": "The request body or parameters are invalid.",
                "details": exc.errors(),
                "request_id": getattr(request.state, "request_id", "unknown"),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )

    @app.exception_handler(IntegrityError)
    async def sqlalchemy_integrity_handler(request: Request, exc: IntegrityError):
        # Mask specific DB errors while providing helpful context
        msg = "A database integrity constraint was violated."
        error_code = "DB_INTEGRITY_ERROR"
        
        orig_msg = str(exc.orig).lower()
        if "unique" in orig_msg:
            msg = "This record already exists."
            error_code = "ALREADY_EXISTS"
        elif "foreign key" in orig_msg:
            msg = "Related resource not found or protected."
            error_code = "RELATION_ERROR"

        logger.warning("%s: %s", error_code, str(exc.orig))
        
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "error": error_code,
                "message": msg,
                "request_id": getattr(request.state, "request_id", "unknown"),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )

    @app.exception_handler(SQLAlchemyError)
    async def sqlalchemy_generic_handler(request: Request, exc: SQLAlchemyError):
        logger.error("Database error: %s", str(exc), exc_info=True)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": "DATABASE_ERROR",
                "message": "A database error occurred. The incident has been logged.",
                "request_id": getattr(request.state, "request_id", "unknown"),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": "HTTP_ERROR",
                "message": exc.detail,
                "request_id": getattr(request.state, "request_id", "unknown"),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        """Catch-all for production."""
        logger.critical("UNHANDLED EXCEPTION: %s", str(exc), exc_info=True)
        
        # Don't leak details in production
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": "INTERNAL_SERVER_ERROR",
                "message": "An unexpected error occurred. Our engineering team has been notified.",
                "request_id": getattr(request.state, "request_id", "unknown"),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )
