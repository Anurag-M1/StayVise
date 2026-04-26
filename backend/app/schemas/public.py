from __future__ import annotations

from typing import Any, Dict, Optional
from pydantic import BaseModel, Field
from datetime import datetime
from app.db.models import SubmissionType

class SubmissionCreate(BaseModel):
    submission_type: SubmissionType
    payload: Dict[str, Any]

class SubmissionUpdate(BaseModel):
    status: str

class PublicSubmissionResponse(BaseModel):
    id: str
    submission_type: SubmissionType
    payload: Dict[str, Any]
    status: str
    created_at: datetime

    class Config:
        from_attributes = True
