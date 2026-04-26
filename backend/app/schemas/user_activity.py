from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict


class ActivityItem(BaseModel):
    """
    Unified activity feed item for the dashboard.
    Derived from Transactions and Project events.
    """
    model_config = ConfigDict(from_attributes=True)

    id: str
    type: str  # 'payment_received', 'payment_funded', 'milestone_submitted', etc.
    title: str
    description: str
    amount: Optional[Decimal] = None
    created_at: datetime
    project_id: str
    status: str


class ActivityListResponse(BaseModel):
    """Paginated activity feed."""
    items: list[ActivityItem]
    next_cursor: Optional[datetime] = None
    limit: int
