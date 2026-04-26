"""
StayVise — Payment API endpoints.

POST /payments/create-order   — create Razorpay order for frontend checkout
POST /payments/verify         — verify Razorpay signature after payment
GET  /payments/project/{id}/status — payment status polling
POST /payments/refund         — refund a project
"""


import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.schemas.payment import (
    CreateOrderRequest,
    OrderResponse,
    PaymentStatusResponse,
    RefundRequest,
    VerifyPaymentRequest,
    TransactionLedgerEntry,
    PaymentStats
)
from app.services.payment import payment_service
import asyncio

logger = logging.getLogger("stayvise.api.payments")

router = APIRouter()


# ══════════════════════════════════════════════════════════════════════════════
# POST /payments/create-order
# ══════════════════════════════════════════════════════════════════════════════


@router.post(
    "/create-order",
    response_model=OrderResponse,
    status_code=201,
    summary="Create Razorpay payment order",
)
async def create_order(
    body: CreateOrderRequest,
    user: CurrentUser,
    db: DbSession,
) -> OrderResponse:
    """Generate a Razorpay order for the frontend checkout widget."""
    result = await payment_service.create_payment_order(body.project_id, db)
    return OrderResponse(**result)


# ══════════════════════════════════════════════════════════════════════════════
# POST /payments/verify
# ══════════════════════════════════════════════════════════════════════════════


@router.post(
    "/verify",
    status_code=200,
    summary="Verify Razorpay payment signature",
)
async def verify_payment(
    body: VerifyPaymentRequest,
    user: CurrentUser,
    db: DbSession,
) -> dict:
    """
    Verify the Razorpay signature after checkout + hold in escrow.
    Called by the frontend after successful Razorpay checkout.
    """
    project = await payment_service.confirm_payment_received(
        order_id=body.razorpay_order_id,
        payment_id=body.razorpay_payment_id,
        signature=body.razorpay_signature,
        db=db,
    )
    return {
        "status": "success",
        "message": "Payment verified and held in escrow.",
        "project_id": str(project.id),
        "project_status": project.status.value,
    }


# ══════════════════════════════════════════════════════════════════════════════
# GET /payments/project/{project_id}/status
# ══════════════════════════════════════════════════════════════════════════════


@router.get(
    "/project/{project_id}/status",
    response_model=PaymentStatusResponse,
    summary="Get payment status",
)
async def get_payment_status(
    project_id: str,
    user: CurrentUser,
    db: DbSession,
) -> PaymentStatusResponse:
    """Poll for payment status (used by frontend after redirect)."""
    from sqlalchemy import select  # noqa: PLC0415
    from app.db.models import Project, UserRole  # noqa: PLC0415
    from app.core.exceptions import ForbiddenError, NotFoundError  # noqa: PLC0415

    result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise NotFoundError("Project", project_id)

    if user.id not in (project.freelancer_id, project.client_id) and user.role != UserRole.admin:
        raise ForbiddenError("You do not have access to this project.")

    return PaymentStatusResponse(
        project_id=str(project.id),
        status=project.status.value,
        razorpay_order_id=project.razorpay_order_id,
        razorpay_payment_id=project.razorpay_payment_id,
        escrow_held_at=project.escrow_held_at,
        total_amount=project.total_amount,
        platform_fee_amount=project.platform_fee_amount,
        is_paid=project.status not in ("draft", "awaiting_payment"),
    )


# ══════════════════════════════════════════════════════════════════════════════
# POST /payments/refund
# ══════════════════════════════════════════════════════════════════════════════


@router.post(
    "/refund",
    status_code=200,
    summary="Refund a project",
)
async def refund_project(
    body: RefundRequest,
    user: CurrentUser,
    db: DbSession,
) -> dict:
    """Full refund to client — only before milestones released."""
    refund = await payment_service.handle_refund(body.project_id, body.reason, db)
    await db.commit()
    return {
        "status": "success",
        "message": "Refund processed.",
        "refund_id": refund.get("id", ""),
    }


# ══════════════════════════════════════════════════════════════════════════════
# GET /payments/history
# ══════════════════════════════════════════════════════════════════════════════


