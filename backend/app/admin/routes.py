from __future__ import annotations
"""
StayVise — Admin API Endpoints

Requires JWT authentication + admin role.
Provides dispute management, platform stats, and user support tools.
"""


import logging
from datetime import timezone, datetime, timedelta
from typing import Optional, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import DbSession, get_current_user
from app.db.models import (
    Milestone,
    MilestoneStatus,
    Project,
    ProjectStatus,
    TrustScore,
    User,
    UserRole,
)

logger = logging.getLogger("stayvise.admin")
router = APIRouter()


# ── Admin guard ────────────────────────────────────────────────────────────────


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Ensure the current user has admin role."""
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


# ── Schemas ────────────────────────────────────────────────────────────────────


class DisputeResponse(BaseModel):
    project_id: str
    project_title: str
    freelancer_name: str
    client_name: str
    total_amount: float
    disputed_at: Optional[str]
    milestone_title: Optional[str]


class DisputeResolution(BaseModel):
    decision: str = Field(
        ...,
        description="'refund_client' / 'release_freelancer' / 'split'",
        pattern=r"^(refund_client|release_freelancer|split)$",
    )
    notes: str = Field(default="", max_length=1000)


class PlatformStats(BaseModel):
    period: str
    new_users: int
    projects_created: int
    projects_completed: int
    volume_processed: float
    disputes_opened: int
    disputes_resolved: int
    active_users: int


class AdminUserDetail(BaseModel):
    id: str
    phone_number: str
    full_name: str
    email: Optional[str]
    role: str
    is_verified: bool
    is_active: bool
    onboarding_complete: bool
    created_at: str
    trust_score: Optional[float]
    total_projects: int
    completed_projects: int
    disputed_projects: int


# ── Endpoints ──────────────────────────────────────────────────────────────────


@router.get("/disputes", response_model=list[DisputeResponse])
async def list_open_disputes(
    db: DbSession,
    admin: User = Depends(require_admin),
) -> list[DisputeResponse]:
    """List all projects currently in disputed status."""
    result = await db.execute(
        select(Project)
        .options(
            selectinload(Project.freelancer),
            selectinload(Project.client),
            selectinload(Project.milestones),
        )
        .where(Project.status == ProjectStatus.disputed)
        .order_by(Project.updated_at.desc())
    )
    projects = result.scalars().all()

    disputes = []
    for p in projects:
        # Find the disputed milestone
        disputed_ms = next(
            (m for m in p.milestones if m.status == MilestoneStatus.disputed), None
        )
        disputes.append(
            DisputeResponse(
                project_id=p.id,
                project_title=p.title,
                freelancer_name=p.freelancer.full_name if p.freelancer else "Unknown",
                client_name=p.client.full_name if p.client else "Unknown",
                total_amount=float(p.total_amount),
                disputed_at=p.updated_at.isoformat() if p.updated_at else None,
                milestone_title=disputed_ms.title if disputed_ms else None,
            )
        )
    return disputes


@router.put("/disputes/{project_id}/resolve")
async def resolve_dispute(
    project_id: str,
    body: DisputeResolution,
    db: DbSession,
    admin: User = Depends(require_admin),
) -> dict[str, Any]:
    """
    Resolve a dispute with an admin decision.
    - refund_client: refund full amount to client
    - release_freelancer: release milestone funds to freelancer
    - split: (future) split proportionally
    """
    result = await db.execute(
        select(Project)
        .options(selectinload(Project.milestones))
        .where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()

    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.status != ProjectStatus.disputed:
        raise HTTPException(status_code=400, detail="Project is not in disputed state")

    # Find disputed milestone
    disputed_ms = next(
        (m for m in project.milestones if m.status == MilestoneStatus.disputed), None
    )

    if body.decision == "release_freelancer":
        if disputed_ms:
            disputed_ms.status = MilestoneStatus.released
            disputed_ms.released_at = datetime.now(timezone.utc)
        # Check if all milestones are released
        all_released = all(
            m.status == MilestoneStatus.released for m in project.milestones
        )
        project.status = ProjectStatus.completed if all_released else ProjectStatus.in_progress

    elif body.decision == "refund_client":
        if disputed_ms:
            disputed_ms.status = MilestoneStatus.pending
        project.status = ProjectStatus.cancelled

    elif body.decision == "split":
        # Placeholder — would need actual split logic
        raise HTTPException(status_code=501, detail="Split resolution not yet implemented")

    db.add(project)
    await db.commit()

    logger.info(
        "Dispute resolved: project=%s decision=%s by admin=%s notes=%s",
        project_id,
        body.decision,
        admin.id,
        body.notes,
    )

    return {
        "status": "resolved",
        "project_id": project_id,
        "decision": body.decision,
        "new_project_status": project.status.value,
    }


@router.get("/stats", response_model=PlatformStats)
async def platform_stats(
    days: int = 7,
    db: DbSession = None,  # type: ignore[assignment]
    admin: User = Depends(require_admin),
) -> PlatformStats:
    """Platform-wide statistics for the given period (default: last 7 days)."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    # New users
    new_users_r = await db.execute(
        select(func.count()).select_from(User).where(User.created_at >= cutoff)
    )
    new_users = new_users_r.scalar_one()

    # Projects created
    created_r = await db.execute(
        select(func.count())
        .select_from(Project)
        .where(Project.created_at >= cutoff)
    )
    projects_created = created_r.scalar_one()

    # Projects completed
    completed_r = await db.execute(
        select(func.count())
        .select_from(Project)
        .where(
            Project.status == ProjectStatus.completed,
            Project.updated_at >= cutoff,
        )
    )
    projects_completed = completed_r.scalar_one()

    # Volume processed (completed projects total amounts)
    volume_r = await db.execute(
        select(func.coalesce(func.sum(Project.total_amount), 0))
        .select_from(Project)
        .where(
            Project.status == ProjectStatus.completed,
            Project.updated_at >= cutoff,
        )
    )
    volume = float(volume_r.scalar_one())

    # Disputes opened
    disputes_r = await db.execute(
        select(func.count())
        .select_from(Project)
        .where(
            Project.status == ProjectStatus.disputed,
            Project.updated_at >= cutoff,
        )
    )
    disputes_opened = disputes_r.scalar_one()

    # Active users (any project activity recently)
    active_r = await db.execute(
        select(func.count(func.distinct(Project.freelancer_id)))
        .select_from(Project)
        .where(Project.updated_at >= cutoff)
    )
    active_users = active_r.scalar_one()

    return PlatformStats(
        period=f"last_{days}_days",
        new_users=new_users,
        projects_created=projects_created,
        projects_completed=projects_completed,
        volume_processed=volume,
        disputes_opened=disputes_opened,
        disputes_resolved=0,  # Would need a resolution log table
        active_users=active_users,
    )


