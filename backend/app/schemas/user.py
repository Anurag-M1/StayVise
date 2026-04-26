from __future__ import annotations
"""
StayVise — User & auth Pydantic schemas (Pydantic v2).

All response models use ``model_config = ConfigDict(from_attributes=True)``
so they can be constructed directly from SQLAlchemy ORM objects.
"""


import re
from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.db.models import UserRole

from app.core.validators import validate_indian_phone

# ══════════════════════════════════════════════════════════════════════════════


# ══════════════════════════════════════════════════════════════════════════════
# Auth base schemas
# ══════════════════════════════════════════════════════════════════════════════


class AdminLoginRequest(BaseModel):
    """POST /auth/admin-login"""
    email: str = Field(..., description="Admin email address")
    password: str = Field(..., description="Admin password")


class SecureAccessRequest(BaseModel):
    """POST /auth/magic-link"""
    email: EmailStr = Field(..., description="Email address to send the link to")
    phone_number: Optional[str] = Field(None, description="Optional phone number to bind to the account")


class SecureAccessVerify(BaseModel):
    """POST /auth/verify-magic-link"""
    token: str = Field(..., description="The token from the secure access link")
    full_name: Optional[str] = Field(
        None,
        min_length=2,
        max_length=255,
        description="Required for new users.",
    )




# ══════════════════════════════════════════════════════════════════════════════
# User dependency schemas (defined early for forward ref safety)
# ══════════════════════════════════════════════════════════════════════════════


class TrustScoreResponse(BaseModel):
    """Nested in UserWithTrustScore and UserPublicProfile."""

    model_config = ConfigDict(from_attributes=True)

    score: Decimal
    total_projects: int
    completed_projects: int
    disputed_projects: int
    avg_delivery_days: Optional[Decimal] = None
    response_rate: Decimal
    last_calculated_at: Optional[datetime] = None


class RecentProject(BaseModel):
    """Anonymized project data for public profiles."""

    id: str
    category: str
    anonymized_title: str
    amount_min: Decimal
    amount_max: Decimal
    duration_days: int
    milestone_count: int
    completed_at: datetime


class PlanLimits(BaseModel):
    """Structured plan limits returned with billing summary."""

    max_active_projects: int = 1
    escrow_fee_percent: float = 2.0
    has_priority_disputes: bool = False
    has_verified_badge: bool = False
    has_gst_invoices: bool = False
    has_custom_url: bool = False


# ══════════════════════════════════════════════════════════════════════════════
# User Response models
# ══════════════════════════════════════════════════════════════════════════════


class UserResponse(BaseModel):
    """Full user profile — returned to the authenticated user only."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    unique_id: str
    phone_number: Optional[str] = None
    full_name: str
    email: Optional[str] = None
    username: Optional[str] = None
    role: UserRole
    is_verified: bool
    is_active: bool
    onboarding_complete: bool
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    notification_prefs: Optional[dict] = Field(default_factory=dict)
    payout_details: Optional[dict] = Field(default_factory=dict)
    billing_plan: str = "free"
    active_sessions_count: int = 0
    created_at: datetime
    updated_at: datetime


class UserWithTrustScore(UserResponse):
    """GET /users/me — user profile with nested trust score."""

    model_config = ConfigDict(from_attributes=True)

    trust_score: Optional[TrustScoreResponse] = None


class UserPublicProfile(BaseModel):
    """
    GET /users/{user_id}/profile — PUBLIC profile.
    Only safe, non-personal fields. No phone, email, or internal flags.
    """

    model_config = ConfigDict(from_attributes=True)

    id: str
    unique_id: str
    full_name: str
    username: Optional[str] = None
    role: UserRole
    created_at: datetime
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    trust_score: Optional[TrustScoreResponse] = None
    total_secured_amount: Decimal = Decimal("0.00")
    badges: list[str] = Field(default_factory=list)
    recent_projects: list[RecentProject] = Field(default_factory=list)


class TokenResponse(BaseModel):
    """Response from /auth/verify-secure-access and /auth/refresh."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: "UserResponse"
    is_new_user: bool = False


# ══════════════════════════════════════════════════════════════════════════════
# Supporting models
# ══════════════════════════════════════════════════════════════════════════════


class UserCreate(BaseModel):
    """Internal schema—NOT exposed as API input."""

    phone_number: str
    full_name: str = Field(..., min_length=2, max_length=255)
    email: Optional[EmailStr] = None
    role: UserRole = UserRole.freelancer
    password: Optional[str] = Field(None, min_length=8)

    @field_validator("phone_number")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        return validate_indian_phone(v)


class UserUpdate(BaseModel):
    """PUT /users/me — mutable profile fields."""

    full_name: Optional[str] = Field(None, min_length=2, max_length=255)
    email: Optional[EmailStr] = None
    username: Optional[str] = Field(None, min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9._]+$")
    bio: Optional[str] = Field(None, max_length=1000)
    avatar_url: Optional[str] = None


class OnboardingComplete(BaseModel):
    """POST /users/me/complete-onboarding"""
    role: UserRole = Field(..., description="Primary role: freelancer or client.")


class UserLookupItem(BaseModel):
    """Minimal user payload for phone-based lookups."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    unique_id: str
    full_name: str
    phone_number: str
    username: Optional[str] = None
    avatar_url: Optional[str] = None
    role: UserRole
    is_verified: bool
    trust_score: Optional[TrustScoreResponse] = None


class UserLookupResponse(BaseModel):
    """Response for checking phone number existence."""

    exists: bool
    user: Optional[UserLookupItem] = None


class UserSessionResponse(BaseModel):
    """Active session metadata."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    session_id: str
    device_info: Optional[str] = None
    ip_address: Optional[str] = None
    location: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    last_active_at: datetime
    is_active: bool


class BillingSummaryResponse(BaseModel):
    """GET /users/me/billing — role-aware subscription state."""

    role: UserRole
    billing_plan: str
    is_subscription_active: bool
    renewal_date: Optional[datetime] = None
    features: list[str] = Field(default_factory=list)
    summary: str
    plan_limits: PlanLimits = Field(default_factory=PlanLimits)


class BillingPlanUpdate(BaseModel):
    """PUT /users/me/billing"""
    billing_plan: Literal["free", "premium", "pro"]


class NotificationPrefsUpdate(BaseModel):
    """PUT /users/me/notifications"""

    project_updates: bool = True
    payment_alerts: bool = True
    reminders: bool = True
    weekly_summary: bool = False
    email_monthly_statement: bool = False
    email_security_alerts: bool = True
    quiet_hours_enabled: bool = False
    quiet_hours_start: str = "22:00"
    quiet_hours_end: str = "08:00"


class SubscribeRequest(BaseModel):
    """POST /users/me/billing/subscribe"""
    plan: str = "pro"


class VerifySubscriptionRequest(BaseModel):
    """POST /users/me/billing/verify-subscription"""
    razorpay_subscription_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class RefreshRequest(BaseModel):
    """POST /auth/refresh"""
    refresh_token: str


# ── Final rebuild ──────────────────────────────────────────────────────────────
TokenResponse.model_rebuild()
UserWithTrustScore.model_rebuild()
UserPublicProfile.model_rebuild()
UserLookupItem.model_rebuild()
UserUpdate.model_rebuild()
