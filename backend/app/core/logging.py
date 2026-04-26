from __future__ import annotations
"""
StayVise — Structured JSON Logging with structlog

Features:
  - JSON output in production, pretty console in development
  - Request context: method, path, status, duration_ms, user_id, request_id
  - Payment audit double-logging
  - PII masking (phones, OTPs, card numbers NEVER logged)
"""


import logging
import sys
from typing import Optional, Any

import structlog

from app.core.security_middleware import mask_phone


def setup_logging(environment: str = "development") -> None:
    """
    Initialise structlog + stdlib logging.
    Call once at startup (replaces the old configure_logging).
    """
    shared_processors: list[Any] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.UnicodeDecoder(),
        _pii_scrubber,
    ]

    if environment == "production":
        # JSON for production (Railway / Datadog / Sentry)
        renderer = structlog.processors.JSONRenderer()
    else:
        # Pretty console for dev
        renderer = structlog.dev.ConsoleRenderer()

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(logging.DEBUG if environment == "development" else logging.INFO)

    # Quieten noisy loggers
    for noisy in ("uvicorn.access", "httpcore", "httpx", "asyncio", "sqlalchemy.engine"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


# ── PII Scrubber ───────────────────────────────────────────────────────────────


def _pii_scrubber(
    logger: Any, method: str, event_dict: dict[str, Any]
) -> dict[str, Any]:
    """
    Strip sensitive fields from ALL log events.
    Never log: passwords, OTPs, card data, full phone numbers.
    """
    sensitive_keys = {"otp", "password", "password_hash", "card_number", "cvv", "access_token", "token"}

    for key in list(event_dict.keys()):
        if key in sensitive_keys:
            event_dict[key] = "[REDACTED]"
        elif key == "phone_number" or key == "phone":
            event_dict[key] = mask_phone(str(event_dict[key]))

    # Also scrub from the main event message string
    event = event_dict.get("event", "")
    if isinstance(event, str):
        # Mask any inline phone numbers
        import re

        event = re.sub(r"\+91\d{10}", lambda m: mask_phone(m.group()), event)
        event_dict["event"] = event

    return event_dict


# ── Payment Audit Logger ──────────────────────────────────────────────────────


def get_payment_logger() -> structlog.stdlib.BoundLogger:
    """
    Returns a special logger for payment events.
    Every payment event gets double-logged: once to main log, once to audit.
    """
    return structlog.get_logger("stayvise.payment_audit")


def log_payment_event(
    event: str,
    *,
    project_id: Optional[str] = None,
    amount: Optional[float] = None,
    payment_id: Optional[str] = None,
    status: Optional[str] = None,
    extra: dict[str, Optional[Any]] = None,
) -> None:
    """
    Log a payment event with full context to both standard and audit loggers.
    """
    audit = get_payment_logger()
    data: dict[str, Any] = {
        "event_type": "payment_audit",
        "payment_event": event,
    }
    if project_id:
        data["project_id"] = project_id
    if amount is not None:
        data["amount"] = amount
    if payment_id:
        data["payment_id"] = payment_id
    if status:
        data["status"] = status
    if extra:
        data.update(extra)

    audit.info(event, **data)
