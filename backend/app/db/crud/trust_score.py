from __future__ import annotations
from typing import Optional
"""Concrete CRUD for TrustScore."""


from sqlalchemy.ext.asyncio import AsyncSession

from app.db.crud.base import CRUDBase
from app.db.models import TrustScore
from app.schemas.trust_score import TrustScoreCreate, TrustScoreUpdate


class CRUDTrustScore(CRUDBase[TrustScore, TrustScoreCreate, TrustScoreUpdate]):

    async def get_by_user(
        self, db: AsyncSession, *, user_id: str
    ) -> Optional[TrustScore]:
        return await self.get_by(db, user_id=user_id)

    async def get_or_create(
        self, db: AsyncSession, *, user_id: str
    ) -> tuple[TrustScore, bool]:
        """
        Return (trust_score, created).
        Creates a default TrustScore row if one doesn't exist yet.
        Called on first project completion / trust recalculation.
        """
        existing = await self.get_by_user(db, user_id=user_id)
        if existing:
            return existing, False
        obj = TrustScore(user_id=user_id)
        db.add(obj)
        await db.flush()
        await db.refresh(obj)
        return obj, True

    async def increment_project_counts(
        self,
        db: AsyncSession,
        *,
        user_id: str,
        completed: bool = False,
        disputed: bool = False,
    ) -> TrustScore:
        """Atomically bump project counters after a project state change."""
        ts, _ = await self.get_or_create(db, user_id=user_id)
        updates: dict = {"total_projects": ts.total_projects + 1}
        if completed:
            updates["completed_projects"] = ts.completed_projects + 1
        if disputed:
            updates["disputed_projects"] = ts.disputed_projects + 1
        return await self.update(db, db_obj=ts, obj_in=updates)


trust_score = CRUDTrustScore(TrustScore)
