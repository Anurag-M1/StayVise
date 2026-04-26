from typing import Optional
"""
StayVise — User management API.

Endpoints
---------
  GET   /users/me                    — full profile with trust score
  PUT   /users/me                    — update profile fields
  POST  /users/me/complete-onboarding — set role, mark onboarding done
  GET   /users/{user_id}/profile     — public profile (no sensitive data)
"""


import logging
from datetime import timezone, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Request, Query
from sqlalchemy import func, select, update, or_
from sqlalchemy.orm import selectinload

from app.schemas import NotificationRead
from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import NotFoundError, ValidationError
from app.db.models import Milestone, MilestoneStatus, Project, ProjectStatus, TrustScore, User, UserSession
from app.db.crud.notification import notification as notification_crud
from app.schemas.user import (
    BillingPlanUpdate,
    BillingSummaryResponse,
    OnboardingComplete,
    NotificationPrefsUpdate,
    TrustScoreResponse,
    UserLookupItem,
    UserLookupResponse,
    UserPublicProfile,
    UserResponse,
    UserSessionResponse,
    UserWithTrustScore,
    UserUpdate,
    SubscribeRequest,
    VerifySubscriptionRequest,
)
from app.schemas.user_stats import UserStatsResponse
from app.schemas.user_activity import ActivityItem

logger = logging.getLogger("stayvise.users")

router = APIRouter()


def _normalize_billing_plan(value: Optional[str]) -> str:
    return "premium" if value in {"premium", "pro"} else "free"


def _billing_summary_for_user(user: User) -> BillingSummaryResponse:
    normalized_plan = _normalize_billing_plan(user.billing_plan)
    now = datetime.now(timezone.utc)
    is_active = normalized_plan == "premium" and (
        user.subscription_expires_at is None or user.subscription_expires_at > now
    )

    role_features = (
        [
            "Escrow funding controls",
            "Approval reminders",
            "Dispute escalation priority",
            "Client-side ledger views",
        ]
        if user.role == "client"
        else [
            "Payout routing",
            "Milestone release alerts",
            "Public trust profile",
            "Freelancer-side ledger views",
        ]
    )

    summary = (
        "Client billing controls funding, approvals, and dispute support."
        if user.role == "client"
        else "Freelancer billing controls payouts, trust visibility, and release notifications."
    )

    # ── Plan limits ────────────────────────────────────────────────────────────
    from app.schemas.user import PlanLimits  # noqa: PLC0415

    if is_active:
        plan_limits = PlanLimits(
            max_active_projects=999,
            escrow_fee_percent=1.5,
            has_priority_disputes=True,
            has_verified_badge=True,
            has_gst_invoices=True,
            has_custom_url=True,
        )
    else:
        plan_limits = PlanLimits(
            max_active_projects=1,
            escrow_fee_percent=2.0,
            has_priority_disputes=False,
            has_verified_badge=False,
            has_gst_invoices=False,
            has_custom_url=False,
        )

    return BillingSummaryResponse(
        role=user.role,
        billing_plan=normalized_plan,
        is_subscription_active=is_active,
        renewal_date=user.subscription_expires_at,
        features=role_features,
        summary=summary,
        plan_limits=plan_limits,
    )


# ══════════════════════════════════════════════════════════════════════════════
# GET /users/me — authenticated user's full profile + trust score
# ══════════════════════════════════════════════════════════════════════════════


@router.get(
    "/me",
    response_model=UserWithTrustScore,
    summary="My profile with trust score",
)
async def get_my_profile(
    user: CurrentUser,
    db: DbSession,
) -> UserWithTrustScore:
    """
    Return the authenticated user's profile including their trust score.
    """
    # Eager-load trust_score in case the relationship wasn't loaded
    result = await db.execute(
        select(User)
        .options(selectinload(User.trust_score))
        .where(User.id == user.id)
    )
    full_user = result.scalar_one()
    await trust_score_service.calculate_and_save(full_user.id, db)
    await db.refresh(full_user)

    response = UserWithTrustScore.model_validate(full_user)

    if full_user.trust_score is not None:
        response.trust_score = TrustScoreResponse.model_validate(full_user.trust_score)

    return response


