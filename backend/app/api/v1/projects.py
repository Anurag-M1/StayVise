from typing import Optional
"""
StayVise — Projects & Milestones API.

Core business logic: escrow project lifecycle.

Endpoints
---------
  POST   /projects                                      — create project
  GET    /projects                                      — list projects
  GET    /projects/{project_id}                         — project detail
  PUT    /projects/{project_id}                         — update (draft only)
  POST   /projects/{project_id}/milestones/{mid}/submit — submit milestone
  POST   /projects/{project_id}/milestones/{mid}/approve— approve milestone
  POST   /projects/{project_id}/dispute                 — raise dispute
"""


import logging
import datetime
from datetime import timezone, timedelta
from decimal import ROUND_HALF_UP, Decimal

from fastapi import APIRouter, BackgroundTasks, Query, Request
import sqlalchemy as sa
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.deps import CurrentUser, DbSession, ProjectWithAccess
from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.core.audit_log import log_audit_event
from app.db.crud.notification import notification as notification_crud
from app.db.models import (
    Dispute,
    DisputeStatus,
    Milestone,
    MilestoneStatus,
    NotificationChannel,
    NotificationType,
    Project,
    ProjectStatus,
    Transaction,
    TransactionStatus,
    TransactionType,
    User,
    UserRole,
)
from app.services.payment import payment_service
from app.tasks.trust_tasks import recalculate_user_trust_score
from app.schemas.project import (
    DisputeCreate,
    DisputeResponse,
    MilestoneResponse,
    ProjectCreate,
    ProjectListItem,
    ProjectListResponse,
    ProjectResponse,
    ProjectUpdate,
    ProposalCreate,
    ProposalResponse,
)
from app.db.models import Proposal
from app.services.messaging import messenger_service

logger = logging.getLogger("stayvise.projects")

router = APIRouter()


# ══════════════════════════════════════════════════════════════════════════════
# POST /projects — create new project
# ══════════════════════════════════════════════════════════════════════════════


