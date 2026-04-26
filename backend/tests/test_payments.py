"""
StayVise — Payment & Escrow tests (10 tests).

Groups:
  1. Signature verification (2 tests)
  2. Payment flow & state transitions (3 tests)
  3. Auto-release logic (2 tests)
  4. Refund eligibility (2 tests)
  5. Razorpay webhook (1 test)

All Razorpay HTTP calls are mocked with unittest.mock.
"""

from __future__ import annotations

import hashlib
import hmac
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient

from app.core.config import settings
from app.db.models import (
    Milestone,
    MilestoneStatus,
    Project,
    ProjectStatus,
    Transaction,
    TransactionType,
    User,
    UserRole,
)
from app.services.payment import PaymentService, payment_service
from tests.conftest import auth_headers, create_user_and_get_token


# ── Helpers ────────────────────────────────────────────────────────────────────

FREELANCER_PHONE = "+917100000001"
CLIENT_PHONE = "+917100000002"


def _make_signature(order_id: str, payment_id: str) -> str:
    """Generate a valid HMAC-SHA256 signature like Razorpay would."""
    message = f"{order_id}|{payment_id}"
    return hmac.new(
        settings.RAZORPAY_KEY_SECRET.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


import random

async def _create_test_project(db_session) -> tuple[Project, User, User]:
    """Create a project with a freelancer, client, and milestone in the DB."""
    # Generate unique phones so tests can run in parallel / multiple times without truncation issues
    f_phone = f"+9171{random.randint(1000000, 9999999)}"
    c_phone = f"+9172{random.randint(1000000, 9999999)}"

    freelancer = User(
        phone_number=f_phone,
        full_name="Test Freelancer",
        role=UserRole.freelancer,
        is_verified=True,
        razorpay_fund_account_id="fa_test123",
    )
    db_session.add(freelancer)
    await db_session.flush()
    await db_session.refresh(freelancer)

    client_user = User(
        phone_number=c_phone,
        full_name="Test Client",
        role=UserRole.client,
        is_verified=True,
    )
    db_session.add(client_user)
    await db_session.flush()
    await db_session.refresh(client_user)

    project = Project(
        title="Test Project",
        description="A test project for payments",
        freelancer_id=freelancer.id,
        client_id=client_user.id,
        status=ProjectStatus.draft,
        total_amount=Decimal("10000.00"),
        platform_fee_amount=Decimal("200.00"),
        freelancer_payout_amount=Decimal("9800.00"),
        currency="INR",
    )
    db_session.add(project)
    await db_session.flush()
    await db_session.refresh(project)

    milestone = Milestone(
        project_id=project.id,
        title="Milestone 1",
        description="First milestone",
        amount=Decimal("10000.00"),
        sequence_number=1,
        status=MilestoneStatus.pending,
    )
    db_session.add(milestone)
    await db_session.flush()
    await db_session.refresh(milestone)

    return project, freelancer, client_user


# ══════════════════════════════════════════════════════════════════════════════
# 1. Signature verification
# ══════════════════════════════════════════════════════════════════════════════


def test_signature_verification_valid() -> None:
    """Valid HMAC signature should return True."""
    service = PaymentService()
    order_id = "order_testABC123"
    payment_id = "pay_testXYZ789"
    sig = _make_signature(order_id, payment_id)

    assert service.verify_payment_signature(order_id, payment_id, sig) is True


def test_signature_verification_tampered() -> None:
    """Tampered signature should return False."""
    service = PaymentService()
    order_id = "order_testABC123"
    payment_id = "pay_testXYZ789"
    sig = _make_signature(order_id, payment_id)

    # Tamper with the signature
    tampered = sig[:-4] + "0000"
    assert service.verify_payment_signature(order_id, payment_id, tampered) is False

    # Tamper with the payment_id
    assert service.verify_payment_signature(order_id, "pay_TAMPERED", sig) is False


# ══════════════════════════════════════════════════════════════════════════════
# 2. Payment flow & state transitions
# ══════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_create_payment_order(db_session) -> None:
    """create_payment_order should call Razorpay and update project status."""
    project, freelancer, client_user = await _create_test_project(db_session)

    mock_response = MagicMock(
        status_code=200,
        json=lambda: {
            "id": "order_mock123",
            "amount": 1020000,
            "currency": "INR",
            "status": "created",
        },
    )

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_response):
        result = await payment_service.create_payment_order(str(project.id), db_session)

    assert result["order_id"] == "order_mock123"
    assert result["amount"] == 1020000  # (10000 + 200) * 100
    assert result["key_id"] == settings.RAZORPAY_KEY_ID

    # Project should now be awaiting_payment
    await db_session.refresh(project)
    assert project.status == ProjectStatus.awaiting_payment
    assert project.razorpay_order_id == "order_mock123"


@pytest.mark.asyncio
async def test_confirm_payment_transitions_to_in_progress(db_session) -> None:
    """confirm_payment_received should transition project to in_progress."""
    project, freelancer, client_user = await _create_test_project(db_session)

    # Set project to awaiting_payment with an order
    project.status = ProjectStatus.awaiting_payment
    project.razorpay_order_id = "order_confirm123"
    db_session.add(project)
    await db_session.flush()

    order_id = "order_confirm123"
    payment_id = "pay_confirm456"
    sig = _make_signature(order_id, payment_id)

    # Mock Razorpay payment fetch
    mock_payment = MagicMock(
        status_code=200,
        json=lambda: {
            "id": payment_id,
            "amount": 1020000,
            "currency": "INR",
            "status": "captured",
        },
    )

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock, return_value=mock_payment), \
         patch("app.services.payment.PaymentService._notify_payment_confirmed", new_callable=AsyncMock):
        result = await payment_service.confirm_payment_received(
            order_id, payment_id, sig, db_session
        )

    assert result.status == ProjectStatus.in_progress
    assert result.razorpay_payment_id == payment_id
    assert result.escrow_held_at is not None

    # Transaction should be created
    from sqlalchemy import select
    tx_result = await db_session.execute(
        select(Transaction).where(
            Transaction.project_id == project.id,
            Transaction.transaction_type == TransactionType.escrow_hold,
        )
    )
    tx = tx_result.scalar_one_or_none()
    assert tx is not None
    assert tx.razorpay_reference == payment_id


