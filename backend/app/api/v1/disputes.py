"""
StayVise — Dispute management API.
"""


import logging
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter
from sqlalchemy import select, or_
from sqlalchemy.orm import selectinload

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import NotFoundError, ForbiddenError
from app.db.models import Dispute, DisputeStatus, Project, Milestone
from app.schemas.project import DisputeResponse

logger = logging.getLogger("stayvise.disputes")

router = APIRouter()

# ══════════════════════════════════════════════════════════════════════════════
# GET / — list current user's disputes
# ══════════════════════════════════════════════════════════════════════════════

@router.get(
    "/",
    response_model=List[DisputeResponse],
    summary="List my disputes",
)
async def list_my_disputes(
    user: CurrentUser,
    db: DbSession,
    status: Optional[str] = None,
) -> List[DisputeResponse]:
    """
    Return all disputes where the user is either the raiser or a party in the project.
    """
    query = select(Dispute).join(Project).where(
        or_(
            Dispute.raised_by_id == user.id,
            Project.client_id == user.id,
            Project.freelancer_id == user.id
        )
    )
    
    if status:
        normalized_status = status.strip().lower()
        grouped_statuses = {
            "open": [DisputeStatus.open],
            "process": [DisputeStatus.under_review, DisputeStatus.escalated],
            "closed": [DisputeStatus.resolved_client, DisputeStatus.resolved_freelancer],
            "under_review": [DisputeStatus.under_review],
            "resolved": [DisputeStatus.resolved_client, DisputeStatus.resolved_freelancer],
            "escalated": [DisputeStatus.escalated],
        }
        if normalized_status in grouped_statuses:
            query = query.where(Dispute.status.in_(grouped_statuses[normalized_status]))
        else:
            query = query.where(Dispute.status == DisputeStatus(normalized_status))
        
    result = await db.execute(query.order_by(Dispute.created_at.desc()))
    disputes = result.scalars().all()
    
    return [DisputeResponse.model_validate(d) for d in disputes]

# ══════════════════════════════════════════════════════════════════════════════
# GET /{id} — detailed dispute view
# ══════════════════════════════════════════════════════════════════════════════

@router.get(
    "/{dispute_id}",
    response_model=DisputeResponse, # We might want a Detail schema later
    summary="Get dispute detail",
)
async def get_dispute_detail(
    dispute_id: str,
    user: CurrentUser,
    db: DbSession,
) -> DisputeResponse:
    """
    Get full detail of a dispute including project context.
    Access restricted to parties involved.
    """
    result = await db.execute(
        select(Dispute)
        .options(selectinload(Dispute.project))
        .where(Dispute.id == dispute_id)
    )
    dispute = result.scalar_one_or_none()
    
    if not dispute:
        raise NotFoundError("Dispute", dispute_id)
        
    if user.id not in (dispute.raised_by_id, dispute.project.client_id, dispute.project.freelancer_id) and user.role != "admin":
        raise ForbiddenError("You do not have access to this dispute.")
        
    return DisputeResponse.model_validate(dispute)