@router.post(
    "",
    response_model=ProjectResponse,
    status_code=201,
    summary="Create a new escrow project",
)
async def create_project(
    body: ProjectCreate,
    user: CurrentUser,
    db: DbSession,
    request: Request,
    background_tasks: BackgroundTasks,
) -> ProjectResponse:
    """
    Create a project with milestones.

    - Only users with role=freelancer can create projects.
    - Platform fee is auto-calculated from settings.ESCROW_FEE_PERCENT.
    - The client is looked up (or created) by phone number.
    - All milestones are created atomically.
    """
    # ── Auth check: freelancer or client ───────────────────────────────────────
    if user.role not in (UserRole.freelancer, UserRole.client, UserRole.admin):
        raise ForbiddenError("Only registered freelancers or clients can create projects.")

    # ── Plan-based project limit ───────────────────────────────────────────────
    normalized_plan = "premium" if user.billing_plan in ("premium", "pro") else "free"
    if normalized_plan != "premium":
        max_projects = 1
        active_count_result = await db.execute(
            select(func.count(Project.id)).where(
                (
                    (Project.freelancer_id == user.id) | (Project.client_id == user.id)
                ),
                Project.status.in_([
                    ProjectStatus.draft,
                    ProjectStatus.open,
                    ProjectStatus.awaiting_payment,
                    ProjectStatus.in_progress,
                ]),
            )
        )
        active_count = active_count_result.scalar() or 0
        if active_count >= max_projects:
            raise ValidationError(
                f"Your Basic plan allows {max_projects} active project(s). "
                f"You currently have {active_count}. Upgrade to Pro for unlimited projects."
            )

    # ── Prevent self-assignment ────────────────────────────────────────────────
    if body.client_phone == user.phone_number:
        raise ValidationError("You cannot create a project with yourself as the client.")

    # ── Calculate amounts (Paise Integer Arithmetic) ───────────────────────────
    total_amount = body.total_amount   # Already in paise from schema
    # platform_fee = ceil(total_amount * % / 100)
    import math
    platform_fee = math.ceil(total_amount * settings.ESCROW_FEE_PERCENT / 100)
    freelancer_payout = total_amount - platform_fee

    # ── Validate milestone amounts ─────────────────────────────────────────────
    milestone_sum = sum(m.amount for m in body.milestones)
    if milestone_sum != total_amount:
        raise ValidationError(
            f"Sum of milestone amounts (₹{milestone_sum/100:,.2f}) does not equal "
            f"total project amount (₹{total_amount/100:,.2f})."
        )

    # ── Validate amount limits ─────────────────────────────────────────────────
    for m in body.milestones:
        if m.amount < settings.MIN_MILESTONE_AMOUNT_INR * 100:
            raise ValidationError(
                f"Milestone '{m.title}' amount is below minimum."
            )
        if m.amount > settings.MAX_MILESTONE_AMOUNT_INR * 100:
            raise ValidationError(
                f"Milestone '{m.title}' amount exceeds maximum."
            )

    # ── Assign IDs based on who is creating ────────────────────────────────────
    is_public = body.is_public or body.client_phone is None
    status = ProjectStatus.open if is_public else ProjectStatus.awaiting_payment

    if not is_public:
        from app.db.crud.user import user as user_crud
        from app.schemas.user import UserCreate
        partner = await user_crud.get_by_phone(db, phone=body.client_phone)
        if partner is None:
            partner = await user_crud.create(
                db,
                obj_in=UserCreate(
                    phone_number=body.client_phone,
                    full_name="New Client",
                    role=UserRole.client if user.role == UserRole.freelancer else UserRole.freelancer,
                ),
            )

        if user.role == UserRole.freelancer:
            freelancer_id = user.id
            client_id = partner.id
        else:
            client_id = user.id
            freelancer_id = partner.id
    else:
        # Marketplace flow: Client is the user, freelancer is TBD
        if user.role != UserRole.client:
             raise ForbiddenError("Only clients can post public marketplace projects.")
        client_id = user.id
        freelancer_id = None

    # ── Create project ─────────────────────────────────────────────────────────
    project = Project(
        title=body.title,
        description=body.description,
        freelancer_id=freelancer_id,
        client_id=client_id,
        status=status,
        is_public=is_public,
        total_amount=total_amount,
        platform_fee_amount=platform_fee,
        freelancer_payout_amount=freelancer_payout,
        currency="INR",
        deadline=body.deadline,
    )
    db.add(project)
    await db.flush()
    await db.refresh(project)

    # ── Create milestones ──────────────────────────────────────────────────────
    milestones = []
    for m in body.milestones:
        milestone = Milestone(
            title=m.title,
            description=m.description,
            amount=m.amount,
            sequence_number=m.sequence_number,
            status=MilestoneStatus.pending,
        )
        project.milestones.append(milestone)
        milestones.append(milestone)

    await db.flush()
    for ms in milestones:
        await db.refresh(ms)

    await log_audit_event(
        db, "project_created", user_id=user.id,
        resource_type="project", resource_id=project.id,
        request=request,
        metadata={"total_amount": total_amount, "is_public": is_public}
    )

    logger.info(
        "Project created: %s (₹%d paise, %d milestones) by %s",
        project.id, total_amount, len(milestones), user.id,
    )

    # ── Notifications ──────────────────────────────────────────────────────────
    if not is_public:
        background_tasks.add_task(
            messenger_service.send_project_invite,
            phone=body.client_phone,
            freelancer_name=user.full_name if user.role == UserRole.freelancer else "Your Freelancer",
            project_title=project.title,
            total_amount=f"₹{total_amount:,}",
            payment_link=f"{settings.FRONTEND_URL}/projects/{project.id}",
        )
        await notification_crud.create_for_user(
            db,
            user_id=client_id,
            notif_type=NotificationType.project_created,
            channel=NotificationChannel.push,
            payload={
                "title": "New project invited",
                "description": f"{project.title} is ready for review and funding.",
                "path": f"/projects/{project.id}",
            },
        )

    await notification_crud.create_for_user(
        db,
        user_id=user.id,
        notif_type=NotificationType.project_created,
        channel=NotificationChannel.push,
        payload={
            "title": "Project created",
            "description": f"{project.title} is now live in your workspace.",
            "path": f"/projects/{project.id}",
        },
    )

    # ── Build response ─────────────────────────────────────────────────────────
    created_project = await _get_project_or_404(db, str(project.id))
    return _serialize_project(created_project)


