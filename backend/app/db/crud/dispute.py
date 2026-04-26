from __future__ import annotations
"""Concrete CRUD for Dispute."""


from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.crud.base import CRUDBase
from app.db.models import Dispute, DisputeStatus
from app.schemas.dispute import DisputeCreate, DisputeUpdate


class CRUDDispute(CRUDBase[Dispute, DisputeCreate, DisputeUpdate]):

    async def get_open_by_project(
        self, db: AsyncSession, *, project_id: str
    ) -> list[Dispute]:
        result = await db.execute(
            select(Dispute).where(
                Dispute.project_id == project_id,
                Dispute.status.in_(
                    [DisputeStatus.open, DisputeStatus.under_review]
                ),
            )
        )
        return list(result.scalars().all())

    async def get_by_milestone(
        self, db: AsyncSession, *, milestone_id: str
    ) -> list[Dispute]:
        result = await db.execute(
            select(Dispute).where(Dispute.milestone_id == milestone_id)
        )
        return list(result.scalars().all())

    async def resolve(
        self,
        db: AsyncSession,
        *,
        dispute: Dispute,
        status: DisputeStatus,
        resolved_by_id: str,
        notes: str,
    ) -> Dispute:
        from datetime import timezone, datetime  # noqa: PLC0415

        return await self.update(
            db,
            db_obj=dispute,
            obj_in={
                "status": status,
                "resolved_by_id": resolved_by_id,
                "resolution_notes": notes,
                "resolved_at": datetime.now(timezone.utc),
            },
        )


dispute = CRUDDispute(Dispute)
