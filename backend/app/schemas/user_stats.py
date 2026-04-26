from __future__ import annotations

from decimal import Decimal
from pydantic import BaseModel, ConfigDict

class UserStatsResponse(BaseModel):
    """Financial and project overview for the dashboard."""
    model_config = ConfigDict(from_attributes=True)

    escrow_balance: Decimal = Decimal("0.00")
    total_released: Decimal = Decimal("0.00")
    total_earned: Decimal = Decimal("0.00")
    total_spent: Decimal = Decimal("0.00")
    active_projects: int = 0
    total_projects: int = 0
    pending_actions: int = 0