# ══════════════════════════════════════════════════════════════════════════════
# GET /projects — list user's projects
# ══════════════════════════════════════════════════════════════════════════════


@router.get(
    "",
    response_model=ProjectListResponse,
    summary="List my projects",
)
async def list_projects(
    user: CurrentUser,
    db: DbSession,
    status: Optional[str] = Query(None, description="Filter by status or comma-separated statuses"),
    role: Optional[str] = Query(None, description="Filter by role: freelancer or client"),
    cursor: Optional[datetime.datetime] = Query(None, description="Keyset cursor"),
    page: Optional[int] = Query(None, ge=1),
    limit: int = Query(20, ge=1, le=100),
) -> ProjectListResponse:
    """
    Return a paginated list of the authenticated user's projects.

    Filter by role (freelancer/client) and/or status.
    Supports both offset-based (page) and keyset-based (cursor) pagination.
    """
    from app.db.crud.project import project as project_crud  # noqa: PLC0415

    skip = (page - 1) * limit if page else None
    statuses = _parse_status_filters(status)
    projects, total = await project_crud.get_projects_for_user(
        db,
        user_id=user.id,
        role=role,
        statuses=statuses,
        cursor=cursor,
        skip=skip,
        limit=limit,
    )

    next_cursor = projects[-1].created_at if projects else None

    return ProjectListResponse(
        items=[ProjectListItem.model_validate(p) for p in projects],
        total=total,
        page=page,
        limit=limit,
        next_cursor=next_cursor,
    )


# ══════════════════════════════════════════════════════════════════════════════
# GET /projects/{project_id} — project detail
# ══════════════════════════════════════════════════════════════════════════════


@router.get(
    "/{project_id}",
    response_model=ProjectResponse,
    summary="Get project detail with ownership verify",
)
async def get_project(
    project: ProjectWithAccess,
) -> ProjectResponse:
    """
    Full project detail with milestones and ownership access.
    """
    return ProjectResponse.model_validate(project)


# ══════════════════════════════════════════════════════════════════════════════
# PUT /projects/{project_id} — update (draft only)
# ══════════════════════════════════════════════════════════════════════════════


@router.put(
    "/{project_id}",
    response_model=ProjectResponse,
    summary="Update project (draft only)",
)
async def update_project(
    proj: ProjectWithAccess,
    body: ProjectUpdate,
    user: CurrentUser,
    db: DbSession,
) -> ProjectResponse:
    """
    Update title/description/deadline of a project.

    Only the freelancer can update, and only when status=draft.
    """
    from app.db.crud.project import project as project_crud  # noqa: PLC0415

    proj = await project_crud.get_with_milestones(db, project_id=project_id)
    if proj is None:
        raise NotFoundError("Project", project_id)

    if proj.freelancer_id != user.id:
        raise ForbiddenError("Only the freelancer can update this project.")

    if proj.status != ProjectStatus.draft:
        raise ValidationError(
            f"Project can only be updated in draft status. Current status: {proj.status.value}."
        )

    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise ValidationError("No fields provided to update.")

    for field, value in update_data.items():
        setattr(proj, field, value)

    db.add(proj)
    await db.commit()
    await db.refresh(proj)

    refreshed_project = await _get_project_or_404(db, project_id)
    return _serialize_project(refreshed_project)


# ══════════════════════════════════════════════════════════════════════════════
# POST /projects/{project_id}/milestones/{milestone_id}/submit
# ══════════════════════════════════════════════════════════════════════════════


