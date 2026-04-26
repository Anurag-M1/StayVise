import logging
from typing import Optional, Any
from uuid import UUID

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AuditEvent

logger = logging.getLogger("stayvise.audit")

async def log_audit_event(
    db: AsyncSession,
    event_type: str,
    user_id: Optional[str | UUID] = None,
    resource_type: Optional[str] = None,
    resource_id: Optional[str | UUID] = None,
    metadata: Optional[dict[str, Any]] = None,
    request: Optional[Request] = None,
) -> None:
    """
    Log a security-sensitive event to the database and structured logs.
    """
    ip_address = None
    user_agent = None
    
    if request:
        ip_address = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent")
        # Handle proxy headers if applicable
        x_forwarded = request.headers.get("x-forwarded-for")
        if x_forwarded:
            ip_address = x_forwarded.split(",")[0].strip()

    event = AuditEvent(
        user_id=str(user_id) if user_id else None,
        event_type=event_type,
        resource_type=resource_type,
        resource_id=str(resource_id) if resource_id else None,
        event_metadata=metadata or {},
        ip_address=ip_address,
        user_agent=user_agent,
    )
    
    db.add(event)
    # We flush but don't commit here to allow the caller to manage the transaction
    await db.flush()
    
    logger.info(
        "Audit Event: %s | User: %s | Resource: %s:%s",
        event_type, user_id, resource_type, resource_id,
        extra={
            "audit": True,
            "ip": ip_address,
            "metadata": metadata
        }
    )