@router.get("/users/{user_id}", response_model=AdminUserDetail)
async def admin_user_detail(
    user_id: str,
    db: DbSession,
    admin: User = Depends(require_admin),
) -> AdminUserDetail:
    """Full user detail for support / investigation."""
    result = await db.execute(
        select(User)
        .options(selectinload(User.trust_score))
        .where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    # Count projects
    proj_r = await db.execute(
        select(
            func.count().label("total"),
            func.count().filter(Project.status == ProjectStatus.completed).label("completed"),
            func.count().filter(Project.status == ProjectStatus.disputed).label("disputed"),
        )
        .select_from(Project)
        .where(
            (Project.freelancer_id == user_id) | (Project.client_id == user_id)
        )
    )
    proj_stats = proj_r.one()

    return AdminUserDetail(
        id=user.id,
        phone_number=user.phone_number,
        full_name=user.full_name,
        email=user.email,
        role=user.role.value,
        is_verified=user.is_verified,
        is_active=user.is_active,
        onboarding_complete=user.onboarding_complete,
        created_at=user.created_at.isoformat() if user.created_at else "",
        trust_score=float(user.trust_score.score) if user.trust_score else None,
        total_projects=proj_stats.total,
        completed_projects=proj_stats.completed,
        disputed_projects=proj_stats.disputed,
    )


# ── List all users ─────────────────────────────────────────────────────────


class AdminUserListItem(BaseModel):
    id: str
    phone_number: str
    full_name: str
    email: Optional[str]
    role: str
    is_active: bool
    is_verified: bool
    onboarding_complete: bool
    billing_plan: str
    created_at: str


@router.get("/users", response_model=list[AdminUserListItem])
async def list_all_users(
    db: DbSession,
    admin: User = Depends(require_admin),
    role: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
) -> list[AdminUserListItem]:
    """List all platform users with optional role filter."""
    query = select(User).order_by(User.created_at.desc())
    if role:
        query = query.where(User.role == UserRole(role))
    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    users = result.scalars().all()
    return [
        AdminUserListItem(
            id=u.id,
            phone_number=u.phone_number,
            full_name=u.full_name,
            email=u.email,
            role=u.role.value,
            is_active=u.is_active,
            is_verified=u.is_verified,
            onboarding_complete=u.onboarding_complete,
            billing_plan=u.billing_plan or "free",
            created_at=u.created_at.isoformat() if u.created_at else "",
        )
        for u in users
    ]


# ── Create user ────────────────────────────────────────────────────────────


class AdminCreateUser(BaseModel):
    phone_number: str
    full_name: str
    role: str = "freelancer"
    email: Optional[str] = None


@router.post("/users", response_model=AdminUserDetail, status_code=201)
async def admin_create_user(
    body: AdminCreateUser,
    db: DbSession,
    admin: User = Depends(require_admin),
) -> AdminUserDetail:
    """Create a new user from the admin panel."""
    existing = await db.execute(
        select(User).where(User.phone_number == body.phone_number)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Phone number already registered")

    user = User(
        phone_number=body.phone_number,
        full_name=body.full_name,
        role=UserRole(body.role),
        email=body.email,
        onboarding_complete=True,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    logger.info("Admin %s created user %s (%s)", admin.id, user.id, body.phone_number)

    return AdminUserDetail(
        id=user.id,
        phone_number=user.phone_number,
        full_name=user.full_name,
        email=user.email,
        role=user.role.value,
        is_verified=False,
        is_active=True,
        onboarding_complete=True,
        created_at=user.created_at.isoformat() if user.created_at else "",
        trust_score=None,
        total_projects=0,
        completed_projects=0,
        disputed_projects=0,
    )


# ── Edit user ──────────────────────────────────────────────────────────────


class AdminUpdateUser(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    is_verified: Optional[bool] = None
    billing_plan: Optional[str] = None


@router.put("/users/{user_id}")
async def admin_update_user(
    user_id: str,
    body: AdminUpdateUser,
    db: DbSession,
    admin: User = Depends(require_admin),
) -> dict[str, Any]:
    """Edit any user's fields from the admin panel."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = body.model_dump(exclude_unset=True)
    if "role" in update_data:
        update_data["role"] = UserRole(update_data["role"])

    for field, value in update_data.items():
        setattr(user, field, value)

    await db.commit()
    logger.info("Admin %s updated user %s: %s", admin.id, user_id, list(update_data.keys()))
    return {"status": "updated", "user_id": user_id}


# ── Delete (soft) user ─────────────────────────────────────────────────────


@router.delete("/users/{user_id}")
async def admin_delete_user(
    user_id: str,
    db: DbSession,
    admin: User = Depends(require_admin),
) -> dict[str, Any]:
    """Soft-delete a user (set is_active=False)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_active = False
    await db.commit()
    logger.info("Admin %s soft-deleted user %s", admin.id, user_id)
    return {"status": "deleted", "user_id": user_id}


# ── Admin transactions ────────────────────────────────────────────────────


class AdminTransactionItem(BaseModel):
    id: str
    project_title: str
    amount: float
    transaction_type: str
    status: str
    created_at: str
    razorpay_reference: Optional[str]


@router.get("/transactions", response_model=list[AdminTransactionItem])
async def admin_list_transactions(
    db: DbSession,
    admin: User = Depends(require_admin),
    skip: int = 0,
    limit: int = 50,
) -> list[AdminTransactionItem]:
    """List all platform transactions for admin oversight."""
    from app.db.models import Transaction  # noqa: PLC0415
    from sqlalchemy.orm import joinedload  # noqa: PLC0415

    result = await db.execute(
        select(Transaction)
        .options(joinedload(Transaction.project))
        .order_by(Transaction.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    txs = result.scalars().all()
    return [
        AdminTransactionItem(
            id=str(tx.id),
            project_title=tx.project.title if tx.project else "Unknown",
            amount=float(tx.amount),
            transaction_type=tx.transaction_type.value,
            status=tx.status.value,
            created_at=tx.created_at.isoformat() if tx.created_at else "",
            razorpay_reference=tx.razorpay_reference,
        )
        for tx in txs
    ]

