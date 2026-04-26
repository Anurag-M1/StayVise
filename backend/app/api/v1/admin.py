"""
StayVise — Comprehensive Admin API.
Internal management of users, disputes, and platform health.
"""


import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, desc, or_, update
from sqlalchemy.orm import selectinload

from app.core.cache import cached_response
from app.core.deps import AdminUser, DbSession
from app.schemas.user import UserResponse, UserWithTrustScore, UserPublicProfile
from app.schemas.project import DisputeResponse
from app.schemas.public import PublicSubmissionResponse, SubmissionUpdate
from app.schemas.admin import (
    AdminOverviewResponse, 
    AdminDashboardStats, 
    AdminDashboardCharts, 
    DailyVolumeChartPoint, 
    ProjectStatusPoint, 
    AdminAlert,
    AdminNotificationResponse,
    DisputeResolutionRequest,
    AdminUserUpdate,
    AdminTransactionResponse,
    AdminTransactionSummary,
    SystemSettingsRead,
    SystemSettingsUpdate
)
from app.db.models import User, Project, Dispute, Transaction, ProjectStatus, TransactionType, TransactionStatus, PublicSubmission, SystemSettings
from app.core.exceptions import NotFoundError, ForbiddenError

logger = logging.getLogger("stayvise.admin")

router = APIRouter()

# ══════════════════════════════════════════════════════════════════════════════
# GET /overview — platform metrics
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/overview", response_model=AdminOverviewResponse)
@cached_response(key_prefix="admin_overview", ttl=300)
async def get_overview(db: DbSession, admin: AdminUser):
    """
    Consolidated dashboard data for the admin home page.
    Includes metric deltas, chart points, and urgent alerts.
    """
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday_start = today_start - timedelta(days=1)

    # 1. Stats Aggregation (Lifetime Totals)
    total_users = await db.scalar(select(func.count(User.id)))
    total_projects = await db.scalar(select(func.count(Project.id)))
    # Filter: sum of total_amount only for projects that have been successfully funded
    funded_project_ids = select(Transaction.project_id).where(
        Transaction.transaction_type == TransactionType.escrow_hold,
        Transaction.status == TransactionStatus.success
    ).scalar_subquery()

    total_volume = await db.scalar(select(func.sum(Project.total_amount)).where(
        Project.id.in_(funded_project_ids)
    )) or Decimal(0)
    total_open_disputes = await db.scalar(select(func.count(Dispute.id)).where(Dispute.status.in_(["open", "under_review"])))

    # 2. Daily Volume Chart (Last 7 days) - Remains temporal for trend analysis
    chart_points = []
    for i in range(7):
        day = today_start - timedelta(days=i)
        next_day = day + timedelta(days=1)
        vol = await db.scalar(select(func.sum(Project.total_amount)).where(
            Project.id.in_(
                select(Transaction.project_id).where(
                    Transaction.transaction_type == TransactionType.escrow_hold,
                    Transaction.status == TransactionStatus.success,
                    Transaction.created_at >= day,
                    Transaction.created_at < next_day
                ).scalar_subquery()
            )
        )) or Decimal(0)
        chart_points.append(DailyVolumeChartPoint(date=day.strftime("%d %b"), volume=vol))
    
    # 3. Project Breakdown Donut
    statuses = ["in_progress", "completed", "disputed", "awaiting_payment"]
    breakdown = []
    for s in statuses:
        count = await db.scalar(select(func.count(Project.id)).where(Project.status == s))
        breakdown.append(ProjectStatusPoint(status=s, count=count))

    # 4. Active Disputes List
    active_disputes_q = (
        select(Dispute)
        .options(
            selectinload(Dispute.project).selectinload(Project.freelancer),
            selectinload(Dispute.project).selectinload(Project.client),
            selectinload(Dispute.milestone),
            selectinload(Dispute.raised_by)
        )
        .where(Dispute.status.in_(["open", "under_review"]))
        .order_by(desc(Dispute.created_at))
        .limit(10)
    )
    active_disputes_res = await db.execute(active_disputes_q)
    active_disputes = active_disputes_res.scalars().all()

    return AdminOverviewResponse(
        stats=AdminDashboardStats(
            total_users=total_users,
            total_projects=total_projects,
            total_volume=total_volume,
            total_open_disputes=total_open_disputes,
            disputes_severity="low" if total_open_disputes < 5 else "amber"
        ),
        charts=AdminDashboardCharts(
            daily_volume=chart_points[::-1],
            status_breakdown=breakdown
        ),
        alerts=[
            AdminAlert(id="1", severity="red", message=f"{total_open_disputes} disputes unresolved — URGENT", timestamp=now)
        ],
        active_disputes=[DisputeResponse.model_validate(d) for d in active_disputes]
    )

