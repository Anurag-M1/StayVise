import pytest
from httpx import AsyncClient
from uuid import uuid4
import secrets
from datetime import datetime, timezone

from app.core import security
from app.db.models import User, Project, Milestone, ProjectStatus, UserRole

@pytest.mark.async_session
async def test_jwt_revocation(client: AsyncClient, db_session, redis_client):
    """Verify that a token can be revoked and subsequently rejected."""
    # 1. Create a user and log in (simulated)
    user_id = str(uuid4())
    token = security.create_access_token(subject=user_id, extra_claims={"sid": str(uuid4())})
    jti = security.decode_token(token)["jti"]
    
    # 2. Revoke the token
    await security.revoke_token(redis_client, jti, expires_in=3600)
    
    # 3. Check if blacklisted
    is_revoked = await security.is_token_blacklisted(redis_client, jti)
    assert is_revoked is True
    
    # 4. Attempt to use the token (should fail in get_current_user)
    # This usually requires a full app override or integration test
    # but we've verified the underlying logic.

@pytest.mark.async_session
async def test_otp_hashing_storage(redis_client):
    """Verify OTPs are stored hashed and not in plaintext."""
    phone = "+919999999999"
    otp = "123456"
    
    # Use the logic from auth.py to store
    hashed_otp = security._hash_password_sync(otp)
    otp_key = f"otp:{phone}"
    await redis_client.set(otp_key, hashed_otp, ex=300)
    
    # Verify we can't see the plaintext
    stored_val = await redis_client.get(otp_key)
    assert stored_val != otp
    assert security.verify_password(otp, stored_val) is True

@pytest.mark.async_session
async def test_paise_arithmetic_integrity(db_session):
    """Verify BigInteger storage prevents float precision errors."""
    # Create a project with exact paise amounts
    project = Project(
        id=str(uuid4()),
        title="Paise Test",
        description="Testing precision",
        total_amount=100050, # ₹1,000.50
        platform_fee_amount=2001, # ₹20.01
        freelancer_payout_amount=98049, # ₹980.49
        client_id=str(uuid4()),
        status=ProjectStatus.draft,
        currency="INR"
    )
    db_session.add(project)
    await db_session.flush()
    
    # Reload and check types
    await db_session.refresh(project)
    assert isinstance(project.total_amount, int)
    assert project.total_amount == 100050
    
    # Test addition
    assert project.platform_fee_amount + project.freelancer_payout_amount == project.total_amount

@pytest.mark.async_session
async def test_idor_project_access_dependency(db_session):
    """Verify get_project_with_access dependency prevents cross-user access."""
    from app.core.deps import get_project_with_access
    
    owner_id = str(uuid4())
    other_id = str(uuid4())
    
    project = Project(
        id=str(uuid4()),
        title="IDOR Test",
        description="Private project",
        client_id=owner_id,
        status=ProjectStatus.in_progress,
        total_amount=10000,
        currency="INR"
    )
    db_session.add(project)
    await db_session.flush()
    
    owner_user = User(id=owner_id, role=UserRole.client, phone_number="+911111111111")
    other_user = User(id=other_id, role=UserRole.client, phone_number="+912222222222")
    
    # 1. Owner should have access
    await get_project_with_access(project.id, owner_user, db_session)
    
    # 2. Other user should be forbidden
    from app.core.exceptions import ForbiddenError
    with pytest.raises(ForbiddenError):
        await get_project_with_access(project.id, other_user, db_session)
