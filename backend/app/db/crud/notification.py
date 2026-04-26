from __future__ import annotations
from typing import Optional
"""Concrete CRUD for Notification."""


from datetime import timezone, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.crud.base import CRUDBase
from app.db.models import Notification, NotificationChannel, NotificationType
from app.schemas.notification import NotificationCreate, NotificationUpdate


class CRUDNotification(CRUDBase[Notification, NotificationCreate, NotificationUpdate]):

    async def get_undelivered(
        self,
        db: AsyncSession,
        *,
        user_id: str,
        channel: Optional[NotificationChannel] = None,
    ) -> list[Notification]:
        stmt = select(Notification).where(
            Notification.user_id == user_id,
            Notification.delivered_at.is_(None),
        )
        if channel:
            stmt = stmt.where(Notification.channel == channel)
        stmt = stmt.order_by(Notification.created_at)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def get_recent(
        self,
        db: AsyncSession,
        *,
        user_id: str,
        limit: int = 20,
    ) -> list[Notification]:
        result = await db.execute(
            select(Notification)
            .where(Notification.user_id == user_id)
            .order_by(Notification.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get_by_user_and_id(
        self,
        db: AsyncSession,
        *,
        user_id: str,
        notification_id: str,
    ) -> Optional[Notification]:
        result = await db.execute(
            select(Notification).where(
                Notification.id == notification_id,
                Notification.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()

    async def mark_sent(
        self, db: AsyncSession, *, notification: Notification
    ) -> Notification:
        return await self.update(
            db, db_obj=notification, obj_in={"sent_at": datetime.now(timezone.utc)}
        )

    async def mark_delivered(
        self, db: AsyncSession, *, notification: Notification
    ) -> Notification:
        return await self.update(
            db,
            db_obj=notification,
            obj_in={"delivered_at": datetime.now(timezone.utc)},
        )

    async def mark_read(
        self, db: AsyncSession, *, notification: Notification
    ) -> Notification:
        return await self.update(
            db,
            db_obj=notification,
            obj_in={"read_at": datetime.now(timezone.utc)},
        )

    async def mark_all_read(
        self,
        db: AsyncSession,
        *,
        user_id: str,
    ) -> int:
        notifications = await self.get_recent(db, user_id=user_id, limit=100)
        unread = [item for item in notifications if item.read_at is None]
        for item in unread:
            item.read_at = datetime.now(timezone.utc)
        await db.flush()
        return len(unread)

    async def create_for_user(
        self,
        db: AsyncSession,
        *,
        user_id: str,
        notif_type: NotificationType,
        channel: NotificationChannel,
        payload: dict,
    ) -> Notification:
        """Convenience factory — creates a notification without a schema."""
        obj = Notification(
            user_id=user_id,
            type=notif_type,
            channel=channel,
            payload=payload,
        )
        db.add(obj)
        await db.flush()
        await db.refresh(obj)
        return obj


notification = CRUDNotification(Notification)
