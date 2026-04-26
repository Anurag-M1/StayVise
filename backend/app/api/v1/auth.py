"""
StayVise — Authentication API (Secure Access Link flow).

Endpoints
---------
  POST /auth/secure-access-link — generate & send link via email
  POST /auth/verify-secure-access — verify link and return JWT
  POST /auth/refresh              — refresh access token
  GET  /auth/me                   — return currently authenticated user
"""


import logging
import secrets
from datetime import timezone, datetime, timedelta
from uuid import uuid4

import bcrypt
import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import select

from app.core.config import settings
from app.core.deps import CurrentUser, DbSession, RedisClient
from app.core.audit_log import log_audit_event
from app.core.exceptions import OTPError, RateLimitError, UnauthorizedError
from app.core.security import create_access_token, create_refresh_token, decode_token
from app.core.validators import validate_indian_phone
from app.db.models import User, UserRole, UserSession
from app.schemas.user import (
    RefreshRequest,
    TokenResponse,
    UserResponse,
    AdminLoginRequest,
    SecureAccessRequest,
    SecureAccessVerify,
)

logger = logging.getLogger("stayvise.auth")

router = APIRouter()





# ══════════════════════════════════════════════════════════════════════════════
# POST /auth/secure-access-link
# ══════════════════════════════════════════════════════════════════════════════


@router.post(
    "/secure-access-link",
    summary="Request a secure access link via email",
    status_code=202,
)
async def request_secure_access_link(
    body: SecureAccessRequest,
    redis: RedisClient,
) -> dict[str, str]:
    """
    Generate and email a secure access login link.
    """
    from app.core.security import create_secure_access_token  # noqa: PLC0415
    from app.services.email import secure_access_service  # noqa: PLC0415
    from app.core.validators import validate_indian_phone # noqa: PLC0415

    email = body.email.lower()
    
    # Validate phone if provided
    phone = None
    if body.phone_number:
        try:
            phone = validate_indian_phone(body.phone_number)
        except Exception:
            # If invalid phone provided, we just ignore it for now or we could raise error
            # For strictness, let's raise error
            raise ValueError("Invalid phone number provided.")

    token = create_secure_access_token(email, phone_number=phone)
    
    # URL to our frontend verify page
    frontend_url = str(settings.FRONTEND_URL).rstrip('/')
    link = f"{frontend_url}/verify-link?token={token}"
    
    await secure_access_service.send_secure_access_link(email, link)
    
    return {"message": "If that email exists, a secure access link has been sent."}


# ══════════════════════════════════════════════════════════════════════════════
# POST /auth/verify-secure-access
# ══════════════════════════════════════════════════════════════════════════════


