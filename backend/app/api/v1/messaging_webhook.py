"""
StayVise — Messenger webhook endpoints.

GET  /webhook/messenger  — Meta verification handshake
POST /webhook/messenger  — receive all inbound messages / status updates

Design:
  - POST returns 200 immediately (Meta requires < 5s).
  - Message processing is dispatched to a Celery task.
  - Deduplication via Redis key ``messaging_processed:{message_id}`` (TTL 24h).
"""


import hmac
import hashlib
import logging
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse, Response

from app.core.config import settings

logger = logging.getLogger("stayvise.webhook")

router = APIRouter()

# Redis dedup TTL
_DEDUP_TTL = 86400  # 24 hours


# ══════════════════════════════════════════════════════════════════════════════
# GET /webhook/whatsapp — Meta verification
# ══════════════════════════════════════════════════════════════════════════════


@router.get(
    "/messenger",
    summary="Messenger webhook verification",
    response_class=PlainTextResponse,
)
async def verify_webhook(
    request: Request,
    mode: str = Query(None, alias="hub.mode"),
    token: str = Query(None, alias="hub.verify_token"),
    challenge: str = Query(None, alias="hub.challenge"),
) -> Response:
    """
    Meta sends a GET with hub.mode, hub.verify_token, and hub.challenge.
    Return challenge as plain text if token matches.
    """
    if mode == "subscribe" and token == settings.MESSAGING_VERIFY_TOKEN:
        logger.info("Messenger webhook verified successfully")
        return PlainTextResponse(content=challenge, status_code=200)

    logger.warning("Messenger webhook verification FAILED (token mismatch)")
    return PlainTextResponse(content="Forbidden", status_code=403)


# ══════════════════════════════════════════════════════════════════════════════
# POST /webhook/whatsapp — receive messages
# ══════════════════════════════════════════════════════════════════════════════


@router.post(
    "/messenger",
    summary="Messenger webhook receiver",
    status_code=200,
)
async def receive_webhook(
    request: Request,
    x_hub_signature: str = Header(None, alias="X-Hub-Signature-256"),
) -> dict[str, str]:
    """
    Receive all inbound Messenger events.

    In production, verifies the X-Hub-Signature-256 header.
    Returns 200 immediately — processing is deferred to a Celery task
    to meet Meta's < 5s response requirement.
    """
    # ── Verify Signature ──────────────────────────────────────────────────────
    body_bytes = await request.body()

    if settings.ENVIRONMENT == "production":
        if not x_hub_signature:
            logger.warning("Missing X-Hub-Signature-256 header in production")
            raise HTTPException(status_code=403, detail="Missing signature")
        
        if not _verify_hmac(body_bytes, x_hub_signature):
            logger.warning("Invalid X-Hub-Signature-256 header")
            raise HTTPException(status_code=403, detail="Invalid signature")

    try:
        import json
        body = json.loads(body_bytes)
    except Exception:
        logger.error("Failed to parse webhook body")
        return {"status": "error"}

    # Extract entries
    entries = body.get("entry", [])
    for entry in entries:
        changes = entry.get("changes", [])
        for change in changes:
            value = change.get("value", {})

            # ── Status updates (delivered, read, etc.) ─────────────────────────
            statuses = value.get("statuses", [])
            for status_update in statuses:
                _handle_status_update(status_update)

            # ── Inbound messages ───────────────────────────────────────────────
            messages = value.get("messages", [])
            contacts = value.get("contacts", [])

            for message in messages:
                message_id = message.get("id", "")
                from_phone = message.get("from", "")
                # Attach contact info if available
                contact_name = ""
                if contacts:
                    contact_name = contacts[0].get("profile", {}).get("name", "")

                # Dispatch to Celery (dedup happens inside the task)
                _dispatch_message_task(
                    message_id=message_id,
                    from_phone=from_phone,
                    contact_name=contact_name,
                    message=message,
                )

    return {"status": "ok"}


def _verify_hmac(payload: bytes, signature_header: str) -> bool:
    """Verify Meta's sha256 HMAC signature."""
    if not signature_header.startswith("sha256="):
        return False
    
    actual_sig = signature_header[7:]
    expected_sig = hmac.new(
        settings.MESSAGING_APP_SECRET.encode("utf-8"),
        payload,
        hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(actual_sig, expected_sig)


# ── Helpers ────────────────────────────────────────────────────────────────────


def _handle_status_update(status: dict) -> None:
    """Log delivery / read status updates."""
    wa_id = status.get("id", "?")
    recipient = status.get("recipient_id", "?")
    status_val = status.get("status", "unknown")
    timestamp = status.get("timestamp", "?")

    logger.info(
        "Messenger status update: msg=%s recipient=%s status=%s ts=%s",
        wa_id,
        recipient,
        status_val,
        timestamp,
    )
    # TODO: Update notification record's delivered_at / read_at


def _dispatch_message_task(
    *,
    message_id: str,
    from_phone: str,
    contact_name: str,
    message: dict,
) -> None:
    """
    Dispatch a Celery task to process the inbound message.

    In test/dev without Celery, falls back to logging.
    """
    try:
        from app.tasks.messaging_processor import process_messenger_message  # noqa: PLC0415

        process_messenger_message.delay(
            {
                "message_id": message_id,
                "from_phone": from_phone,
                "contact_name": contact_name,
                "message": message,
            }
        )
        logger.info(
            "Dispatched message processing: id=%s from=%s type=%s",
            message_id,
            from_phone,
            message.get("type", "unknown"),
        )
    except Exception as exc:
        # Celery not available — log and continue (don't break the webhook)
        logger.warning(
            "Could not dispatch Celery task for message %s: %s. "
            "Processing inline not implemented.",
            message_id,
            exc,
        )


# ── Message parsing utilities (used by tasks) ─────────────────────────────────


def parse_inbound_message(message: dict) -> dict[str, Any]:
    """
    Normalize an inbound Messenger message into a flat dict.

    Returns::

        {
            "message_id": "wamid.xxx",
            "type": "text" | "interactive" | "image" | ...,
            "text": "user typed this",               # for text messages
            "button_id": "approve_123",               # for button replies
            "button_title": "Approve",                # for button replies
            "list_id": "proj_456",                    # for list replies
            "timestamp": "1713000000",
        }
    """
    msg_type = message.get("type", "unknown")
    parsed: dict[str, Any] = {
        "message_id": message.get("id", ""),
        "type": msg_type,
        "timestamp": message.get("timestamp", ""),
    }

    if msg_type == "text":
        parsed["text"] = message.get("text", {}).get("body", "")

    elif msg_type == "interactive":
        interactive = message.get("interactive", {})
        interactive_type = interactive.get("type", "")

        if interactive_type == "button_reply":
            reply = interactive.get("button_reply", {})
            parsed["button_id"] = reply.get("id", "")
            parsed["button_title"] = reply.get("title", "")

        elif interactive_type == "list_reply":
            reply = interactive.get("list_reply", {})
            parsed["list_id"] = reply.get("id", "")
            parsed["list_title"] = reply.get("title", "")

    elif msg_type == "image":
        parsed["image"] = message.get("image", {})

    elif msg_type == "document":
        parsed["document"] = message.get("document", {})

    return parsed
