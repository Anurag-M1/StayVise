from __future__ import annotations
"""
StayVise Pydantic schemas — all models in one place.
Split into separate files per domain as the project grows.
"""


from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator
from app.core.validators import validate_amount, sanitize_text, validate_indian_phone

from app.db.models import (
    DisputeStatus,
    MilestoneStatus,
    NotificationChannel,
    NotificationType,
    ProjectStatus,
    TransactionStatus,
    TransactionType,
    UserRole,
)


# ── Shared ─────────────────────────────────────────────────────────────────────

class UUIDModel(BaseModel):
    id: str


class TimestampModel(BaseModel):
    created_at: datetime
    updated_at: datetime


# ══════════════════════════════════════════════════════════════════════════════
# User schemas
# ══════════════════════════════════════════════════════════════════════════════

class UserBase(BaseModel):
    phone_number: str
    full_name: str
    email: Optional[EmailStr] = None
    whatsapp_name: Optional[str] = None
    role: UserRole = UserRole.freelancer

    @field_validator("phone_number")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        return validate_indian_phone(v)

    @field_validator("full_name", "whatsapp_name")
    @classmethod
    def sanitize_names(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return sanitize_text(v)


class UserCreate(UserBase):
    password: Optional[str] = Field(None, min_length=8)


class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=255)
    email: Optional[EmailStr] = None
    whatsapp_name: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    onboarding_complete: Optional[bool] = None


class UserRead(UUIDModel, TimestampModel, UserBase):
    is_verified: bool
    is_active: bool
    onboarding_complete: bool

    model_config = {"from_attributes": True}


class UserPublic(BaseModel):
    """Safe subset — never expose password_hash or internal flags."""
    id: str
    full_name: str
    whatsapp_name: Optional[str] = None
    role: UserRole

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════════════════════════════════════
# Project schemas
# ══════════════════════════════════════════════════════════════════════════════

class ProjectBase(BaseModel):
    title: str
    description: str
    deadline: Optional[date] = None

    @field_validator("title", "description")
    @classmethod
    def sanitize_project_text(cls, v: str) -> str:
        return sanitize_text(v, min_length=3)


class ProjectCreate(ProjectBase):
    freelancer_id: str
    client_id: str
    total_amount: Decimal = Field(..., gt=0, decimal_places=2)
    platform_fee_amount: Decimal = Field(..., ge=0, decimal_places=2)
    freelancer_payout_amount: Decimal = Field(..., ge=0, decimal_places=2)
    currency: str = "INR"


class ProjectUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=3, max_length=500)
    description: Optional[str] = None
    status: Optional[ProjectStatus] = None
    razorpay_order_id: Optional[str] = None
    razorpay_payment_id: Optional[str] = None
    escrow_held_at: Optional[datetime] = None
    deadline: Optional[date] = None
    auto_release_at: Optional[datetime] = None
    whatsapp_thread_id: Optional[str] = None


class ProjectRead(UUIDModel, TimestampModel, ProjectBase):
    freelancer_id: str
    client_id: str
    status: ProjectStatus
    total_amount: Decimal
    platform_fee_amount: Decimal
    freelancer_payout_amount: Decimal
    currency: str
    razorpay_order_id: Optional[str] = None
    escrow_held_at: Optional[datetime] = None
    auto_release_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════════════════════════════════════
# Milestone schemas
# ══════════════════════════════════════════════════════════════════════════════

class MilestoneBase(BaseModel):
    title: str
    description: str
    amount: Decimal
    sequence_number: int = Field(..., ge=1)

    @field_validator("title", "description")
    @classmethod
    def sanitize_milestone_text(cls, v: str) -> str:
        return sanitize_text(v, min_length=3)

    @field_validator("amount")
    @classmethod
    def validate_milestone_amount(cls, v: Decimal) -> Decimal:
        return validate_amount(v)


class MilestoneCreate(MilestoneBase):
    project_id: str


class MilestoneUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[MilestoneStatus] = None
    submitted_at: Optional[datetime] = None
    approved_at: Optional[datetime] = None
    released_at: Optional[datetime] = None
    razorpay_payout_id: Optional[str] = None


