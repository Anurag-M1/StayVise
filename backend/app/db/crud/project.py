from __future__ import annotations
from typing import Optional
"""Concrete CRUD for Project — enhanced with join queries."""


from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.crud.base import CRUDBase
from app.db.models import Milestone, Project, ProjectStatus
from app.schemas.project import ProjectCreate as ProjectCreateSchema, ProjectUpdate


class CRUDProject(CRUDBase[Project, ProjectCreateSchema, ProjectUpdate]):

    # ── Single project with milestones ─────────────────────────────────────────

    async def get_with_milestones(
        self, db: AsyncSession, *, project_id: str
    ) -> Optional[Project]:
        """Single query with selectinload for milestones."""
        result = await db.execute(
            select(Project)
            .options(
                selectinload(Project.milestones),
                selectinload(Project.client),
                selectinload(Project.freelancer),
            )
            .where(Project.id == project_id)
        )
        return result.scalar_one_or_none()

    # ── By Razorpay order ──────────────────────────────────────────────────────

    async def get_by_razorpay_order(
        self, db: AsyncSession, *, order_id: str
    ) -> Optional[Project]:
        result = await db.execute(
            select(Project).where(Project.razorpay_order_id == order_id)
        )
        return result.scalar_one_or_none()

    # ── Projects for a user (as freelancer OR client) ──────────────────────────

    async def get_projects_for_user(
        self,
        db: AsyncSession,
        *,
        user_id: str,
        role: Optional[str] = None,
        statuses: Optional[list[ProjectStatus]] = None,
        cursor: Optional[datetime] = None,
        skip: Optional[int] = None,
        limit: int = 20,
    ) -> tuple[list[Project], int]:
        """
        Return (projects, total_count) for a user.

        Args:
            role: "freelancer" or "client" — if None, return both.
            status: Optional status filter.
            cursor: Keyset pagination cursor (created_at).
            skip: Offset pagination skip (optional).
        """
        limit = min(limit, 200)

        # Build the base WHERE clause
        if role == "freelancer":
            where = Project.freelancer_id == user_id
        elif role == "client":
            where = Project.client_id == user_id
        else:
            where = or_(
                Project.freelancer_id == user_id,
                Project.client_id == user_id,
            )

        # Count query
        count_stmt = select(func.count()).select_from(Project).where(where)
        if statuses:
            count_stmt = count_stmt.where(Project.status.in_(statuses))
        count_result = await db.execute(count_stmt)
        total = count_result.scalar_one()

        # Data query
        data_stmt = (
            select(Project)
            .options(
                selectinload(Project.client),
                selectinload(Project.freelancer),
            )
            .where(where)
        )
        if statuses:
            data_stmt = data_stmt.where(Project.status.in_(statuses))
            
        if cursor:
            data_stmt = data_stmt.where(Project.created_at < cursor)
            
        data_stmt = data_stmt.order_by(Project.created_at.desc())
        
        if skip is not None:
            data_stmt = data_stmt.offset(skip)
            
        data_stmt = data_stmt.limit(limit)
        data_result = await db.execute(data_stmt)
        projects = list(data_result.scalars().all())

        return projects, total

    # ── Pending auto-release (for Celery cron job) ─────────────────────────────

    async def get_pending_auto_release(
        self, db: AsyncSession
    ) -> list[Project]:
        """Fetch projects where auto_release_at <= now() — used by Celery beat."""
        result = await db.execute(
            select(Project)
            .options(selectinload(Project.milestones))
            .where(
                Project.auto_release_at <= func.now(),
                Project.status == ProjectStatus.in_progress,
            )
        )
        return list(result.scalars().all())

    # ── Auto-release milestones waiting ────────────────────────────────────────

    async def get_pending_auto_release_milestones(
        self, db: AsyncSession
    ) -> list[Milestone]:
        """Fetch milestones that are submitted and past auto-release window."""
        from app.db.models import MilestoneStatus  # noqa: PLC0415

        result = await db.execute(
            select(Milestone)
            .join(Project)
            .where(
                Milestone.status == MilestoneStatus.submitted,
                Project.status == ProjectStatus.in_progress,
                Project.auto_release_at <= func.now(),
            )
        )
        return list(result.scalars().all())

    # ── Status transition ──────────────────────────────────────────────────────

    async def transition_status(
        self,
        db: AsyncSession,
        *,
        project: Project,
        new_status: ProjectStatus,
    ) -> Project:
        return await self.update(db, db_obj=project, obj_in={"status": new_status})


project = CRUDProject(Project)
