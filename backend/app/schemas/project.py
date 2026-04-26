from __future__ import annotations
"""
StayVise — Project & Milestone Pydantic schemas (Pydantic v2).
"""


import re
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.db.models import MilestoneStatus, ProjectStatus, UserRole
from app.core.validators import validate_indian_phone, validate_amount, sanitize_text

# ══════════════════════════════════════════════════════════════════════════════


# ══════════════════════════════════════════════════════════════════════════════
# Supporting schemas (Defined early for forward ref safety)
# ══════════════════════════════════════════════════════════════════════════════


class MilestoneCreate(BaseModel):
    """Embedded inside ProjectCreate — one milestone definition."""

    title: str
    description: str
    amount: int = Field(..., description="Amount in paise.")
    sequence_number: int = Field(..., ge=1)

    @field_validator("title", "description")
    @classmethod
    def sanitize_milestone_text(cls, v: str) -> str:
        return sanitize_text(v)

    @field_validator("amount")
    @classmethod
    def validate_milestone_amount(cls, v: int) -> int:
        # Convert paise to INR for common validator logic
        validate_amount(v / 100)
        return v


class MilestoneResponse(BaseModel):
    """Full milestone object returned in API responses."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    title: str
    description: str
    amount: int
    sequence_number: int
    status: MilestoneStatus
    submitted_at: Optional[datetime] = None
    approved_at: Optional[datetime] = None
    released_at: Optional[datetime] = None
    razorpay_payout_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ProposalResponse(BaseModel):
    """Full proposal details."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    freelancer_id: str
    amount: int
    cover_letter: str
    status: str
    created_at: datetime
    updated_at: datetime
    freelancer: Optional["ProjectParty"] = None


class ProjectParty(BaseModel):
    """Lightweight embedded user details for project views."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    full_name: str
    phone_number: str
    username: Optional[str] = None
    role: UserRole
    is_verified: bool


# ══════════════════════════════════════════════════════════════════════════════
# Project schemas
# ══════════════════════════════════════════════════════════════════════════════


class ProjectCreate(BaseModel):
    """POST /projects — create a new escrow project."""

    title: str
    description: str
    client_phone: Optional[str] = Field(
        None,
        description="Optional: Client's phone number. If omitted, project is posted to marketplace.",
        examples=["+919876543210"],
    )
    is_public: bool = Field(False)
    counterparty_name: Optional[str] = Field(None)
    milestones: list[MilestoneCreate] = Field(
        ..., min_length=1, max_length=50,
        description="At least 1 milestone required.",
    )
    deadline: Optional[date] = None

    @field_validator("title", "description", "counterparty_name")
    @classmethod
    def sanitize_project_text(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return sanitize_text(v)

    @field_validator("client_phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        return validate_indian_phone(v)

    @model_validator(mode="after")
    def validate_milestones(self) -> "ProjectCreate":
        # Check sequence numbers are unique and sequential starting from 1
        seq_numbers = sorted(m.sequence_number for m in self.milestones)
        expected = list(range(1, len(self.milestones) + 1))
        if seq_numbers != expected:
            raise ValueError(
                f"Milestone sequence_numbers must be sequential starting at 1. "
                f"Got: {seq_numbers}, expected: {expected}."
            )

        # Check all amounts are positive
        for m in self.milestones:
            if m.amount <= 0:
                raise ValueError(
                    f"Milestone '{m.title}' has non-positive amount: {m.amount}"
                )

        return self

    @property
    def total_amount(self) -> int:
        return sum(m.amount for m in self.milestones)


class ProjectResponse(BaseModel):
    """Full project response with embedded milestones."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    description: str
    freelancer_id: Optional[str] = None
    client_id: str
    status: ProjectStatus
    total_amount: int
    platform_fee_amount: int
    freelancer_payout_amount: int
    currency: str
    razorpay_order_id: Optional[str] = None
    razorpay_payment_id: Optional[str] = None
    escrow_held_at: Optional[datetime] = None
    deadline: Optional[date] = None
    auto_release_at: Optional[datetime] = None
    is_public: bool
    created_at: datetime
    updated_at: datetime
    milestones: list[MilestoneResponse] = Field(default_factory=list)
    proposals: list[ProposalResponse] = Field(default_factory=list)
    freelancer: Optional[ProjectParty] = None
    client: Optional[ProjectParty] = None


class ProjectListItem(BaseModel):
    """Lighter schema for paginated list."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    freelancer_id: Optional[str] = None
    client_id: str
    status: ProjectStatus
    total_amount: int
    currency: str
    deadline: Optional[date] = None
    created_at: datetime
    updated_at: datetime
    freelancer: Optional[ProjectParty] = None
    client: Optional[ProjectParty] = None


class ProjectListResponse(BaseModel):
    """Paginated project list."""

    items: list[ProjectListItem]
    total: int
    page: Optional[int] = None
    limit: int
    next_cursor: Optional[datetime] = None


class ProjectUpdate(BaseModel):
    """PUT /projects/{id}"""

    title: Optional[str] = Field(None, min_length=3, max_length=500)
    description: Optional[str] = Field(None, min_length=10)
    deadline: Optional[date] = None


# ══════════════════════════════════════════════════════════════════════════════
# Dispute schemas
# ══════════════════════════════════════════════════════════════════════════════


class DisputeCreate(BaseModel):
    """POST /projects/{id}/dispute"""

    milestone_id: Optional[str] = None
    reason: str = Field(..., min_length=20)
    evidence_urls: list[str] = Field(default_factory=list)


class DisputeResponse(BaseModel):
    """Dispute API response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    milestone_id: Optional[str] = None
    raised_by_id: str
    status: str
    reason: str
    evidence_urls: list[str]
    resolution_notes: Optional[str] = None
    resolved_by_id: Optional[str] = None
    resolved_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    
    # Nested relations
    project: Optional[ProjectListItem] = None
    milestone: Optional[MilestoneResponse] = None


class ProposalCreate(BaseModel):
    """POST /projects/{id}/apply"""

    amount: int = Field(..., description="Bid amount in paise.")
    cover_letter: str

    @field_validator("cover_letter")
    @classmethod
    def sanitize_bid_text(cls, v: str) -> str:
        return sanitize_text(v, min_length=10)

    @field_validator("amount")
    @classmethod
    def validate_bid_amount(cls, v: int) -> int:
        validate_amount(v / 100)
        return v


# ── Final rebuild ──────────────────────────────────────────────────────────────
ProjectResponse.model_rebuild()
ProposalResponse.model_rebuild()
DisputeResponse.model_rebuild()
ProjectListItem.model_rebuild()