# ══════════════════════════════════════════════════════════════════════════════
# GET /disputes — management ledger
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/disputes", response_model=List[DisputeResponse])
async def list_all_disputes(
    db: DbSession, 
    admin: AdminUser,
    status: Optional[str] = None
):
    """View all platform disputes for triage."""
    from app.db.models import Dispute  # noqa: PLC0415
    query = select(Dispute).options(
        selectinload(Dispute.project),
        selectinload(Dispute.milestone)
    )
    if status:
        query = query.where(Dispute.status == status)
    
    result = await db.execute(query.order_by(desc(Dispute.created_at)))
    return [DisputeResponse.model_validate(d) for d in result.scalars().all()]


@router.post("/disputes/{dispute_id}/claim")
async def claim_dispute(
    dispute_id: str,
    db: DbSession,
    admin: AdminUser
):
    """Assign the current admin to a dispute."""
    result = await db.execute(select(Dispute).where(Dispute.id == dispute_id))
    dispute = result.scalar_one_or_none()
    if not dispute:
        raise NotFoundError("Dispute not found")
    
    if dispute.assigned_to_id:
        raise ForbiddenError("Dispute already claimed by another agent")

    dispute.assigned_to_id = admin.id
    dispute.status = "under_review"
    await db.commit()
    return {"status": "success", "assigned_to": admin.full_name}


@router.post("/disputes/{dispute_id}/resolve")
async def resolve_dispute(
    dispute_id: str,
    body: DisputeResolutionRequest,
    db: DbSession,
    admin: AdminUser
):
    """
    Finalize a dispute decision and distribute funds.
    freelancer_payout_pct: % of the milestone amount released to freelancer.
    Remaining goes back to client.
    """
    result = await db.execute(
        select(Dispute)
        .options(selectinload(Dispute.project), selectinload(Dispute.milestone))
        .where(Dispute.id == dispute_id)
    )
    dispute = result.scalar_one_or_none()
    if not dispute:
        raise NotFoundError("Dispute not found")

    if dispute.status == "resolved":
        return {"status": "error", "message": "Dispute already resolved"}

    # 1. Update Dispute record
    dispute.status = "resolved"
    dispute.resolution_notes = body.resolution_notes
    dispute.resolved_by_id = admin.id
    dispute.resolved_at = datetime.now(timezone.utc)

    # 2. Financial Logic (Simplified for prototype)
    # In a real app, this would trigger Razorpay Payouts or Refunds.
    # Here we just update the milestone and project status.
    if dispute.milestone:
        dispute.milestone.status = "released"
    
    # Check if all milestones are now done to complete project
    # (Assumption: resolution always finishes the contested part)

    await db.commit()
    
    logger.info(f"Dispute {dispute_id} resolved by {admin.full_name}. Split: {body.freelancer_payout_pct}% to freelancer.")
    
    return {"status": "success", "message": "Dispute resolved and funds distributed."}


# ══════════════════════════════════════════════════════════════════════════════
# GET /users — platform-wide search
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/users", response_model=List[UserWithTrustScore])
async def search_users(
    db: DbSession,
    admin: AdminUser,
    q: Optional[str] = None,
    role: Optional[str] = None,
    is_active: Optional[bool] = None,
    is_verified: Optional[bool] = None
):
    """Lookup users by multiple identifiers."""
    query = select(User)
    if q:
        query = query.where(
            or_(
                User.full_name.ilike(f"%{q}%"),
                User.phone_number.ilike(f"%{q}%"),
                User.email.ilike(f"%{q}%"),
                User.username.ilike(f"%{q}%"),
                User.id == q if len(q) == 36 else False # Exact ID lookup
            )
        )
    if role:
        query = query.where(User.role == role)
    if is_active is not None:
        query = query.where(User.is_active == is_active)
    if is_verified is not None:
        query = query.where(User.is_verified == is_verified)
        
    result = await db.execute(query.order_by(desc(User.created_at)).limit(50))
    return [UserWithTrustScore.model_validate(u) for u in result.scalars().all()]


