from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, ConfigDict

from app.schemas.project import DisputeResponse


class AdminDashboardStats(BaseModel):
    """Row 1 metrics for the admin overview."""
    total_users: int
    total_projects: int
    total_volume: Decimal
    total_open_disputes: int
    disputes_severity: str  # "low", "amber", "danger"


class DailyVolumeChartPoint(BaseModel):
    date: str
    volume: Decimal


class ProjectStatusPoint(BaseModel):
    status: str
    count: int


class AdminDashboardCharts(BaseModel):
    """Row 2 charts data."""
    daily_volume: List[DailyVolumeChartPoint]
    status_breakdown: List[ProjectStatusPoint]


class AdminAlert(BaseModel):
    id: str
    severity: str  # "red", "amber", "green"
    message: str
    timestamp: datetime


class AdminOverviewResponse(BaseModel):
    stats: AdminDashboardStats
    charts: AdminDashboardCharts
    alerts: List[AdminAlert]
    active_disputes: List[DisputeResponse]


class DisputeResolutionRequest(BaseModel):
    """PUT /admin/disputes/{id}/resolve"""
    freelancer_payout_pct: int  # 0 to 100
    resolution_notes: str


class AdminUserUpdate(BaseModel):
    """PATCH /admin/users/{id}"""
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone_number: Optional[str] = None
    username: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    is_verified: Optional[bool] = None
    is_active: Optional[bool] = None
    role: Optional[str] = None
    billing_plan: Optional[str] = None
    trust_score_override: Optional[Decimal] = None


class SystemSettingsRead(BaseModel):
    escrow_fee_percent: Decimal
    maintenance_mode: bool
    auto_release_days: int
    allow_new_registrations: bool
    updated_at: datetime


class SystemSettingsUpdate(BaseModel):
    escrow_fee_percent: Optional[Decimal] = None
    maintenance_mode: Optional[bool] = None
    auto_release_days: Optional[int] = None
    allow_new_registrations: Optional[bool] = None


class AdminTransactionResponse(BaseModel):
    id: str
    project_id: str
    milestone_id: Optional[str]
    transaction_type: str
    amount: Decimal
    status: str
    created_at: datetime
    razorpay_reference: Optional[str]
    project_title: Optional[str] = None
    milestone_title: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class AdminTransactionSummary(BaseModel):
    """Ledger header metrics."""
    platform_reserve: Decimal
    total_fees_collected: Decimal
    failed_threshold_pct: float


class AdminNotificationResponse(BaseModel):
    """Unified notification item for the admin shell."""
    id: str
    type: str  # "dispute", "submission"
    title: str
    message: str
    target_url: str
    severity: str
    status: str
    timestamp: datetime