@router.get(
    "/lookup",
    response_model=UserLookupResponse,
    summary="Look up a user by phone number",
)
async def lookup_user_by_phone(
    phone_number: str,
    db: DbSession,
) -> UserLookupResponse:
    """Check whether a phone number already belongs to an active user."""
    result = await db.execute(
        select(User)
        .options(selectinload(User.trust_score))
        .where(
            User.phone_number == phone_number,
            User.is_active.is_(True),
        )
    )
    found_user = result.scalar_one_or_none()

    if found_user is None:
        return UserLookupResponse(exists=False, user=None)

    await trust_score_service.calculate_and_save(found_user.id, db)
    await db.refresh(found_user)
    payload = UserLookupItem.model_validate(found_user)
    if found_user.trust_score is not None:
        payload.trust_score = TrustScoreResponse.model_validate(found_user.trust_score)

    return UserLookupResponse(exists=True, user=payload)


# ══════════════════════════════════════════════════════════════════════════════
# GET /users/me/stats — role-based financial + project stats
# ══════════════════════════════════════════════════════════════════════════════


@router.get(
    "/me/stats",
    response_model=UserStatsResponse,
    summary="My financial and project statistics",
)
async def get_my_stats(
    user: CurrentUser,
    db: DbSession,
) -> UserStatsResponse:
    """
    Calculate financial overview based on user role.

    - Escrow Balance: Funds currently 'locked' in in_progress projects.
    - Total Released: Funds paid out to date.
    - Active Projects: Count of in_progress projects.
    - Pending Actions: Count of milestones awaiting this user (Submit for freelancer, Approve for client).
    """
    is_freelancer = user.role == "freelancer"

    # ── Financials ─────────────────────────────────────────────────────────────
    # Escrow Balance = Sum of amounts of in_progress projects where milestones are not released
    escrow_q = (
        select(func.sum(Milestone.amount))
        .join(Project, Project.id == Milestone.project_id)
        .where(Project.status == ProjectStatus.in_progress)
        .where(Milestone.status.in_([MilestoneStatus.pending, MilestoneStatus.submitted]))
    )

    released_q = (
        select(func.sum(Milestone.amount))
        .join(Project, Project.id == Milestone.project_id)
        .where(Milestone.status == MilestoneStatus.released)
    )
    earned_q = (
        select(func.sum(Milestone.amount))
        .join(Project, Project.id == Milestone.project_id)
        .where(Milestone.status == MilestoneStatus.released)
        .where(Project.freelancer_id == user.id)
    )
    spent_q = (
        select(func.sum(Project.total_amount + Project.platform_fee_amount))
        .where(Project.client_id == user.id)
        .where(Project.escrow_held_at.is_not(None))
    )

    if is_freelancer:
        escrow_q = escrow_q.where(Project.freelancer_id == user.id)
        released_q = released_q.where(Project.freelancer_id == user.id)
    else:
        escrow_q = escrow_q.where(Project.client_id == user.id)
        released_q = released_q.where(Project.client_id == user.id)

    escrow_balance = (await db.execute(escrow_q)).scalar() or Decimal("0.00")
    total_released = (await db.execute(released_q)).scalar() or Decimal("0.00")
    total_earned = (await db.execute(earned_q)).scalar() or Decimal("0.00")
    total_spent = (await db.execute(spent_q)).scalar() or Decimal("0.00")

    # ── Counts ─────────────────────────────────────────────────────────────────
    projects_q = (
        select(func.count(Project.id))
        .where(Project.status == ProjectStatus.in_progress)
    )
    
    # actions_q = Pending Actions (Wait for User)
    actions_q = (
        select(func.count(Milestone.id))
        .join(Project, Project.id == Milestone.project_id)
        .where(Project.status == ProjectStatus.in_progress)
    )

    if is_freelancer:
        projects_q = projects_q.where(Project.freelancer_id == user.id)
        # Freelancer actions: Milestones they need to submit
        actions_q = actions_q.where(
            Project.freelancer_id == user.id, 
            Milestone.status == MilestoneStatus.pending
        )
    else:
        projects_q = projects_q.where(Project.client_id == user.id)
        # Client actions: Milestones they need to approve
        actions_q = actions_q.where(
            Project.client_id == user.id, 
            Milestone.status == MilestoneStatus.submitted
        )
    
    # Total projects (all-time history)
    total_projects_q = (
        select(func.count(Project.id))
    )
    if is_freelancer:
        total_projects_q = total_projects_q.where(Project.freelancer_id == user.id)
    else:
        total_projects_q = total_projects_q.where(Project.client_id == user.id)

    active_projects = (await db.execute(projects_q)).scalar() or 0
    total_projects = (await db.execute(total_projects_q)).scalar() or 0
    pending_actions = (await db.execute(actions_q)).scalar() or 0

    return UserStatsResponse(
        escrow_balance=escrow_balance,
        total_released=total_released,
        total_earned=total_earned,
        total_spent=total_spent,
        active_projects=active_projects,
        total_projects=total_projects,
        pending_actions=pending_actions,
    )