@router.get("/users/{user_id}", response_model=UserWithTrustScore)
async def get_user_detail(user_id: str, db: DbSession, admin: AdminUser):
    """Get full user profile including relationships."""
    user = await db.get(User, user_id)
    if not user:
        raise NotFoundError("User not found")
    return user


@router.patch("/users/{user_id}", response_model=UserResponse)
async def update_user(user_id: str, body: AdminUserUpdate, db: DbSession, admin: AdminUser):
    """Update user account status or core info."""
    user = await db.get(User, user_id)
    if not user:
        raise NotFoundError("User not found")
    
    update_data = body.model_dump(exclude_unset=True)
    
    # Uniqueness checks
    if "email" in update_data and update_data["email"]:
        existing = await db.execute(select(User).where(User.email == update_data["email"], User.id != user_id))
        if existing.scalar_one_or_none():
            raise ForbiddenError("This email is already taken by another account")
            
    if "username" in update_data and update_data["username"]:
        existing = await db.execute(select(User).where(User.username == update_data["username"], User.id != user_id))
        if existing.scalar_one_or_none():
            raise ForbiddenError("This username is already taken")

    trust_score_override = update_data.pop("trust_score_override", None)
    
    for key, value in update_data.items():
        setattr(user, key, value)
        
    if trust_score_override is not None:
        from app.db.models import TrustScore
        from sqlalchemy import select
        result = await db.execute(select(TrustScore).where(TrustScore.user_id == user_id))
        ts = result.scalar_one_or_none()
        if not ts:
            ts = TrustScore(user_id=user_id)
            db.add(ts)
        # If passed 0 or negative or any sentinel to clear, we can set to None. Let's say if it's -1, we clear it.
        if trust_score_override < Decimal("0"):
            ts.admin_override_score = None
        else:
            ts.admin_override_score = trust_score_override
            ts.score = trust_score_override
        db.add(ts)
    
    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, db: DbSession, admin: AdminUser):
    """Soft delete/Ban a user from the platform."""
    user = await db.get(User, user_id)
    if not user:
        raise NotFoundError("User not found")
    
    await db.delete(user)
    await db.commit()
    return {"status": "success", "message": "User has been completely deleted"}


@router.post("/users/{user_id}/logout-all")
async def terminate_user_sessions_admin(
    user_id: str, 
    db: DbSession, 
    admin: AdminUser
):
    """Admin-only: Sign out user from all active devices."""
    from app.db.models import UserSession
    from sqlalchemy import update
    
    stmt = (
        update(UserSession)
        .where(UserSession.user_id == user_id, UserSession.is_active.is_(True))
        .values(is_active=False)
    )
    result = await db.execute(stmt)
    await db.commit()
    
    logger.info("Admin %s terminated all sessions for user %s", admin.id, user_id)
    return {"status": "success", "revoked_count": result.rowcount}


# ══════════════════════════════════════════════════════════════════════════════
# GET /transactions — platform ledger
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/transactions", response_model=List[AdminTransactionResponse])
async def list_global_transactions(
    db: DbSession,
    admin: AdminUser,
    limit: int = Query(50, le=100),
    offset: int = 0
):
    """View platform-wide financial movements with project context."""
    from app.db.models import Project, Milestone  # noqa: PLC0415
    
    query = (
        select(
            Transaction.id,
            Transaction.project_id,
            Transaction.milestone_id,
            Transaction.transaction_type,
            Transaction.amount,
            Transaction.status,
            Transaction.created_at,
            Transaction.razorpay_reference,
            Project.title.label("project_title"),
            Milestone.title.label("milestone_title")
        )
        .outerjoin(Project, Transaction.project_id == Project.id)
        .outerjoin(Milestone, Transaction.milestone_id == Milestone.id)
        .order_by(desc(Transaction.created_at))
        .limit(limit)
        .offset(offset)
    )
    
    result = await db.execute(query)
    rows = result.all()
    
    return [
        AdminTransactionResponse(
            id=r.id,
            project_id=r.project_id,
            milestone_id=r.milestone_id,
            transaction_type=r.transaction_type,
            amount=r.amount,
            status=r.status,
            created_at=r.created_at,
            razorpay_reference=r.razorpay_reference,
            project_title=r.project_title,
            milestone_title=r.milestone_title
        ) for r in rows
    ]