@router.post(
    "/{project_id}/milestones/{milestone_id}/submit",
    response_model=MilestoneResponse,
    summary="Submit a milestone for approval",
)
async def submit_milestone(
    proj: ProjectWithAccess,
    milestone_id: str,
    user: CurrentUser,
    db: DbSession,
    request: Request,
    background_tasks: BackgroundTasks,
) -> MilestoneResponse:
    """
    Freelancer marks a milestone as submitted.

    Validates:
    - Project status must be in_progress.
    - Milestone status must be pending.
    - Caller must be the freelancer.

    Side effects:
    - Sets submitted_at = now()
    - Sets project.auto_release_at = now() + AUTO_RELEASE_DAYS
    # - Sending WhatsApp approval request to client
    # - Scheduling Celery auto-release task
    """
    from app.core.validators import validate_uuid_str
    validate_uuid_str(milestone_id)

    proj = await _get_project_or_404(db, project_id)

    # ── Auth ───────────────────────────────────────────────────────────────────
    if proj.freelancer_id != user.id:
        raise ForbiddenError("Only the freelancer can submit milestones.")

    # ── Project state ──────────────────────────────────────────────────────────
    if proj.status != ProjectStatus.in_progress:
        raise ValidationError(
            f"Cannot submit milestone: project status is '{proj.status.value}', "
            f"expected 'in_progress'."
        )

    # ── Free Plan Restriction: One active project at a time ────────────────────
    normalized_plan = "premium" if user.billing_plan in ("premium", "pro") else "free"
    if normalized_plan != "premium":
        # Check if there's any OTHER project where this freelancer has submitted/approved milestones
        from sqlalchemy import exists
        stmt = (
            select(Project.id)
            .join(Milestone)
            .where(
                Project.freelancer_id == user.id,
                Project.id != project_id,
                Project.status == ProjectStatus.in_progress,
                Milestone.status.in_([MilestoneStatus.submitted, MilestoneStatus.approved, MilestoneStatus.disputed])
            )
            .limit(1)
        )
        other_active = await db.execute(stmt)
        if other_active.scalar_one_or_none():
            raise ValidationError(
                "Your Basic plan allows only 1 active project with pending payouts. "
                "Please finish your current active project or upgrade to Pro to handle multiple clients simultaneously."
            )

    # ── Find milestone ─────────────────────────────────────────────────────────
    ms = await _get_milestone_or_404(db, milestone_id, project_id)

    if ms.status != MilestoneStatus.pending:
        raise ValidationError(
            f"Cannot submit milestone: status is '{ms.status.value}', expected 'pending'."
        )

    # ── Transition ─────────────────────────────────────────────────────────────
    now = datetime.datetime.now(timezone.utc)
    ms.status = MilestoneStatus.submitted
    ms.submitted_at = now
    db.add(ms)

    await log_audit_event(
        db, "milestone_submitted", user_id=user.id,
        resource_type="milestone", resource_id=ms.id,
        request=request,
        metadata={"project_id": proj.id}
    )

    # Set auto-release window on the project
    proj.auto_release_at = None
    db.add(proj)

    await db.flush()
    await db.refresh(ms)

    logger.info(
        "Milestone %s submitted for project %s (auto-release at %s)",
        milestone_id, project_id, proj.auto_release_at,
    )

    # ── Notifications ──────────────────────────────────────────────────────────
    background_tasks.add_task(
        messenger_service.send_milestone_submitted,
        phone=proj.client.phone_number,
        freelancer_name=proj.freelancer.full_name,
        milestone_title=ms.title,
        project_title=proj.title,
        milestone_id=str(ms.id),
    )
    await notification_crud.create_for_user(
        db,
        user_id=proj.client_id,
        notif_type=NotificationType.milestone_submitted,
        channel=NotificationChannel.push,
        payload={
            "title": "Milestone submitted",
            "description": f"{ms.title} is ready for your review in {proj.title}.",
            "path": f"/projects/{proj.id}",
        },
    )

    return MilestoneResponse.model_validate(ms)


# ══════════════════════════════════════════════════════════════════════════════
# POST /projects/{project_id}/milestones/{milestone_id}/approve
# ══════════════════════════════════════════════════════════════════════════════


