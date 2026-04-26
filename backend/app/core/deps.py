"""
StayVise — FastAPI dependencies for auth, DB session, Redis.

Usage in any router::

    from app.core.deps import CurrentUser, DbSession

    @router.get("/me")
    async def me(user: CurrentUser, db: DbSession) -> UserResponse:
        ...
"""


from typing import Optional, Annotated

import redis.asyncio as aioredis
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from datetime import timezone, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import ForbiddenError, UnauthorizedError, NotFoundError
from app.core.security import decode_token, is_token_blacklisted
from app.db.models import User, UserSession, Project, UserRole
from app.db.session import get_db

# ── Re-export get_db for convenience ───────────────────────────────────────────
DbSession = Annotated[AsyncSession, Depends(get_db)]

# ── HTTP Bearer scheme ─────────────────────────────────────────────────────────
_bearer_scheme = HTTPBearer(auto_error=False)


# ── Redis dependency ───────────────────────────────────────────────────────────


async def get_redis(request: Request) -> aioredis.Redis:  # type: ignore[type-arg]
    """
    Return the application-scoped Redis client initialised in the lifespan.
    Falls back to creating a new short-lived client if the app hasn't started
    fully (e.g. during testing).
    """
    from app.main import get_redis as _app_get_redis  # noqa: PLC0415

    try:
        return _app_get_redis()
    except RuntimeError:
        # Testing / standalone scenario — create ad-hoc client
        return aioredis.from_url(
            str(settings.REDIS_URL),
            encoding="utf-8",
            decode_responses=True,
        )


RedisClient = Annotated[aioredis.Redis, Depends(get_redis)]  # type: ignore[type-arg]


# ── Auth dependencies ──────────────────────────────────────────────────────────


async def get_current_user(
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(_bearer_scheme)],
    db: DbSession,
    redis: RedisClient,
    request: Request,
) -> User:
    """
    Extract and validate the JWT from the Authorization header.
    Returns the User ORM object (fully loaded).

    Raises:
        UnauthorizedError: missing/invalid/expired token, or user not found.
    """
    if credentials is None:
        raise UnauthorizedError("Missing Authorization header.")

    token = credentials.credentials

    try:
        payload = decode_token(token, expected_type="access")
    except ValueError as exc:
        raise UnauthorizedError(str(exc)) from exc

    user_id: Optional[str] = payload.get("sub")
    session_id: Optional[str] = payload.get("sid")
    if user_id is None:
        raise UnauthorizedError("Token missing 'sub' claim.")
    if session_id is None:
        raise UnauthorizedError("Token missing session claim.")
    
    jti: Optional[str] = payload.get("jti")
    if jti and await is_token_blacklisted(redis, jti):
        raise UnauthorizedError("Token has been revoked.")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise UnauthorizedError("User no longer exists.")

    session_result = await db.execute(
        select(UserSession).where(
            UserSession.user_id == user_id,
            UserSession.session_id == session_id,
            UserSession.is_active.is_(True),
        )
    )
    session = session_result.scalar_one_or_none()
    if session is None:
        raise UnauthorizedError("Session is no longer active.")

    session.ip_address = session.ip_address or (request.client.host if request.client else None)
    db.add(session)

    # Inject user_id into request.state for logging middleware
    request.state.user_id = user_id

    return user


async def get_current_active_user(
    user: Annotated[User, Depends(get_current_user)],
) -> User:
    """
    Same as get_current_user but also checks is_active.
    Use this for endpoints that should reject deactivated accounts.
    """
    if not user.is_active:
        raise ForbiddenError("Your account has been deactivated.")
    return user


# ── Annotated aliases for routers ──────────────────────────────────────────────
CurrentUser = Annotated[User, Depends(get_current_active_user)]
CurrentUserAny = Annotated[User, Depends(get_current_user)]  # includes inactive


async def get_current_admin(
    user: Annotated[User, Depends(get_current_active_user)],
) -> User:
    """
    Restrict access to users with the 'admin' role.
    """
    from app.db.models import UserRole  # noqa: PLC0415
    if user.role != UserRole.admin:
        raise ForbiddenError("Administrative access required.")
    return user


AdminUser = Annotated[User, Depends(get_current_admin)]


# ── Project Access dependencies ────────────────────────────────────────────────

async def get_project_with_access(
    project_id: str,
    user: CurrentUser,
    db: DbSession,
) -> Project:
    """
    Dependency that fetches a project and verifies the current user
    is either the freelancer, the client, or an admin.
    """
    from app.core.validators import validate_uuid_str
    validate_uuid_str(project_id)

    result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()
    
    if project is None:
        raise NotFoundError("Project", project_id)
    
    # Ownership Check
    is_owner = user.id in (project.freelancer_id, project.client_id)
    is_admin = user.role == UserRole.admin
    
    if not is_owner and not is_admin:
        raise ForbiddenError("You do not have permission to access this project.")
        
    return project

ProjectWithAccess = Annotated[Project, Depends(get_project_with_access)]