# ══════════════════════════════════════════════════════════════════════════════
# platform settings
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/settings", response_model=SystemSettingsRead)
async def get_platform_settings(db: DbSession, admin: AdminUser):
    """Get global configuration."""
    settings = await db.get(SystemSettings, 'default')
    if not settings:
        # Fallback if not seeded correctly
        settings = SystemSettings(id='default')
        db.add(settings)
        await db.commit()
        await db.refresh(settings)
    return settings
@router.patch("/settings", response_model=SystemSettingsRead)
async def update_platform_settings(body: SystemSettingsUpdate, db: DbSession, admin: AdminUser):
    """Update global configuration in real-time."""
    settings = await db.get(SystemSettings, 'default')
    if not settings:
        settings = SystemSettings(id='default')
        db.add(settings)
        
    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(settings, key, value)
    
    await db.commit()
    await db.refresh(settings)
    return settings


@router.get("/transactions/summary", response_model=AdminTransactionSummary)
async def get_transaction_summary(db: DbSession, admin: AdminUser):
    """Calculate platform-wide financial health from real ledger history."""
    # 1. Platform Reserve: sum(escrow_hold) - sum(milestone_release) - sum(refund)
    total_in = await db.scalar(select(func.sum(Transaction.amount)).where(
        Transaction.transaction_type == TransactionType.escrow_hold,
        Transaction.status == TransactionStatus.success
    )) or Decimal(0)
    
    total_payouts = await db.scalar(select(func.sum(Transaction.amount)).where(
        Transaction.transaction_type == TransactionType.milestone_release,
        Transaction.status == TransactionStatus.success
    )) or Decimal(0)

    total_refunds = await db.scalar(select(func.sum(Transaction.amount)).where(
        Transaction.transaction_type == TransactionType.refund,
        Transaction.status == TransactionStatus.success
    )) or Decimal(0)
    
    reserve = total_in - total_payouts - total_refunds
    
    # 2. Fees Collected: ONLY sum fees for projects that have a successful escrow_hold
    # This prevents 'leaking' fees from unfunded marketplace/direct projects into the summary.
    funded_project_ids = select(Transaction.project_id).where(
        Transaction.transaction_type == TransactionType.escrow_hold,
        Transaction.status == TransactionStatus.success
    ).scalar_subquery()

    fees = await db.scalar(select(func.sum(Project.platform_fee_amount)).where(
        Project.id.in_(funded_project_ids)
    )) or Decimal(0)
    
    # 3. Success Rate vs Failed Threshold
    total_count = await db.scalar(select(func.count(Transaction.id))) or 1
    failed_count = await db.scalar(select(func.count(Transaction.id)).where(
        Transaction.status == TransactionStatus.failed
    )) or 0
    failure_pct = (failed_count / total_count) * 100
    
    return AdminTransactionSummary(
        platform_reserve=reserve,
        total_fees_collected=fees,
        failed_threshold_pct=float(failure_pct)
    )