@router.post(
    "/{project_id}/milestones/{milestone_id}/approve",
    response_model=MilestoneResponse,
    summary="Approve a submitted milestone",
)
async def approve_milestone(
    proj: ProjectWithAccess,
    milestone_id: str,
    user: CurrentUser,
    db: DbSession,
    request: Request,
    background_tasks: BackgroundTasks,
) -> MilestoneResponse:
    """
    Client approves a submitted milestone.

    Validates:
    - Caller is the client.
    - Milestone status is submitted.

    Side effects:
    - Sets status=approved, approved_at=now()
    - Clears project.auto_release_at
    # - Calling escrow_service.release_milestone_payment()
    # - Triggering trust score recalculation
    # - Sending WhatsApp confirmation to both parties
    """
    from app.core.validators import validate_uuid_str
    validate_uuid_str(milestone_id)

    proj = await _get_project_or_404(db, project_id)

    # ── Auth ───────────────────────────────────────────────────────────────────
    if proj.client_id != user.id:
        raise ForbiddenError("Only the client can approve milestones.")

    # ── Find milestone ─────────────────────────────────────────────────────────
    ms = await _get_milestone_or_404(db, milestone_id, project_id)

    if ms.status != MilestoneStatus.submitted:
        raise ValidationError(
            f"Cannot approve milestone: status is '{ms.status.value}', expected 'submitted'."
        )

    # ── Transition ─────────────────────────────────────────────────────────────
    now = datetime.datetime.now(timezone.utc)
    ms.status = MilestoneStatus.approved
    ms.approved_at = now
    db.add(ms)

    await log_audit_event(
        db, "milestone_approved", user_id=user.id,
        resource_type="milestone", resource_id=ms.id,
        request=request,
        metadata={"project_id": proj.id}
    )

    # Clear auto-release since client took action
    proj.auto_release_at = None
    db.add(proj)

    await db.flush()
    await db.refresh(ms)
    await db.refresh(proj)

    # Check if ALL milestones are now approved/released → complete the project
    result = await db.execute(
        sa.select(sa.func.count(Milestone.id)).where(
            Milestone.project_id == project_id,
            Milestone.status.notin_([MilestoneStatus.approved, MilestoneStatus.released]),
        )
    )
    pending_count = result.scalar_one()
    all_approved = (pending_count == 0)
    if all_approved:
        proj.status = ProjectStatus.completed
        db.add(proj)
        await db.flush()
        logger.info("Project %s completed — all milestones approved", project_id)

    logger.info("Milestone %s approved for project %s", milestone_id, project_id)

    # ── Financials & Stats ─────────────────────────────────────────────────────
    # Release payment via RazorpayX (and record Transaction history)
    await payment_service.release_milestone_payment(milestone_id, db)

    # Trigger trust score recalculation for both parties
    if proj.freelancer_id:
        recalculate_user_trust_score.delay(proj.freelancer_id)
    recalculate_user_trust_score.delay(proj.client_id)

    # ── Notifications ──────────────────────────────────────────────────────────
    background_tasks.add_task(
        messenger_service.send_payment_released,
        phone=proj.freelancer.phone_number,
        milestone_title=ms.title,
        amount=f"₹{ms.amount:,}",
        utr_number="ESCROW-RELEASE-PAYOUT",  # Mock UTR
    )

    await db.commit()
    await db.refresh(ms)
    return MilestoneResponse.model_validate(ms)


# ══════════════════════════════════════════════════════════════════════════════
# POST /projects/{project_id}/dispute — raise dispute
# ══════════════════════════════════════════════════════════════════════════════


