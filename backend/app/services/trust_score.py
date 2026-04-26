from __future__ import annotations
from typing import Optional
"""
StayVise — Trust Score Calculation Engine.

The trust score is the core moat — a composite metric (0–100) that
reflects a freelancer's reliability and professionalism.

Formula::

    score = (
        completion_rate * 40 +    # % projects completed without dispute
        delivery_speed  * 25 +    # on-time vs late delivery ratio
        response_rate   * 20 +    # WhatsApp responses within 24h
        longevity_bonus * 15      # 0→15 over first 12 months
    )

All sub-calculations run in parallel via ``asyncio.gather``.
"""


import asyncio
import logging
from datetime import timezone, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Milestone,
    MilestoneStatus,
    Project,
    ProjectStatus,
    TrustScore,
    User,
)

logger = logging.getLogger("stayvise.trust_score")


class TrustScoreService:
    """Calculates, persists, and exposes trust scores."""

    # ══════════════════════════════════════════════════════════════════════════
    # Main entrypoint
    # ══════════════════════════════════════════════════════════════════════════

    async def calculate_and_save(
        self, user_id: str, db: AsyncSession
    ) -> TrustScore:
        """
        Run all sub-calculations in parallel, compute the composite score,
        and upsert into the ``trust_scores`` table.
        """
        user_result = await db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()
        if user is None:
            raise ValueError(f"User {user_id} not found.")

        # NOTE: All sub-calculations must run sequentially because asyncpg
        # does not support concurrent operations on a single connection.
        completion_rate = await self._calc_completion_rate(user_id, db)
        response_rate_val = await self._calc_response_rate(user_id, db)
        longevity = await self._calc_longevity(user_id, db)
        stats = await self._calc_project_stats(user_id, db)

        if user.role.value == "client":
            approval_speed = await self._calc_client_approval_speed(user_id, db)
        else:
            delivery_speed = await self._calc_delivery_speed(user_id, db)

        if stats["total"] == 0:
            # Baseline for new users is strictly 50
            score = Decimal("50.00")
        else:
            if user.role.value == "client":
                raw_score = (
                    completion_rate * 45
                    + approval_speed * 25
                    + response_rate_val * 15
                    + longevity * 15
                )
            else:
                raw_score = (
                    completion_rate * 40
                    + delivery_speed * 25
                    + response_rate_val * 20
                    + longevity * 15
                )
            score = Decimal(str(min(raw_score, 100.0))).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )

        avg_delivery = await self._calc_avg_delivery_days(user_id, db, user.role.value)

        now = datetime.now(timezone.utc)

        # Upsert trust score
        result = await db.execute(
            select(TrustScore).where(TrustScore.user_id == user_id)
        )
        trust_score = result.scalar_one_or_none()

        if trust_score is None:
            trust_score = TrustScore(user_id=user_id)
            db.add(trust_score)

        trust_score.score = trust_score.admin_override_score if trust_score.admin_override_score is not None else score
        trust_score.total_projects = stats["total"]
        trust_score.completed_projects = stats["completed"]
        trust_score.disputed_projects = stats["disputed"]
        trust_score.response_rate = Decimal(str(response_rate_val * 100)).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        trust_score.avg_delivery_days = avg_delivery
        trust_score.last_calculated_at = now

        db.add(trust_score)
        await db.flush()
        await db.refresh(trust_score)

        logger.info(
            "Trust score calculated: user=%s score=%.2f "
            "(completion=%.2f role_metric=%.2f response=%.2f longevity=%.2f role=%s)",
            user_id,
            score,
            completion_rate,
            approval_speed if user.role.value == "client" else delivery_speed,
            response_rate_val,
            longevity,
            user.role.value,
        )

        return trust_score

    # ══════════════════════════════════════════════════════════════════════════
    # Batch recalculation
    # ══════════════════════════════════════════════════════════════════════════

    async def recalculate_batch(
        self, user_ids: list[str], db: AsyncSession
    ) -> int:
        """
        Recalculate trust scores for a batch of users.
        Returns the number of users processed.
        """
        count = 0
        for uid in user_ids:
            try:
                await self.calculate_and_save(uid, db)
                count += 1
            except Exception as exc:
                logger.error(
                    "Trust score recalculation failed for user %s: %s",
                    uid, exc,
                )
        return count

    # ══════════════════════════════════════════════════════════════════════════
    # Badge system
    # ══════════════════════════════════════════════════════════════════════════

    def get_badges(self, trust_score: TrustScore, user: User) -> list[str]:
        """
        Compute badges based on trust score metrics and user profile.

        Badge tiers:
          - elite         : score ≥ 90
          - verified_pro  : score ≥ 75
          - trusted       : score ≥ 60
          - veteran       : ≥ 10 completed projects
          - expert        : ≥ 50 completed projects
          - fast_delivery : avg delivery < 5 days
          - established   : member for > 1 year
        """
        badges: list[str] = []

        # Score-based tiers (mutually exclusive)
        if trust_score.score >= 90:
            badges.append("elite")
        elif trust_score.score >= 75:
            badges.append("verified_pro")
        elif trust_score.score >= 60:
            badges.append("trusted")

        # Volume badges
        if trust_score.completed_projects >= 50:
            badges.append("expert")
        elif trust_score.completed_projects >= 10:
            badges.append("veteran")

        # Speed badge
        if (
            trust_score.avg_delivery_days is not None
            and trust_score.avg_delivery_days < 5
        ):
            badges.append("fast_delivery")

        # Longevity badge
        now = datetime.now(timezone.utc)
        if user.created_at:
            created_dt = user.created_at
            if created_dt.tzinfo is None:
                created_dt = created_dt.replace(tzinfo=timezone.utc)
            if (now - created_dt) > timedelta(days=365):
                badges.append("established")

        return badges

    # ══════════════════════════════════════════════════════════════════════════
    # Sub-calculations
    # ══════════════════════════════════════════════════════════════════════════

    async def _calc_completion_rate(
        self, user_id: str, db: AsyncSession
    ) -> float:
        """
        Completion rate (0–1.0):
          completed / (completed + disputed + cancelled)

        New users (no terminal projects) → 0.5 (neutral).
        """
        result = await db.execute(
            select(
                func.count().filter(
                    Project.status == ProjectStatus.completed
                ).label("completed"),
                func.count().filter(
                    Project.status.in_([
                        ProjectStatus.completed,
                        ProjectStatus.cancelled,
                    ])
                ).label("total"),
                func.count().filter(
                    Project.status == ProjectStatus.disputed
                ).label("disputed"),
            )
            .select_from(Project)
            .where(
                or_(
                    Project.freelancer_id == user_id,
                    Project.client_id == user_id,
                )
            )
        )
        row = result.one()
        completed = row.completed
        total = row.total
        disputed = getattr(row, "disputed", 0)

        if total == 0:
            return 0.5  # Neutral for new users

        return completed / total

    async def _calc_delivery_speed(
        self, user_id: str, db: AsyncSession
    ) -> float:
        """
        Delivery speed (0–1.0):
          on_time_milestones / total_released_milestones

        For milestones without a project deadline, use
        project.created_at + 30 days as the default deadline.

        No released milestones → 0.5.
        """
        # Get released milestones for projects where this user is freelancer
        result = await db.execute(
            select(Milestone, Project)
            .join(Project, Milestone.project_id == Project.id)
            .where(
                Project.freelancer_id == user_id,
                Milestone.status == MilestoneStatus.released,
                Milestone.released_at.isnot(None),
            )
        )
        rows = result.all()

        if not rows:
            return 0.5

        on_time = 0
        total = 0

        for milestone, project in rows:
            total += 1
            # Determine deadline
            deadline = project.deadline
            rel_at = milestone.released_at
            if rel_at.tzinfo is None:
                rel_at = rel_at.replace(tzinfo=timezone.utc)
                
            if deadline is None and project.created_at:
                # Convert date to datetime for comparison if needed
                p_created = project.created_at
                if p_created.tzinfo is None:
                    p_created = p_created.replace(tzinfo=timezone.utc)
                default_deadline = p_created + timedelta(days=30)
                if rel_at <= default_deadline:
                    on_time += 1
            elif deadline is not None:
                # deadline is a `date`, released_at is a `datetime`
                deadline_dt = datetime.combine(deadline, datetime.max.time()).replace(
                    tzinfo=timezone.utc
                )
                if rel_at <= deadline_dt:
                    on_time += 1
            else:
                on_time += 1  # No baseline, count as on-time

        return on_time / total if total > 0 else 0.5

    async def _calc_response_rate(
        self, user_id: str, db: AsyncSession
    ) -> float:
        """
        Response rate (0–1.0):
          Based on messaging session data — % of sessions with replies
          within 24 hours in the last 90 days.

        Currently returns a generous default until message-level tracking
        is implemented.
        """
        # TODO: Implement once MessengerSession has response tracking fields
        return 0.8  # Generous default for all users

    async def _calc_client_approval_speed(
        self, user_id: str, db: AsyncSession
    ) -> float:
        """
        Client approval speed (0–1.0):
          Measures how quickly a client acts once milestones are submitted.
        """
        result = await db.execute(
            select(Milestone.submitted_at, Milestone.approved_at, Milestone.released_at)
            .join(Project, Milestone.project_id == Project.id)
            .where(
                Project.client_id == user_id,
                Milestone.submitted_at.isnot(None),
                Milestone.status.in_([MilestoneStatus.approved, MilestoneStatus.released]),
            )
        )
        rows = result.all()

        if not rows:
            return 0.6

        fast_actions = 0
        total = 0
        for submitted_at, approved_at, released_at in rows:
            decision_at = approved_at or released_at
            if decision_at is None or submitted_at is None:
                continue
            if submitted_at.tzinfo is None:
                submitted_at = submitted_at.replace(tzinfo=timezone.utc)
            if decision_at.tzinfo is None:
                decision_at = decision_at.replace(tzinfo=timezone.utc)

            total += 1
            if (decision_at - submitted_at).total_seconds() <= 72 * 3600:
                fast_actions += 1

        return fast_actions / total if total > 0 else 0.6

    async def _calc_longevity(
        self, user_id: str, db: AsyncSession
    ) -> float:
        """
        Longevity bonus (0–1.0):
          min(days_active / 365, 1.0)

        Linearly scales from 0 to 1.0 over the first 12 months.
        """
        result = await db.execute(
            select(User.created_at).where(User.id == user_id)
        )
        created_at = result.scalar_one_or_none()

        if created_at is None:
            return 0.0

        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)

        now = datetime.now(timezone.utc)
        days_active = (now - created_at).days
        return min(days_active / 365.0, 1.0)

    async def _calc_project_stats(
        self, user_id: str, db: AsyncSession
    ) -> dict[str, int]:
        """Return total / completed / disputed counts."""
        result = await db.execute(
            select(
                func.count().label("total"),
                func.count().filter(
                    Project.status == ProjectStatus.completed
                ).label("completed"),
                func.count().filter(
                    Project.status == ProjectStatus.disputed
                ).label("disputed"),
            )
            .select_from(Project)
            .where(
                or_(
                    Project.freelancer_id == user_id,
                    Project.client_id == user_id,
                )
            )
        )
        row = result.one()
        return {
            "total": row.total,
            "completed": row.completed,
            "disputed": row.disputed,
        }

    async def _calc_avg_delivery_days(
        self, user_id: str, db: AsyncSession, role: str
    ) -> Optional[Decimal]:
        """
        Average days from funding/submission to the user's key action.
        """
        if role == "client":
            result = await db.execute(
                select(Milestone.submitted_at, Milestone.approved_at, Milestone.released_at)
                .join(Project, Milestone.project_id == Project.id)
                .where(
                    Project.client_id == user_id,
                    Milestone.submitted_at.isnot(None),
                    Milestone.status.in_([MilestoneStatus.approved, MilestoneStatus.released]),
                )
            )
        else:
            result = await db.execute(
                select(Milestone.released_at, Project.escrow_held_at)
                .join(Project, Milestone.project_id == Project.id)
                .where(
                    Project.freelancer_id == user_id,
                    Milestone.status == MilestoneStatus.released,
                    Milestone.released_at.isnot(None),
                    Project.escrow_held_at.isnot(None),
                )
            )
        rows = result.all()

        if not rows:
            return None

        total_days = 0.0
        count = 0
        if role == "client":
            for submitted_at, approved_at, released_at in rows:
                action_at = approved_at or released_at
                if submitted_at is None or action_at is None:
                    continue
                if submitted_at.tzinfo is None:
                    submitted_at = submitted_at.replace(tzinfo=timezone.utc)
                if action_at.tzinfo is None:
                    action_at = action_at.replace(tzinfo=timezone.utc)
                delta = (action_at - submitted_at).total_seconds() / 86400
                total_days += max(delta, 0)
                count += 1
        else:
            for released_at, escrow_held_at in rows:
                if released_at.tzinfo is None:
                    released_at = released_at.replace(tzinfo=timezone.utc)
                if escrow_held_at.tzinfo is None:
                    escrow_held_at = escrow_held_at.replace(tzinfo=timezone.utc)
                delta = (released_at - escrow_held_at).total_seconds() / 86400
                total_days += max(delta, 0)
                count += 1

        if count == 0:
            return None

        avg = total_days / count
        return Decimal(str(avg)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


# ── Module singleton ───────────────────────────────────────────────────────────
trust_score_service = TrustScoreService()