# ══════════════════════════════════════════════════════════════════════════════
# GET /users/me/activity — unified activity feed
# ══════════════════════════════════════════════════════════════════════════════


from app.schemas.user_activity import ActivityItem, ActivityListResponse

@router.get(
    "/me/activity",
    response_model=ActivityListResponse,
    summary="My recent activity feed",
)
async def get_my_activity(
    user: CurrentUser,
    db: DbSession,
    cursor: Optional[datetime] = Query(None, description="Keyset cursor"),
    limit: int = 10,
) -> ActivityListResponse:
    """
    Fetch a unified list of recent events for the dashboard.
    Combines Transactions and relevant Project status changes.
    Supports keyset pagination via cursor.
    """
    from sqlalchemy import desc, or_
    from app.db.models import Transaction

    from sqlalchemy.orm import selectinload, joinedload

    # Currently we derive activity from the Transaction table
    # as it represents all major funding/release events.
    stmt = (
        select(Transaction)
        .options(joinedload(Transaction.project), joinedload(Transaction.milestone))
        .join(Project, Project.id == Transaction.project_id)
        .where(
            or_(
                Project.client_id == user.id,
                Project.freelancer_id == user.id
            )
        )
    )
    
    if cursor:
        stmt = stmt.where(Transaction.created_at < cursor)
        
    stmt = stmt.order_by(Transaction.created_at.desc()).limit(limit)
    
    result = await db.execute(stmt)
    txs = result.scalars().all()

    activity = []
    for tx in txs:
        # Format transaction into activity item
        if tx.transaction_type == "escrow_hold":
            title = "Project Funded"
            desc_text = f"₹{tx.amount:,} held in escrow for '{tx.project.title}'"
            act_type = "payment_funded"
        elif tx.transaction_type == "milestone_release":
            title = "Payment Released"
            desc_text = f"₹{tx.amount:,} released for '{tx.milestone.title if tx.milestone else tx.project.title}'"
            act_type = "payment_received" if user.role == "freelancer" else "payment_sent"
        elif tx.transaction_type == "refund":
            title = "Refund Processed"
            desc_text = f"₹{tx.amount:,} returned to client for '{tx.project.title}'"
            act_type = "refund"
        else:
            title = "Financial Event"
            desc_text = f"{tx.transaction_type.value.replace('_', ' ').title()} of ₹{tx.amount:,}"
            act_type = "other"

        activity.append(ActivityItem(
            id=str(tx.id),
            type=act_type,
            title=title,
            description=desc_text,
            amount=tx.amount,
            created_at=tx.created_at,
            project_id=str(tx.project_id),
            status=tx.status.value
        ))

    next_cursor = txs[-1].created_at if txs else None

    return ActivityListResponse(
        items=activity,
        next_cursor=next_cursor,
        limit=limit
    )


# ══════════════════════════════════════════════════════════════════════════════
# PUT /users/me — update mutable profile fields
# ══════════════════════════════════════════════════════════════════════════════