@router.post(
    "/{project_id}/dispute",
    response_model=DisputeResponse,
    status_code=201,
    summary="Raise a dispute",
)
async def raise_dispute(
    proj: ProjectWithAccess,
    body: DisputeCreate,
    user: CurrentUser,
    db: DbSession,
    background_tasks: BackgroundTasks,
) -> DisputeResponse:
    """
    Either party can raise a dispute on a project.

    Side effects:
    - Sets project status to 'disputed'
    - Creates a Dispute record
    # - Notifying admin via WhatsApp / email
    """
    # ── Auth: must be freelancer or client ─────────────────────────────────────
    # ProjectWithAccess already verified the user is involved in the project.

    # ── Validate project status ────────────────────────────────────────────────
    from app.core.validators import validate_project_transition
    validate_project_transition(proj.status.value, ProjectStatus.disputed.value)

    if not proj.freelancer_id or proj.status in (ProjectStatus.draft, ProjectStatus.open):
        raise ValidationError(
            "Disputes can only be raised for active projects with an assigned freelancer and escrow funds."
        )

    # ── Validate milestone if provided ─────────────────────────────────────────
    ms = None
    if body.milestone_id:
        ms = await _get_milestone_or_404(db, body.milestone_id, project_id)

    # ── Create dispute ─────────────────────────────────────────────────────────
    dispute = Dispute(
        project=proj,
        milestone=ms,
        milestone_id=body.milestone_id,
        raised_by_id=user.id,
        status=DisputeStatus.open,
        reason=body.reason,
        evidence_urls=body.evidence_urls,
    )
    db.add(dispute)

    # ── Update project status ──────────────────────────────────────────────────
    proj.status = ProjectStatus.disputed
    db.add(proj)

    await db.flush()
    # No refresh(dispute) here to avoid expiring the project/milestone relationships
    # which are needed for Response schema validation.

    logger.info(
        "Dispute %s raised on project %s by %s",
        dispute.id, project_id, user.id,
    )

    # ── Notifications ──────────────────────────────────────────────────────────
    # Determine the other party for direct WhatsApp alert
    partner_phone = None
    if user.id == proj.freelancer_id:
        partner_phone = proj.client.phone_number
    elif user.id == proj.client_id:
        # proj.freelancer is guaranteed to exist due to validation above
        partner_phone = proj.freelancer.phone_number if proj.freelancer else None

    if partner_phone:
        background_tasks.add_task(
            messenger_service.send_text_message,
            phone=partner_phone,
            text=f"⚠️ A dispute has been raised for project '{proj.title}' by {user.full_name}. Checkout the dashboard for details.",
        )

    # Dashboard notifications
    for recipient_id in {proj.client_id, proj.freelancer_id}:
        if not recipient_id:
            continue
            
        await notification_crud.create_for_user(
            db,
            user_id=recipient_id,
            notif_type=NotificationType.dispute_opened,
            channel=NotificationChannel.push,
            payload={
                "title": "Dispute raised",
                "description": f"{proj.title} now has an open dispute requiring review.",
                "path": f"/disputes/{dispute.id}",
            },
        )

    # ── Final Fetch for Response ───────────────────────────────────────────────
    # We reload with all relationships to ensure Pydantic can serialize safely 
    # without triggering lazy-loading (MissingGreenlet) errors.
    from sqlalchemy.orm import selectinload
    stmt = (
        select(Dispute)
        .options(
            selectinload(Dispute.project).selectinload(Project.client),
            selectinload(Dispute.project).selectinload(Project.freelancer),
            selectinload(Dispute.milestone),
        )
        .where(Dispute.id == dispute.id)
    )
    result = await db.execute(stmt)
    dispute = result.scalar_one()

    return DisputeResponse.model_validate(dispute)


# ══════════════════════════════════════════════════════════════════════════════
# Marketplace Endpoints
# ══════════════════════════════════════════════════════════════════════════════


@router.get(
    "/marketplace/explore",
    response_model=ProjectListResponse,
    summary="List available projects in marketplace",
)
async def explore_marketplace(
    user: CurrentUser,
    db: DbSession,
    q: Optional[str] = Query(None, min_length=2, description="Search keyword"),
    cursor: Optional[datetime.datetime] = Query(None, description="Keyset cursor"),
    page: Optional[int] = Query(None, ge=1),
    limit: int = Query(20, ge=1, le=100),
) -> ProjectListResponse:
    """
    Freelancers browse open projects.
    Supports both offset-based (page) and keyset-based (cursor) pagination.
    """
    skip = (page - 1) * limit if page else None
    stmt = (
        select(Project)
        .options(selectinload(Project.client))
        .where(Project.status == ProjectStatus.open)
    )
    if q:
        stmt = stmt.where(
            sa.or_(
                Project.title.icontains(q),
                Project.description.icontains(q)
            )
        )
    
    if cursor:
        stmt = stmt.where(Project.created_at < cursor)
        
    stmt = stmt.order_by(Project.created_at.desc())
    
    if skip is not None:
        stmt = stmt.offset(skip)
        
    stmt = stmt.limit(limit)
    
    result = await db.execute(stmt)
    projects = result.scalars().all()
    
    # Simple count for pagination
    from sqlalchemy import func
    count_stmt = select(func.count(Project.id)).where(Project.status == ProjectStatus.open)
    if q:
        count_stmt = count_stmt.where(
            sa.or_(
                Project.title.icontains(q),
                Project.description.icontains(q)
            )
        )
    count_result = await db.execute(count_stmt)
    total = count_result.scalar() or 0

    next_cursor = projects[-1].created_at if projects else None

    return ProjectListResponse(
        items=[ProjectListItem.model_validate(p) for p in projects],
        total=total,
        page=page,
        limit=limit,
        next_cursor=next_cursor,
    )


