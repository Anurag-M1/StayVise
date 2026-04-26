"""
StayVise — Top-level API v1 router.
All feature routers are included here and exposed under /api/v1.
"""

from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.users import router as users_router
from app.api.v1.projects import router as projects_router
from app.api.v1.payments import router as payments_router
from app.api.v1.bank_accounts import router as bank_accounts_router
from app.api.v1.disputes import router as disputes_router
from app.api.v1.admin import router as admin_router
from app.api.v1.public import router as public_router
from app.api.v1.storage import router as storage_router
from app.api.v1.messaging_webhook import router as messaging_webhook_router

api_router = APIRouter()

# ── Mounted routers ────────────────────────────────────────────────────────────
api_router.include_router(auth_router,          prefix="/auth",      tags=["auth"])
api_router.include_router(users_router,         prefix="/users",     tags=["users"])
api_router.include_router(projects_router,      prefix="/projects",  tags=["projects"])
api_router.include_router(payments_router,      prefix="/payments",  tags=["payments"])
api_router.include_router(disputes_router,      prefix="/disputes",  tags=["disputes"])
api_router.include_router(admin_router,         prefix="/admin",     tags=["admin"])
api_router.include_router(bank_accounts_router, prefix="",           tags=["bank-accounts"])
api_router.include_router(public_router,        prefix="/public",     tags=["public"])
api_router.include_router(storage_router,       prefix="/storage",    tags=["storage"])
api_router.include_router(messaging_webhook_router, prefix="/webhook", tags=["webhooks"])


@api_router.get("/ping", tags=["ops"])
async def ping() -> dict[str, str]:
    """Lightweight ping — no DB/Redis check."""
    return {"pong": "StayVise API v1"}