@router.put(
    "/me",
    response_model=UserResponse,
    summary="Update my profile",
)
async def update_my_profile(
    body: UserUpdate,
    user: CurrentUser,
    db: DbSession,
) -> UserResponse:
    """Update the authenticated user's mutable fields (full_name, email, whatsapp_name)."""
    update_data = body.model_dump(exclude_unset=True)

    if not update_data:
        raise ValidationError("No fields provided to update.")

    # Check email uniqueness if being changed
    if "email" in update_data and update_data["email"] is not None:
        existing = await db.execute(
            select(User).where(
                User.email == update_data["email"],
                User.id != user.id,
            )
        )
        if existing.scalar_one_or_none() is not None:
            raise ValidationError("This email is already registered to another account.")

    # Check username uniqueness if being changed
    if "username" in update_data and update_data["username"] is not None:
        existing_user = await db.execute(
            select(User).where(
                User.username == update_data["username"],
                User.id != user.id,
            )
        )
        if existing_user.scalar_one_or_none() is not None:
            raise ValidationError("This username is already taken. Please choose another.")

    for field, value in update_data.items():
        setattr(user, field, value)

    db.add(user)
    await db.flush()
    await db.refresh(user)

    logger.info("User %s updated profile: %s", user.id, list(update_data.keys()))
    return UserResponse.model_validate(user)


# ══════════════════════════════════════════════════════════════════════════════
# POST /users/me/complete-onboarding
# ══════════════════════════════════════════════════════════════════════════════


@router.post(
    "/me/complete-onboarding",
    response_model=UserResponse,
    summary="Complete onboarding",
)
async def complete_onboarding(
    body: OnboardingComplete,
    user: CurrentUser,
    db: DbSession,
) -> UserResponse:
    """
    Mark the user's onboarding as complete and set their primary role.

    Can only be called once — raises 422 if already onboarded.
    """
    if user.onboarding_complete:
        raise ValidationError("Onboarding is already complete.")

    user.role = body.role
    user.onboarding_complete = True
    db.add(user)
    await db.flush()
    await db.refresh(user)

    logger.info("User %s completed onboarding as %s", user.id, body.role.value)
    return UserResponse.model_validate(user)


# ══════════════════════════════════════════════════════════════════════════════
# GET /users/{user_id}/profile — public profile
# ══════════════════════════════════════════════════════════════════════════════


from app.services.trust_score import trust_score_service

from app.core.cache import cached_response

@router.get(
    "/{identifier}/profile",
    response_model=UserPublicProfile,
    summary="Public user profile",
)
@cached_response(key_prefix="public_profile", ttl=300)
async def get_public_profile(
    identifier: str,
    db: DbSession,
) -> UserPublicProfile:
    """
    Return a public-facing profile for any user.
    'identifier' can be a UUID string or a vanity username.

    Includes trust score, bio, and a privacy-safe list of recent projects.
    """
    from sqlalchemy import or_

    # Attempt lookup by ID or Username
    result = await db.execute(
        select(User)
        .options(selectinload(User.trust_score))
        .where(
            or_(
                User.id == identifier,
                User.username == identifier.lower()
            ),
            User.is_active.is_(True)
        )
    )
    user = result.scalar_one_or_none()

    if user is None:
        raise NotFoundError("User", identifier)

    await trust_score_service.calculate_and_save(user.id, db)
    await db.refresh(user)

    # ── Compute badges ─────────────────────────────────────────────────────────
    if user.trust_score:
        badges = trust_score_service.get_badges(user.trust_score, user)
    else:
        badges = ["🆕 New"]

    is_pro = user.billing_plan in ("premium", "pro")
    if is_pro:
        badges.insert(0, "✅ Verified Pro")
    elif user.is_verified:
        badges.insert(0, "✅ Verified")

    # ── Fetch Recent Projects (Anonymized) ─────────────────────────────────────
    projects_result = await db.execute(
        select(Project)
        .options(selectinload(Project.milestones))
        .where(
            Project.freelancer_id == user.id,
            Project.status == ProjectStatus.completed
        )
        .order_by(Project.updated_at.desc())
        .limit(5)
    )
    completed_projects = projects_result.scalars().all()

    from app.schemas.user import RecentProject
    recent_projects_list = []
    for p in completed_projects:
        # Anonymization logic
        # If title is "Logo Design for Tesla", map to "Logo Design Project"
        category = "Design" if "logo" in p.title.lower() or "branding" in p.title.lower() else "Development"
        
        # Duration calculation
        duration = (p.updated_at - p.created_at).days if p.updated_at and p.created_at else 0
        
        recent_projects_list.append(RecentProject(
            id=str(p.id)[:8], # Masked ID
            category=category,
            anonymized_title=f"{category} Project",
            amount_min=p.total_amount * Decimal("0.8"),
            amount_max=p.total_amount * Decimal("1.2"),
            duration_days=max(1, duration),
            milestone_count=len(p.milestones),
            completed_at=p.updated_at
        ))

    total_secured_result = await db.execute(
        select(func.sum(Project.total_amount)).where(
            Project.freelancer_id == user.id,
            Project.status == ProjectStatus.completed,
        )
    )
    total_secured_amount = total_secured_result.scalar() or Decimal("0.00")

    response = UserPublicProfile(
        id=user.id,
        full_name=user.full_name,
        whatsapp_name=user.whatsapp_name,
        username=user.username,
        role=user.role,
        bio=user.bio,
        avatar_url=user.avatar_url,
        created_at=user.created_at,
        total_secured_amount=total_secured_amount,
        badges=badges,
        recent_projects=recent_projects_list
    )

    if user.trust_score is not None:
        response.trust_score = TrustScoreResponse.model_validate(user.trust_score)

    return response