@router.get(
    "/history",
    response_model=list[TransactionLedgerEntry],
    summary="Global transaction history",
)
async def get_payment_history(
    user: CurrentUser,
    db: DbSession,
    skip: int = 0,
    limit: int = 20,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
) -> list[TransactionLedgerEntry]:
    """
    List all immutable financial entries for the current user.
    Shows entries from both client and freelancer perspectives.
    """
    from sqlalchemy.orm import joinedload, contains_eager  # noqa: PLC0415
    from sqlalchemy import select, desc, or_  # noqa: PLC0415
    from app.db.models import Transaction, Project  # noqa: PLC0415

    query = (
        select(Transaction)
        .join(Transaction.project)
        .options(contains_eager(Transaction.project), joinedload(Transaction.milestone))
        .where(
            or_(
                Project.client_id == user.id,
                Project.freelancer_id == user.id
            )
        )
    )

    if start_date:
        query = query.where(Transaction.created_at >= start_date)
    if end_date:
        query = query.where(Transaction.created_at <= end_date)

    query = query.order_by(desc(Transaction.created_at)).offset(skip).limit(limit)
    result = await db.execute(query)
    entries = result.scalars().all()

    return [
        TransactionLedgerEntry(
            id=str(tx.id),
            created_at=tx.created_at,
            project_title=tx.project.title,
            milestone_title=tx.milestone.title if tx.milestone else None,
            amount=tx.amount,
            transaction_type=tx.transaction_type.value,
            status=tx.status.value,
            razorpay_reference=tx.razorpay_reference,
            audit_hash=tx.audit_hash,
            previous_audit_hash=tx.previous_audit_hash,
            is_audit_verified=bool(tx.audit_hash),
        )
        for tx in entries
    ]


# ══════════════════════════════════════════════════════════════════════════════
# GET /payments/me/stats
# ══════════════════════════════════════════════════════════════════════════════


@router.get(
    "/me/stats",
    response_model=PaymentStats,
    summary="Summary financial metrics",
)
async def get_payment_stats(
    user: CurrentUser,
    db: DbSession,
) -> PaymentStats:
    """Calculate summary cards for the ledger header."""
    from sqlalchemy import select, or_, func  # noqa: PLC0415
    from app.db.models import Transaction, Project, TransactionType, TransactionStatus  # noqa: PLC0415

    total_received_query = select(func.coalesce(func.sum(Transaction.amount), 0)).join(Project).where(
        Project.freelancer_id == user.id,
        Transaction.transaction_type == TransactionType.milestone_release,
        Transaction.status == TransactionStatus.success,
    )

    total_spent_query = select(func.coalesce(func.sum(Transaction.amount), 0)).join(Project).where(
        Project.client_id == user.id,
        Transaction.transaction_type == TransactionType.escrow_hold,
        Transaction.status == TransactionStatus.success,
    )

    fee_query = select(func.coalesce(func.sum(Transaction.amount), 0)).join(Project).where(
        Project.freelancer_id == user.id,
        Transaction.transaction_type == TransactionType.platform_fee,
        Transaction.status == TransactionStatus.success,
    )

    escrow_query = select(func.coalesce(func.sum(Project.total_amount), 0)).where(
        Project.client_id == user.id,
        Project.status == "in_progress",
    )

    count_query = select(func.count(Transaction.id)).join(Project).where(
        or_(Project.client_id == user.id, Project.freelancer_id == user.id)
    )

    verified_entries_query = select(func.count(Transaction.id)).join(Project).where(
        or_(Project.client_id == user.id, Project.freelancer_id == user.id),
        Transaction.audit_hash.is_not(None),
    )

    last_entry_query = select(func.max(Transaction.created_at)).join(Project).where(
        or_(Project.client_id == user.id, Project.freelancer_id == user.id)
    )

    # NOTE: Must run sequentially — asyncpg doesn't support concurrent ops on one connection.
    r_received = await db.execute(total_received_query)
    r_spent = await db.execute(total_spent_query)
    r_fee = await db.execute(fee_query)
    r_escrow = await db.execute(escrow_query)
    r_count = await db.execute(count_query)
    r_verified = await db.execute(verified_entries_query)
    r_last = await db.execute(last_entry_query)

    total_received = r_received.scalar() or 0
    total_spent = r_spent.scalar() or 0
    fees_paid = r_fee.scalar() or 0
    pending_escrow = r_escrow.scalar() or 0
    count = r_count.scalar() or 0
    verified_entries = r_verified.scalar() or 0
    last_entry_at = r_last.scalar_one_or_none()

    return PaymentStats(
        total_received=total_received,
        total_spent=total_spent,
        platform_fees_paid=fees_paid,
        pending_escrow=pending_escrow,
        transaction_count=count,
        verified_entries=verified_entries,
        last_entry_at=last_entry_at,
    )