@router.post(
    "/{project_id}/apply",
    response_model=ProposalResponse,
    status_code=201,
    summary="Apply to a marketplace project",
)
async def apply_to_project(
    project_id: str,
    body: ProposalCreate,
    user: CurrentUser,
    db: DbSession,
    background_tasks: BackgroundTasks,
) -> ProposalResponse:
    """
    Freelancer submits a bid/proposal to an open project.
    """
    if user.role != UserRole.freelancer:
        raise ForbiddenError("Only freelancers can apply for projects.")

    proj = await _get_project_or_404(db, project_id)
    if proj.status != ProjectStatus.open:
        raise ValidationError("This project is no longer accepting applications.")

    # Check for existing proposal
    existing = await db.execute(
        select(Proposal).where(Proposal.project_id == project_id, Proposal.freelancer_id == user.id)
    )
    if existing.scalar_one_or_none():
        raise ValidationError("You have already applied for this project.")

    proposal = Proposal(
        project_id=project_id,
        freelancer_id=user.id,
        amount=body.amount,
        cover_letter=body.cover_letter,
        status="pending"
    )
    db.add(proposal)
    await db.flush()
    await db.refresh(proposal)
    
    # Notify client about new proposal
    background_tasks.add_task(
        messenger_service.send_new_proposal_notification,
        phone=proj.client.phone_number,
        freelancer_name=user.full_name,
        project_title=proj.title,
        bid_amount=f"₹{proposal.amount:,}",
        project_link=f"{settings.FRONTEND_URL}/projects/{proj.id}",
    )
    
    return ProposalResponse.model_validate(proposal)


@router.post(
    "/proposals/{proposal_id}/accept",
    response_model=ProjectResponse,
    summary="Select a freelancer and start escrow",
)
async def accept_proposal(
    proposal_id: str,
    user: CurrentUser,
    db: DbSession,
    background_tasks: BackgroundTasks,
) -> ProjectResponse:
    """
    Client accepts a proposal, assigning the freelancer to the project.
    """
    result = await db.execute(
        select(Proposal)
        .options(selectinload(Proposal.project))
        .where(Proposal.id == proposal_id)
    )
    proposal = result.scalar_one_or_none()
    if not proposal:
        raise NotFoundError("Proposal", proposal_id)
    
    project = proposal.project
    if project.client_id != user.id:
        raise ForbiddenError("Only the project client can accept proposals.")
    
    if project.status != ProjectStatus.open:
        raise ValidationError("Project is already assigned or closed.")

    # Assign freelancer and move to awaiting payment
    project.freelancer_id = proposal.freelancer_id
    project.status = ProjectStatus.awaiting_payment
    project.total_amount = proposal.amount # Update project budget to match bid if desired
    
    # Recalculate fees (simplified for now)
    platform_fee = (project.total_amount * Decimal(str(settings.ESCROW_FEE_PERCENT)) / Decimal("100")).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    project.platform_fee_amount = platform_fee
    project.freelancer_payout_amount = project.total_amount - platform_fee
    
    proposal.status = "accepted"
    
    # Reject other proposals
    await db.execute(
        sa.update(Proposal)
        .where(Proposal.project_id == project.id, Proposal.id != proposal_id)
        .values(status="rejected")
    )
    
    db.add(project)
    db.add(proposal)
    await db.flush()
    await db.refresh(project)
    await db.refresh(proposal)
    
    # Notify freelancer about acceptance
    background_tasks.add_task(
        messenger_service.send_proposal_accepted_notification,
        phone=proposal.freelancer.phone_number,
        client_name=user.full_name,
        project_title=project.title,
        payout_amount=f"₹{project.freelancer_payout_amount:,}",
        project_link=f"{settings.FRONTEND_URL}/projects/{project.id}",
    )
    
    return _serialize_project(project)