# ══════════════════════════════════════════════════════════════════════════════
# GET /users/check-username — check if a handle is available
# ══════════════════════════════════════════════════════════════════════════════


@router.get(
    "/check-username",
    summary="Check username availability",
)
async def check_username(
    username: str,
    db: DbSession,
) -> dict:
    """Check if a username is already taken by another user."""
    result = await db.execute(
        select(User).where(User.username == username.lower())
    )
    is_taken = result.scalar_one_or_none() is not None
    return {"available": not is_taken}


@router.get("/me/notifications", response_model=dict)
async def get_my_notifications(user: CurrentUser):
    """Fetch user's granular notification preferences."""
    return user.notification_prefs or {
        "whatsapp_project_updates": True,
        "whatsapp_payment_alerts": True,
        "whatsapp_reminders": True,
        "whatsapp_weekly_summary": False,
        "email_monthly_statement": False,
        "email_security_alerts": True,
        "quiet_hours_enabled": False,
        "quiet_hours_start": "22:00",
        "quiet_hours_end": "08:00",
    }


@router.put("/me/notifications")
async def update_my_notifications(
    body: NotificationPrefsUpdate,
    user: CurrentUser,
    db: DbSession
):
    """Save user's granular notification preferences."""
    user.notification_prefs = body.model_dump()
    await db.commit()
    return {"status": "success"}


@router.get("/me/notifications/feed", response_model=list[NotificationRead])
async def get_my_notification_feed(
    user: CurrentUser,
    db: DbSession,
    limit: int = 20,
):
    """Return the latest persisted notification events for the dashboard drawer."""
    notifications = await notification_crud.get_recent(
        db,
        user_id=user.id,
        limit=min(max(limit, 1), 50),
    )
    return [NotificationRead.model_validate(item) for item in notifications]


@router.post("/me/notifications/{notification_id}/read", response_model=NotificationRead)
async def mark_my_notification_read(
    notification_id: str,
    user: CurrentUser,
    db: DbSession,
):
    """Mark one persisted notification as read."""
    item = await notification_crud.get_by_user_and_id(
        db,
        user_id=user.id,
        notification_id=notification_id,
    )
    if item is None:
        raise NotFoundError("Notification", notification_id)
    if item.read_at is None:
        await notification_crud.mark_read(db, notification=item)
    return NotificationRead.model_validate(item)


@router.post("/me/notifications/read-all")
async def mark_all_my_notifications_read(
    user: CurrentUser,
    db: DbSession,
):
    """Mark all recent notifications as read for the current user."""
    updated = await notification_crud.mark_all_read(db, user_id=user.id)
    return {"status": "success", "updated": updated}


@router.get("/me/sessions", response_model=list[UserSessionResponse])
async def get_my_sessions(user: CurrentUser, db: DbSession):
    """List all active dashboard sessions for the current user."""
    from app.db.models import UserSession  # noqa: PLC0415

    result = await db.execute(
        select(UserSession)
        .where(UserSession.user_id == user.id, UserSession.is_active.is_(True))
        .order_by(UserSession.last_active_at.desc())
    )
    return result.scalars().all()