@router.post(
    "/verify-secure-access",
    response_model=TokenResponse,
    summary="Verify secure access link token and authenticate",
)
async def verify_secure_access(
    body: SecureAccessVerify,
    db: DbSession,
    request: Request,
    response: Response,
) -> TokenResponse:
    """
    Verify the secure access JWT. Log in or create user.
    """
    from app.core.security import decode_token  # noqa: PLC0415
    import traceback

    try:
        try:
            payload = decode_token(body.token, expected_type="secure_access")
        except ValueError as exc:
            logger.error("Secure access verification failed for token: %s", exc)
            raise UnauthorizedError(f"Invalid or expired link: {exc}") from exc

        email = payload.get("sub")
        phone_from_token = payload.get("phone")
        if not email:
            raise UnauthorizedError("Token payload missing email.")

        # Get user by email
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        is_new_user = False

        if user is None:
            # Create new user
            role = UserRole.freelancer
            if email in settings.ADMIN_EMAILS:
                role = UserRole.admin
                logger.info("Auto-promoting %s to admin based on whitelist", email)

            default_name = "Anurag" if email in settings.ADMIN_EMAILS else (email.split("@")[0].capitalize() if email else "User")
            
            # Check if phone is already taken by someone ELSE
            if phone_from_token:
                phone_check = await db.execute(select(User).where(User.phone_number == phone_from_token))
                if phone_check.scalar_one_or_none():
                    # Conflict: phone exists with different email. 
                    # We proceed without binding phone for safety, or we could error.
                    # As per plan, we notify but don't bind.
                    logger.warning("Account binding skipped: Phone %s already belongs to another account.", phone_from_token)
                    phone_from_token = None

            user = User(
                email=email,
                full_name=body.full_name or default_name,
                phone_number=phone_from_token,
                role=role,
                is_verified=True,
            )
            db.add(user)
            await db.flush()
            await db.refresh(user)
            is_new_user = True
            logger.info("New user created via secure access link: %s (role=%s, phone=%s)", email, role, phone_from_token)
        else:
            # Existing user - check for binding
            if phone_from_token and not user.phone_number:
                # Attempt to bind
                phone_check = await db.execute(select(User).where(User.phone_number == phone_from_token))
                if phone_check.scalar_one_or_none():
                    logger.warning("Account binding skipped for existing user %s: Phone %s already taken.", email, phone_from_token)
                else:
                    user.phone_number = phone_from_token
                    logger.info("Bound phone %s to existing user %s", phone_from_token, email)
            
            # Existing user admin promotion
            if email in settings.ADMIN_EMAILS:
                if user.role != UserRole.admin:
                    user.role = UserRole.admin
                if user.full_name != "Anurag":
                    user.full_name = "Anurag"
                
                db.add(user)
                await db.flush()
                await db.refresh(user)

            if not user.is_verified:
                user.is_verified = True
                db.add(user)
                await db.flush()
                await db.refresh(user)
            logger.info("User authenticated via secure access link: %s", email)

    except Exception as exc:
        logger.error("UNEXPECTED AUTH ERROR: %s\n%s", exc, traceback.format_exc())
        raise

    # Issue standard tokens
    # Enforce concurrent session limit (max 5)
    active_sessions_result = await db.execute(
        select(UserSession)
        .where(UserSession.user_id == user.id, UserSession.is_active == True)
        .order_by(UserSession.created_at.asc())
    )
    active_sessions = active_sessions_result.scalars().all()
    if len(active_sessions) >= 5:
        # Revoke oldest session(s)
        to_revoke = len(active_sessions) - 4
        for i in range(to_revoke):
            old_sess = active_sessions[i]
            old_sess.is_active = False
            db.add(old_sess)
            logger.info("Revoking oldest session %s for user %s (limit 5 exceeded)", old_sess.session_id, user.id)
        await db.flush()

    session_id = str(uuid4())
    session = UserSession(
        user_id=user.id,
        session_id=session_id,
        device_info=request.headers.get("user-agent"),
        ip_address=(request.client.host if request.client else None),
        location=request.headers.get("x-forwarded-for"),
        last_active_at=datetime.now(timezone.utc),
        is_active=True,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    extra_claims = {
        "role": user.role.value, 
        "phone": user.phone_number, 
        "sid": session_id,
        "email": user.email
    }
    access_token = create_access_token(user.id, extra_claims=extra_claims)
    refresh_token = create_refresh_token(user.id, extra_claims=extra_claims)

    await log_audit_event(
        db, "login_secure_access", user_id=user.id, request=request,
        metadata={"email": email, "is_new_user": is_new_user}
    )

    # ── Set Refresh Token in httpOnly Cookie ───────────────────────────────────
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=settings.ENVIRONMENT != "development",
        samesite="lax",
        max_age=1440 * 60,  # 24 hours
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse.model_validate(user),
        is_new_user=is_new_user,
    )


# Password-based admin login removed for security. 
# Admins must now use Secure Access Links via /auth/secure-access-link.


