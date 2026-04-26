from __future__ import annotations
"""
StayVise — Celery task: process inbound Messenger messages.

Deduplication is handled via Redis key ``messaging_processed:{message_id}`` (TTL 24h).
Session state is persisted in the ``messenger_sessions`` table (JSONB).
"""


import asyncio
import logging
from datetime import timezone, datetime, timedelta

from app.worker import celery_app

logger = logging.getLogger("stayvise.tasks.messenger")

_DEDUP_TTL = 86400  # 24 hours
_SESSION_EXPIRY_HOURS = 24


@celery_app.task(
    bind=True,
    name="tasks.process_messenger_message",
    max_retries=3,
    default_retry_delay=10,
    acks_late=True,
)
def process_messenger_message(self, payload: dict) -> None:  # type: ignore[no-untyped-def]
    """
    Process a single inbound Messenger message.

    This is a sync Celery task that runs the async logic via asyncio.run().

    Payload shape::

        {
            "message_id": "wamid.xxx",
            "from_phone": "919876543210",
            "contact_name": "Priya",
            "message": { ... raw WhatsApp message object ... }
        }
    """
    try:
        asyncio.run(_process_message_async(payload))
    except Exception as exc:
        logger.error(
            "Failed to process Messenger message %s: %s",
            payload.get("message_id", "?"),
            exc,
            exc_info=True,
        )
        raise self.retry(exc=exc)


async def _process_message_async(payload: dict) -> None:
    """Async message processing — dedup, load session, route, persist."""
    import redis.asyncio as aioredis  # noqa: PLC0415

    from app.api.v1.messaging_webhook import parse_inbound_message  # noqa: PLC0415
    from app.core.config import settings  # noqa: PLC0415
    from app.services.messaging_conversation import ConversationStateMachine  # noqa: PLC0415

    message_id = payload.get("message_id", "")
    from_phone = payload.get("from_phone", "")
    contact_name = payload.get("contact_name", "")
    raw_message = payload.get("message", {})

    if not from_phone:
        logger.warning("No from_phone in payload, skipping")
        return

    # Normalize phone to E.164 if missing +
    if not from_phone.startswith("+"):
        from_phone = f"+{from_phone}"

    # ── Deduplication via Redis ────────────────────────────────────────────────
    redis = aioredis.from_url(
        str(settings.REDIS_URL), encoding="utf-8", decode_responses=True
    )
    try:
        dedup_key = f"messaging_processed:{message_id}"
        already_processed = await redis.get(dedup_key)
        if already_processed:
            logger.debug("Message %s already processed, skipping", message_id)
            return

        # Mark as processed
        await redis.setex(dedup_key, _DEDUP_TTL, "1")

        # ── Parse message ──────────────────────────────────────────────────────
        parsed = parse_inbound_message(raw_message)
        logger.info(
            "Processing message: id=%s from=%s type=%s",
            message_id, from_phone, parsed.get("type"),
        )

        # ── Load or create session ─────────────────────────────────────────────
        from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker  # noqa: PLC0415
        from sqlalchemy import select  # noqa: PLC0415
        from app.db.models import MessengerSession, User  # noqa: PLC0415

        engine = create_async_engine(str(settings.DATABASE_URL), echo=False)
        SessionFactory = async_sessionmaker(engine, expire_on_commit=False)

        async with SessionFactory() as db:
            # Find existing session
            result = await db.execute(
                select(MessengerSession)
                .where(MessengerSession.phone_number == from_phone)
                .order_by(MessengerSession.created_at.desc())
                .limit(1)
            )
            session = result.scalar_one_or_none()

            # Find user
            user_result = await db.execute(
                select(User).where(User.phone_number == from_phone)
            )
            user = user_result.scalar_one_or_none()

            now = datetime.now(timezone.utc)
            expires_at = now + timedelta(hours=_SESSION_EXPIRY_HOURS)

            if session is None or session.expires_at < now:
                # Create new session
                session = MessengerSession(
                    phone_number=from_phone,
                    user_id=user.id if user else None,
                    session_state={"state": "IDLE"},
                    last_message_at=now,
                    expires_at=expires_at,
                )
                db.add(session)
                await db.flush()
                await db.refresh(session)
            else:
                # Update existing session
                session.last_message_at = now
                session.expires_at = expires_at
                if user and not session.user_id:
                    session.user_id = user.id
                db.add(session)
                await db.flush()

            # Update messenger_name if available
            if contact_name and user and user.messenger_name != contact_name:
                user.messenger_name = contact_name
                db.add(user)
                await db.flush()

            # ── Route through conversation state machine ───────────────────────
            machine = ConversationStateMachine(
                session=session,
                user=user,
                db=db,
                phone=from_phone,
            )
            await machine.handle(parsed)

            # Persist updated session state
            db.add(session)
            await db.commit()

        await engine.dispose()

    finally:
        await redis.aclose()
