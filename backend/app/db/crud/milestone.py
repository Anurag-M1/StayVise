from __future__ import annotations
from typing import Optional
"""Concrete CRUD for Milestone."""


from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.crud.base import CRUDBase
from app.db.models import Milestone, MilestoneStatus
from app.schemas.milestone import MilestoneCreate, MilestoneUpdate


class CRUDMilestone(CRUDBase[Milestone, MilestoneCreate, MilestoneUpdate]):

    async def get_by_project(
        self, db: AsyncSession, *, project_id: str
    ) -> list[Milestone]:
        """Return milestones ordered by sequence_number (ascending)."""
        result = await db.execute(
            select(Milestone)
            .where(Milestone.project_id == project_id)
            .order_by(Milestone.sequence_number)
        )
        return list(result.scalars().all())

    async def get_next_pending(
        self, db: AsyncSession, *, project_id: str
    ) -> Optional[Milestone]:
        """Return the lowest-sequence pending milestone (sequential release model)."""
        result = await db.execute(
            select(Milestone)
            .where(
                Milestone.project_id == project_id,
                Milestone.status == MilestoneStatus.pending,
            )
            .order_by(Milestone.sequence_number)
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def validate_amounts_equal_total(
        self,
        db: AsyncSession,
        *,
        project_id: str,
        expected_total: Decimal,
    ) -> bool:
        """
        Service-layer invariant check:
            SUM(milestone.amount) == project.total_amount

        Called before finalising project creation and whenever milestones are
        added/edited. Returns True when amounts balance.
        """
        from sqlalchemy import func  # noqa: PLC0415

        result = await db.execute(
            select(func.sum(Milestone.amount)).where(
                Milestone.project_id == project_id
            )
        )
        actual: Decimal = result.scalar_one() or Decimal("0")
        return actual == expected_total

    async def transition_status(
        self,
        db: AsyncSession,
        *,
        milestone: Milestone,
        new_status: MilestoneStatus,
    ) -> Milestone:
        return await self.update(
            db, db_obj=milestone, obj_in={"status": new_status}
        )


milestone = CRUDMilestone(Milestone)