# ══════════════════════════════════════════════════════════════════════════════
# POST /auth/refresh
# ══════════════════════════════════════════════════════════════════════════════


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Refresh access token",
    status_code=200,
)
async def refresh_token(
    body: RefreshRequest,
    db: DbSession,
    request: Request,
    response: Response,
) -> TokenResponse:
    """
    Issue a fresh access token using a valid refresh token.
    """
    try:
        payload = decode_token(body.refresh_token, expected_type="refresh")
    except ValueError as exc:
        raise UnauthorizedError(str(exc)) from exc

    user_id = payload.get("sub")
    session_id = payload.get("sid")
    if not user_id or not session_id:
        raise UnauthorizedError("Refresh token missing required claims.")

    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if user is None:
        raise UnauthorizedError("User no longer exists.")

    session_result = await db.execute(
        select(UserSession).where(
            UserSession.user_id == user.id,
            UserSession.session_id == session_id,
            UserSession.is_active.is_(True),
        )
    )
    session = session_result.scalar_one_or_none()
    if session is None:
        raise UnauthorizedError("Session is no longer active.")

    session.ip_address = session.ip_address or (request.client.host if request.client else None)
    db.add(session)
    await db.commit()
    await db.refresh(session)

    extra_claims = {"role": user.role.value, "phone": user.phone_number, "sid": session_id}
    access_token = create_access_token(
        subject=user.id,
        extra_claims=extra_claims,
    )
    refresh_token_value = create_refresh_token(
        subject=user.id,
        extra_claims=extra_claims,
    )

    await log_audit_event(
        db, "token_refresh", user_id=user.id, request=request,
        metadata={"session_id": session_id}
    )

    # ── Set Refresh Token in httpOnly Cookie ───────────────────────────────────
    response.set_cookie(
        key="refresh_token",
        value=refresh_token_value,
        httponly=True,
        secure=settings.ENVIRONMENT != "development",
        samesite="lax",
        max_age=1440 * 60,  # 24 hours
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token_value,
        user=UserResponse.model_validate(user),
        is_new_user=False,
    )


# ══════════════════════════════════════════════════════════════════════════════
# POST /auth/logout
# ══════════════════════════════════════════════════════════════════════════════


@router.post("/logout", summary="Sign out from current session")
async def logout(
    request: Request,
    response: Response,
    db: DbSession,
    user: CurrentUser,
):
    """
    Deactivate current session and clear cookies.
    """
    from app.core.security import decode_token
    auth_header = request.headers.get("authorization", "")
    token = auth_header.replace("Bearer ", "").strip()
    
    if token:
        try:
            payload = decode_token(token, expected_type="access")
            sid = payload.get("sid")
            if sid:
                result = await db.execute(
                    sa.select(UserSession).where(UserSession.session_id == sid)
                )
                session = result.scalar_one_or_none()
                if session:
                    session.is_active = False
                    db.add(session)
                    await db.commit()
                    logger.info("Session %s logged out for user %s", sid, user.id)
        except Exception as exc:
            logger.warning("Logout session deactivation failed: %s", exc)

    response.delete_cookie(key="refresh_token")
    return {"status": "success"}


# ══════════════════════════════════════════════════════════════════════════════
# POST /auth/logout-all
# ══════════════════════════════════════════════════════════════════════════════


@router.post("/logout-all", summary="Sign out from all sessions")
async def logout_all(
    request: Request,
    response: Response,
    db: DbSession,
    user: CurrentUser,
):
    """
    Deactivate ALL sessions for the user and clear cookies.
    """
    from sqlalchemy import update
    stmt = (
        update(UserSession)
        .where(UserSession.user_id == user.id, UserSession.is_active.is_(True))
        .values(is_active=False)
    )
    await db.execute(stmt)
    await db.commit()
    
    response.delete_cookie(key="refresh_token")
    logger.info("User %s signed out from all sessions", user.id)
    return {"status": "success"}


# ══════════════════════════════════════════════════════════════════════════════
# GET /auth/me
# ══════════════════════════════════════════════════════════════════════════════


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get current authenticated user",
    status_code=200,
)
async def me(user: CurrentUser) -> UserResponse:
    """Return the profile of the currently authenticated user."""
    return UserResponse.model_validate(user)