@pytest.mark.asyncio
async def test_confirm_payment_invalid_signature(db_session) -> None:
    """Invalid signature should raise PaymentError."""
    from app.core.exceptions import PaymentError

    project, _, _ = await _create_test_project(db_session)
    project.status = ProjectStatus.awaiting_payment
    project.razorpay_order_id = "order_badsig"
    db_session.add(project)
    await db_session.flush()

    with pytest.raises(PaymentError, match="signature verification failed"):
        await payment_service.confirm_payment_received(
            "order_badsig", "pay_test", "invalid_signature_here", db_session
        )


# ══════════════════════════════════════════════════════════════════════════════
# 3. Auto-release logic
# ══════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_auto_release_submitted_milestone(db_session) -> None:
    """Auto-release should release a submitted milestone."""
    project, freelancer, _ = await _create_test_project(db_session)
    project.status = ProjectStatus.in_progress
    db_session.add(project)

    # Get the milestone and mark as submitted
    from sqlalchemy import select
    ms_result = await db_session.execute(
        select(Milestone).where(Milestone.project_id == project.id)
    )
    milestone = ms_result.scalar_one()
    milestone.status = MilestoneStatus.submitted
    milestone.submitted_at = datetime.now(UTC)
    db_session.add(milestone)
    await db_session.flush()

    # Mock the RazorpayX payout call
    mock_payout = MagicMock(
        status_code=200,
        json=lambda: {
            "id": "pout_auto123",
            "status": "processed",
            "utr": "UTR123456",
        },
    )

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_payout), \
         patch("app.services.payment.PaymentService._notify_payment_released", new_callable=AsyncMock):
        await payment_service.process_auto_release(str(milestone.id), db_session)

    await db_session.refresh(milestone)
    assert milestone.status == MilestoneStatus.released
    assert milestone.razorpay_payout_id == "pout_auto123"


@pytest.mark.asyncio
async def test_auto_release_skips_already_approved(db_session) -> None:
    """Auto-release should skip milestones that are already approved."""
    project, _, _ = await _create_test_project(db_session)
    project.status = ProjectStatus.in_progress
    db_session.add(project)

    from sqlalchemy import select
    ms_result = await db_session.execute(
        select(Milestone).where(Milestone.project_id == project.id)
    )
    milestone = ms_result.scalar_one()
    milestone.status = MilestoneStatus.approved
    milestone.approved_at = datetime.now(UTC)
    db_session.add(milestone)
    await db_session.flush()

    # Should NOT call release_milestone_payment
    with patch.object(payment_service, "release_milestone_payment", new_callable=AsyncMock) as mock_release:
        await payment_service.process_auto_release(str(milestone.id), db_session)

    mock_release.assert_not_called()


# ══════════════════════════════════════════════════════════════════════════════
# 4. Refund eligibility
# ══════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_refund_before_work_started(db_session) -> None:
    """Refund should work for awaiting_payment projects."""
    project, _, _ = await _create_test_project(db_session)
    project.status = ProjectStatus.awaiting_payment
    project.razorpay_payment_id = "pay_refund1"
    db_session.add(project)
    await db_session.flush()

    mock_refund = MagicMock(
        status_code=200,
        json=lambda: {
            "id": "rfnd_test123",
            "amount": 1020000,
            "status": "processed",
        },
    )

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_refund):
        result = await payment_service.handle_refund(
            str(project.id), "Client changed their mind about the project", db_session
        )

    assert result["id"] == "rfnd_test123"
    await db_session.refresh(project)
    assert project.status == ProjectStatus.cancelled


@pytest.mark.asyncio
async def test_refund_blocked_after_milestone_released(db_session) -> None:
    """Refund should fail if any milestone is already released."""
    from app.core.exceptions import ValidationError

    project, _, _ = await _create_test_project(db_session)
    project.status = ProjectStatus.in_progress
    project.razorpay_payment_id = "pay_refund2"
    db_session.add(project)

    from sqlalchemy import select
    ms_result = await db_session.execute(
        select(Milestone).where(Milestone.project_id == project.id)
    )
    milestone = ms_result.scalar_one()
    milestone.status = MilestoneStatus.released
    milestone.released_at = datetime.now(UTC)
    db_session.add(milestone)
    await db_session.flush()

    with pytest.raises(ValidationError, match="already released"):
        await payment_service.handle_refund(
            str(project.id), "Want my money back please now", db_session
        )


# ══════════════════════════════════════════════════════════════════════════════
# 5. Razorpay webhook
# ══════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_razorpay_webhook_signature_verification(client: AsyncClient) -> None:
    """POST /webhook/razorpay with invalid signature should return 403."""
    payload = '{"event": "payment.captured", "payload": {}}'

    resp = await client.post(
        "/api/v1/webhook/razorpay",
        content=payload.encode(),
        headers={
            "Content-Type": "application/json",
            "X-Razorpay-Signature": "definitely_not_valid",
        },
    )
    assert resp.status_code == 403