class MilestoneRead(UUIDModel, TimestampModel, MilestoneBase):
    project_id: str
    status: MilestoneStatus
    submitted_at: Optional[datetime] = None
    approved_at: Optional[datetime] = None
    released_at: Optional[datetime] = None
    razorpay_payout_id: Optional[str] = None

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════════════════════════════════════
# TrustScore schemas
# ══════════════════════════════════════════════════════════════════════════════

class TrustScoreCreate(BaseModel):
    user_id: str


class TrustScoreUpdate(BaseModel):
    score: Optional[Decimal] = Field(None, ge=0, le=100)
    total_projects: Optional[int] = Field(None, ge=0)
    completed_projects: Optional[int] = Field(None, ge=0)
    disputed_projects: Optional[int] = Field(None, ge=0)
    avg_delivery_days: Optional[Decimal] = None
    response_rate: Optional[Decimal] = Field(None, ge=0, le=100)
    last_calculated_at: Optional[datetime] = None


class TrustScoreRead(UUIDModel, TimestampModel):
    user_id: str
    score: Decimal
    total_projects: int
    completed_projects: int
    disputed_projects: int
    avg_delivery_days: Optional[Decimal] = None
    response_rate: Decimal
    last_calculated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════════════════════════════════════
# Dispute schemas
# ══════════════════════════════════════════════════════════════════════════════

class DisputeCreate(BaseModel):
    project_id: str
    milestone_id: Optional[str] = None
    raised_by_id: str
    reason: str
    evidence_urls: list[str] = Field(default_factory=list)

    @field_validator("reason")
    @classmethod
    def sanitize_dispute_reason(cls, v: str) -> str:
        return sanitize_text(v, min_length=20)


class DisputeUpdate(BaseModel):
    status: Optional[DisputeStatus] = None
    resolution_notes: Optional[str] = None
    resolved_by_id: Optional[str] = None
    resolved_at: Optional[datetime] = None
    evidence_urls: Optional[list[str]] = None


class DisputeRead(UUIDModel, TimestampModel):
    project_id: str
    milestone_id: Optional[str] = None
    raised_by_id: str
    status: DisputeStatus
    reason: str
    evidence_urls: list[str]
    resolution_notes: Optional[str] = None
    resolved_by_id: Optional[str] = None
    resolved_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════════════════════════════════════
# Transaction schemas
# ══════════════════════════════════════════════════════════════════════════════

class TransactionCreate(BaseModel):
    project_id: str
    milestone_id: Optional[str] = None
    transaction_type: TransactionType
    amount: Decimal
    razorpay_reference: Optional[str] = None
    status: TransactionStatus = TransactionStatus.pending
    metadata: dict = Field(default_factory=dict)

    @field_validator("amount")
    @classmethod
    def validate_tx_amount(cls, v: Decimal) -> Decimal:
        return validate_amount(v)


class TransactionUpdate(BaseModel):
    status: Optional[TransactionStatus] = None
    razorpay_reference: Optional[str] = None
    metadata: Optional[dict] = None


class TransactionRead(UUIDModel):
    project_id: str
    milestone_id: Optional[str] = None
    transaction_type: TransactionType
    amount: Decimal
    razorpay_reference: Optional[str] = None
    status: TransactionStatus
    metadata: dict
    created_at: datetime

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════════════════════════════════════
# MessengerSession schemas
# ══════════════════════════════════════════════════════════════════════════════

class MessengerSessionCreate(BaseModel):
    phone_number: str
    user_id: Optional[str] = None
    session_state: dict = Field(default_factory=dict)
    last_message_at: datetime
    expires_at: datetime


class MessengerSessionUpdate(BaseModel):
    user_id: Optional[str] = None
    session_state: Optional[dict] = None
    last_message_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None


class MessengerSessionRead(UUIDModel):
    phone_number: str
    user_id: Optional[str] = None
    session_state: dict
    last_message_at: datetime
    expires_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════════════════════════════════════
# Notification schemas
# ══════════════════════════════════════════════════════════════════════════════

class NotificationCreate(BaseModel):
    user_id: str
    type: NotificationType
    channel: NotificationChannel
    payload: dict = Field(default_factory=dict)


class NotificationUpdate(BaseModel):
    sent_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    read_at: Optional[datetime] = None


class NotificationRead(UUIDModel):
    user_id: str
    type: NotificationType
    channel: NotificationChannel
    payload: dict
    sent_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    read_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}