@router.get("/me/login-history", response_model=list[UserSessionResponse])
async def get_my_login_history(user: CurrentUser, db: DbSession):
    """List recent login history including inactive sessions."""
    from app.db.models import UserSession  # noqa: PLC0415

    result = await db.execute(
        select(UserSession)
        .where(UserSession.user_id == user.id)
        .order_by(UserSession.created_at.desc())
        .limit(20)
    )
    return result.scalars().all()


@router.delete("/me/sessions/{session_id}")
async def terminate_session(session_id: str, user: CurrentUser, db: DbSession):
    """Sign out a specific device/session."""
    from sqlalchemy import select  # noqa: PLC0415
    from app.db.models import UserSession  # noqa: PLC0415

    result = await db.execute(select(UserSession).where(UserSession.id == session_id, UserSession.user_id == user.id))
    session = result.scalar_one_or_none()
    if session:
        session.is_active = False
        await db.commit()
    return {"status": "success"}


@router.delete("/me/sessions/all-others")
async def terminate_all_other_sessions(
    user: CurrentUser, 
    db: DbSession, 
    request: Request
):
    """
    Sign out all other devices except the current active session.
    Uses a direct update statement for robustness and performance.
    """
    from sqlalchemy import update, not_  # noqa: PLC0415
    from app.core.security import decode_token  # noqa: PLC0415
    from app.core.audit_log import log_audit_event  # noqa: PLC0415

    auth_header = request.headers.get("authorization", "")
    token = auth_header.replace("Bearer ", "").strip()
    current_sid = ""
    if token:
        try:
            # Extract 'sid' claim from current access token to avoid signing out self
            payload = decode_token(token, expected_type="access")
            current_sid = str(payload.get("sid", ""))
        except Exception:
            current_sid = ""

    # Direct DB update: deactivate all active sessions for this user except current one
    stmt = (
        update(UserSession)
        .where(
            UserSession.user_id == user.id,
            UserSession.is_active.is_(True),
            not_(UserSession.session_id == current_sid) if current_sid else True
        )
        .values(is_active=False)
    )
    result = await db.execute(stmt)
    await db.commit()

    # Log security event
    await log_audit_event(
        db, 
        "session_logout_all", 
        user_id=user.id, 
        request=request,
        metadata={"affected_count": result.rowcount}
    )

    logger.info("User %s terminated all other sessions (current sid: %s)", user.id, current_sid)
    return {"status": "success", "revoked_count": result.rowcount}



@router.get("/me/billing", response_model=BillingSummaryResponse)
async def get_my_billing_summary(user: CurrentUser) -> BillingSummaryResponse:
    """Return role-aware subscription state for the current account."""
    return _billing_summary_for_user(user)


@router.put("/me/billing", response_model=BillingSummaryResponse)
async def update_my_billing_summary(
    body: BillingPlanUpdate,
    user: CurrentUser,
    db: DbSession,
) -> BillingSummaryResponse:
    """Persist the user's selected billing plan for live account views."""
    normalized_plan = _normalize_billing_plan(body.billing_plan)
    user.billing_plan = "premium" if normalized_plan == "premium" else "free"
    if normalized_plan == "premium":
        if user.subscription_expires_at is None or user.subscription_expires_at <= datetime.now(timezone.utc):
            user.subscription_expires_at = datetime.now(timezone.utc) + timedelta(days=30)
    else:
        user.subscription_expires_at = None
    await db.commit()
    await db.refresh(user)
    return _billing_summary_for_user(user)


