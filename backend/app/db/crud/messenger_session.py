from __future__ import annotations
from typing import Optional
"""Concrete CRUD for MessengerSession."""


from datetime import timezone, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.crud.base import CRUDBase
from app.db.models import MessengerSession
from app.schemas.messenger_session import MessengerSessionCreate, MessengerSessionUpdate

_SESSION_TTL_HOURS = 24


class CRUDMessengerSession(CRUDBase[MessengerSession, MessengerSessionCreate, MessengerSessionUpdate]):

    async def get_active_by_phone(
        self, db: AsyncSession, *, phone: str
    ) -> Optional[MessengerSession]:
        """Return the most-recent non-expired session for a phone number."""
        now = datetime.now(timezone.utc)
        result = await db.execute(
            select(MessengerSession)
            .where(
                MessengerSession.phone_number == phone,
                MessengerSession.expires_at > now,
            )
            .order_by(MessengerSession.last_message_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def upsert(
        self,
        db: AsyncSession,
        *,
        phone: str,
        user_id: Optional[str],
        state: dict,
    ) -> MessengerSession:
        """
        Get the active session for *phone* and update its state,
        or create a new one if none exists / session expired.
        """
        now = datetime.now(timezone.utc)
        session = await self.get_active_by_phone(db, phone=phone)

        if session is None:
            session = MessengerSession(
                phone_number=phone,
                user_id=user_id,
                session_state=state,
                last_message_at=now,
                expires_at=now + timedelta(hours=_SESSION_TTL_HOURS),
            )
            db.add(session)
            await db.flush()
            await db.refresh(session)
        else:
            await self.update(
                db,
                db_obj=session,
                obj_in={
                    "session_state": state,
                    "user_id": user_id or session.user_id,
                    "last_message_at": now,
                    "expires_at": now + timedelta(hours=_SESSION_TTL_HOURS),
                },
            )
        return session

    async def clear_state(
        self, db: AsyncSession, *, phone: str
    ) -> None:
        """Reset session state (e.g., after a flow completes)."""
        session = await self.get_active_by_phone(db, phone=phone)
        if session:
            await self.update(db, db_obj=session, obj_in={"session_state": {}})

    async def purge_expired(self, db: AsyncSession) -> int:
        """
        Delete all expired sessions.
        Call via Celery beat task (e.g., nightly cleanup).
        Returns the number of rows deleted.
        """
        now = datetime.now(timezone.utc)
        result = await db.execute(
            delete(MessengerSession).where(MessengerSession.expires_at <= now)
        )
        await db.flush()
        return result.rowcount  # type: ignore[return-value]


messenger_session = CRUDMessengerSession(MessengerSession)