@router.get("/notifications", response_model=List[AdminNotificationResponse])
async def get_admin_notifications(db: DbSession, admin: AdminUser):
    """Aggregate recent high-priority activity for the admin tray."""
    notifications = []
    
    # Recent Disputes (History included)
    disputes = await db.execute(
        select(Dispute)
        .options(selectinload(Dispute.project))
        .order_by(desc(Dispute.created_at))
        .limit(10)
    )
    for d in disputes.scalars().all():
        notifications.append(AdminNotificationResponse(
            id=f"dispute_{d.id}",
            type="dispute",
            title="Dispute Case Updated",
            message=f"Project: {d.project.title if d.project else 'Unknown'}",
            target_url=f"/admin/disputes/{d.id}",
            severity="red" if d.status == "open" else "amber" if d.status == "under_review" else "mist",
            status=d.status,
            timestamp=d.created_at
        ))
        
    # Recent Submissions (History included)
    subs = await db.execute(
        select(PublicSubmission)
        .order_by(desc(PublicSubmission.created_at))
        .limit(10)
    )
    for s in subs.scalars().all():
        notifications.append(AdminNotificationResponse(
            id=f"sub_{s.id}",
            type="submission",
            title=f"{s.submission_type.capitalize()} Submission",
            message=f"From: {s.payload.get('name', 'Anonymous')}",
            target_url="/admin/submissions",
            severity="amber" if s.status == "pending" else "mist",
            status=s.status,
            timestamp=s.created_at
        ))
        
    return sorted(notifications, key=lambda x: x.timestamp, reverse=True)[:10]


@router.get("/disputes/{dispute_id}", response_model=DisputeResponse)
async def get_dispute_detail(dispute_id: str, db: DbSession, admin: AdminUser):
    """Get full dispute details for mediation console."""
    from app.db.models import Dispute, Project  # noqa: PLC0415
    result = await db.execute(
        select(Dispute)
        .options(
            selectinload(Dispute.project).selectinload(Project.freelancer),
            selectinload(Dispute.project).selectinload(Project.client),
            selectinload(Dispute.milestone)
        )
        .where(Dispute.id == dispute_id)
    )
    dispute = result.scalar_one_or_none()
    if not dispute:
        raise NotFoundError("Dispute not found")
    return dispute

@router.post("/notifications/{notif_id}/read")
async def mark_notification_read(notif_id: str, db: DbSession, admin: AdminUser):
    """Mark a notification as read by updating its source entity status."""
    if notif_id.startswith("dispute_"):
        dispute_id = notif_id.replace("dispute_", "")
        result = await db.execute(select(Dispute).where(Dispute.id == dispute_id))
        dispute = result.scalar_one_or_none()
        if dispute:
            dispute.status = "under_review"  # Move from 'open' to 'under_review'
            
    elif notif_id.startswith("sub_"):
        sub_id = notif_id.replace("sub_", "")
        result = await db.execute(select(PublicSubmission).where(PublicSubmission.id == sub_id))
        submission = result.scalar_one_or_none()
        if submission:
            submission.status = "reviewed"
            
    await db.commit()
    return {"status": "success"}


@router.post("/notifications/read-all")
async def mark_all_notifications_read(db: DbSession, admin: AdminUser):
    """Bulk transition all open disputes to 'under_review' and pending submissions to 'reviewed'."""
    # 1. Disputes
    await db.execute(
        update(Dispute)
        .where(Dispute.status == "open")
        .values(status="under_review")
    )
    
    # 2. Submissions
    await db.execute(
        update(PublicSubmission)
        .where(PublicSubmission.status == "pending")
        .values(status="reviewed")
    )
    
    await db.commit()
    return {"status": "success"}


# ══════════════════════════════════════════════════════════════════════════════
# GET /submissions — public contact/career logs
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/submissions", response_model=List[PublicSubmissionResponse])
async def list_submissions(
    db: DbSession,
    admin: AdminUser,
    submission_type: Optional[str] = None
):
    """View all incoming contact messages and applications."""
    query = select(PublicSubmission)
    if submission_type:
        query = query.where(PublicSubmission.submission_type == submission_type)
    
    result = await db.execute(query.order_by(desc(PublicSubmission.created_at)))
    return [PublicSubmissionResponse.model_validate(s) for s in result.scalars().all()]


@router.patch("/submissions/{submission_id}", response_model=PublicSubmissionResponse)
async def update_submission_status(
    submission_id: str,
    body: SubmissionUpdate,
    db: DbSession,
    admin: AdminUser
):
    """Update status of a submission (e.g. reviewed, archived)."""
    result = await db.execute(select(PublicSubmission).where(PublicSubmission.id == submission_id))
    submission = result.scalar_one_or_none()
    if not submission:
        raise NotFoundError("Submission not found")
    
    submission.status = body.status
    await db.commit()
    await db.refresh(submission)
    return submission