# ══════════════════════════════════════════════════════════════════════════════
# POST /users/me/billing/subscribe — Create Razorpay Order for Pro Upgrade
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/me/billing/subscribe")
async def create_subscription(
    body: SubscribeRequest,
    user: CurrentUser,
    db: DbSession,
) -> dict:
    """
    Create a Razorpay Order for the Pro plan upgrade.
    Returns order_id + key_id for the frontend Razorpay Checkout widget.
    """
    from app.core.config import settings  # noqa: PLC0415

    key_id = settings.RAZORPAY_KEY_ID
    key_secret = settings.RAZORPAY_KEY_SECRET

    # Pro plan: ₹299/month — using standard Orders API
    amount_paise = 29900  # ₹299

    order_data = {
        "amount": amount_paise,
        "currency": "INR",
        "receipt": f"pro_{str(user.id)[:30]}",
        "notes": {
            "user_id": str(user.id),
            "plan": "pro",
            "type": "subscription_upgrade",
        },
        "payment_capture": True,
    }

    try:
        import httpx  # noqa: PLC0415

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                "https://api.razorpay.com/v1/orders",
                json=order_data,
                auth=(key_id, key_secret),
            )

        if response.status_code not in (200, 201):
            error_text = response.text[:300]
            logger.error("Razorpay order creation for Pro upgrade failed: %d — %s", response.status_code, error_text)
            if response.status_code == 401 or "Authentication failed" in error_text:
                raise ValidationError("Razorpay authentication failed. Please verify your API keys.")
            raise ValidationError(f"Could not create upgrade order: {error_text}")

        rz_order = response.json()
        order_id = rz_order["id"]

        logger.info("Pro upgrade order created: %s for user %s", order_id, user.id)

        return {
            "subscription_id": order_id,  # Frontend expects subscription_id
            "order_id": order_id,
            "razorpay_key_id": key_id,
            "amount": amount_paise,
        }
    except ValidationError:
        raise
    except Exception as exc:
        logger.error("Failed to create Pro upgrade order: %s", exc)
        raise ValidationError(f"Could not initiate upgrade: {exc}")


@router.delete(
    "/me",
    summary="Delete my account",
    description="Deactivates the user account. Blocked if there are active projects."
)
async def delete_my_account(
    user: CurrentUser,
    db: DbSession,
) -> dict:
    """
    Deactivate the account. 
    Safety check: Ensure no projects are in a state that requires user action (in_progress, disputed, awaiting_payment).
    """
    # Check for active projects
    active_projects_query = select(func.count(Project.id)).where(
        or_(Project.client_id == user.id, Project.freelancer_id == user.id),
        Project.status.in_([
            ProjectStatus.in_progress,
            ProjectStatus.disputed,
            ProjectStatus.awaiting_payment
        ])
    )
    active_count = (await db.execute(active_projects_query)).scalar() or 0
    
    if active_count > 0:
        raise ValidationError(
            f"Cannot delete account while {active_count} projects are active or in dispute. "
            "Please complete or cancel all projects first."
        )

    # 1. Deactivate User
    user.is_active = False
    db.add(user)

    # 2. Deactivate all sessions
    await db.execute(
        update(UserSession)
        .where(UserSession.user_id == user.id)
        .values(is_active=False)
    )

    await db.commit()
    logger.info("User %s has deleted (deactivated) their account.", user.id)
    
    return {"status": "success", "message": "Account deactivated successfully."}


@router.post("/me/billing/verify-subscription")
async def verify_subscription(
    body: VerifySubscriptionRequest,
    user: CurrentUser,
    db: DbSession,
) -> dict:
    """
    Verify Razorpay payment signature and activate the Pro plan.
    Called by frontend after successful Razorpay Checkout completion.
    """
    from app.core.config import settings  # noqa: PLC0415
    import hmac as _hmac, hashlib as _hashlib  # noqa: PLC0415

    key_secret = settings.RAZORPAY_KEY_SECRET

    try:
        # Verify HMAC-SHA256 signature: order_id|payment_id
        order_id = body.razorpay_subscription_id  # Frontend sends order_id as subscription_id
        payment_id = body.razorpay_payment_id
        signature = body.razorpay_signature

        message = f"{order_id}|{payment_id}"
        expected = _hmac.new(
            key_secret.encode("utf-8"),
            message.encode("utf-8"),
            _hashlib.sha256,
        ).hexdigest()

        if not _hmac.compare_digest(expected, signature):
            raise ValidationError("Payment signature verification failed. Please contact support.")

        # ── Activate Pro Plan ──────────────────────────────────────────────────
        user.billing_plan = "premium"
        user.razorpay_subscription_id = order_id
        user.subscription_expires_at = datetime.now(timezone.utc) + timedelta(days=30)
        db.add(user)
        await db.commit()
        await db.refresh(user)

        logger.info("User %s upgraded to Pro via order %s", user.id, order_id)

        return {"status": "success", "plan": "pro"}
    except ValidationError:
        raise
    except Exception as exc:
        logger.error("Pro upgrade verification failed: %s", exc)
        raise ValidationError(f"Payment verification failed: {exc}")