# ══════════════════════════════════════════════════════════════════════════════
# POST /projects/{project_id}/leave
# ══════════════════════════════════════════════════════════════════════════════


@router.post(
    "/{project_id}/leave",
    response_model=ProjectResponse,
    summary="Leave or cancel a project",
)
async def leave_project(
    project_id: str,
    user: CurrentUser,
    db: DbSession,
    request: Request,
    background_tasks: BackgroundTasks,
) -> ProjectResponse:
    """
    Allow a participant to leave or cancel a project.

    Logic:
    - Draft/Open/Awaiting Payment: Cancel project immediately.
    - In Progress: Trigger a dispute (abandonment) for admin review.
    - Completed/Cancelled: No-op.
    """
    project = await _get_project_or_404(db, project_id)

    if user.id not in (project.client_id, project.freelancer_id) and user.role != UserRole.admin:
        raise ForbiddenError("You are not a participant in this project.")

    if project.status in (ProjectStatus.completed, ProjectStatus.cancelled):
        return _serialize_project(project)

    old_status = project.status
    reason = f"User {user.full_name} ({user.role}) requested to leave project."

    if project.status in (ProjectStatus.draft, ProjectStatus.open, ProjectStatus.awaiting_payment):
        project.status = ProjectStatus.cancelled
        logger.info("Project %s cancelled by %s", project_id, user.id)
    elif project.status == ProjectStatus.in_progress:
        # For in-progress projects, we cannot just cancel if money is in escrow.
        # We move it to disputed so admin can handle the refund/payout.
        project.status = ProjectStatus.disputed
        
        # Create a dispute record automatically
        dispute = Dispute(
            project_id=project.id,
            raised_by_id=user.id,
            reason="Project Abandonment / Cancellation Request",
            details=f"{user.full_name} has requested to leave the project. System auto-escalated to protect escrow funds.",
            status=DisputeStatus.open,
            severity="amber"
        )
        db.add(dispute)
        logger.info("Project %s moved to dispute due to abandonment by %s", project_id, user.id)
    
    await log_audit_event(
        db,
        "project_leave",
        user_id=user.id,
        project_id=project.id,
        request=request,
        metadata={"old_status": old_status, "new_status": project.status}
    )

    db.add(project)
    await db.commit()
    await db.refresh(project)

    # Notify counterparty
    counterparty_id = project.client_id if user.id == project.freelancer_id else project.freelancer_id
    if counterparty_id:
        # Add background task for notification if service exists
        pass

    return _serialize_project(project)
# ══════════════════════════════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════════════════════════════


async def _get_project_or_404(db: DbSession, project_id: str) -> Project:
    """Helper to fetch a project with all relationships or raise 404."""
    from app.db.crud.project import project as project_crud  # noqa: PLC0415
    proj = await project_crud.get_with_milestones(db, project_id=project_id)
    if proj is None:
        raise NotFoundError("Project", project_id)
    return proj


async def _get_milestone_or_404(
    db: DbSession, milestone_id: str, project_id: str
) -> Milestone:
    """Fetch a specific milestone and verify it belongs to the project."""
    result = await db.execute(
        select(Milestone).where(
            Milestone.id == milestone_id,
            Milestone.project_id == project_id
        )
    )
    ms = result.scalar_one_or_none()
    if not ms:
        raise NotFoundError("Milestone", milestone_id)
    return ms


def _serialize_project(project: Project) -> ProjectResponse:
    """Consistently validate/serialize a Project model to its response schema."""
    return ProjectResponse.model_validate(project)


def _parse_status_filters(status_str: Optional[str]) -> Optional[list[ProjectStatus]]:
    """Helpful parser for comma-separated status strings."""
    if not status_str:
        return None
    try:
        return [ProjectStatus(s.strip()) for s in status_str.split(",")]
    except ValueError as e:
        raise ValidationError(f"Invalid status filter: {e}")
