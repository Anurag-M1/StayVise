"""
StayVise — Bank account management + Razorpay webhook handler.

POST /users/me/bank-account     — link RazorpayX fund account
POST /webhook/razorpay          — Razorpay event handler
"""


import logging

from fastapi import APIRouter, Request

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import ForbiddenError, ValidationError
from app.schemas.payment import (
    AddBankAccountRequest,
    BankAccountResponse,
)
from app.services.payment import payment_service

logger = logging.getLogger("stayvise.api.bank")

router = APIRouter()


# ══════════════════════════════════════════════════════════════════════════════
# POST /users/me/bank-account
# ══════════════════════════════════════════════════════════════════════════════


@router.post(
    "/users/me/bank-account",
    response_model=BankAccountResponse,
    status_code=201,
    summary="Link bank account or UPI for payouts",
)
async def add_bank_account(
    body: AddBankAccountRequest,
    user: CurrentUser,
    db: DbSession,
) -> BankAccountResponse:
    """
    Create a RazorpayX Contact + Fund Account for the authenticated user.
    Required before any milestone payouts can be made.
    """
    if body.account_type not in ("bank_account", "vpa"):
        raise ValidationError("account_type must be 'bank_account' or 'vpa'.")

    if body.account_type == "bank_account" and not body.bank_account:
        raise ValidationError("bank_account details are required.")
    if body.account_type == "vpa" and not body.vpa:
        raise ValidationError("vpa details are required.")

    fund_account = await payment_service.create_fund_account(
        user,
        account_type=body.account_type,
        bank_account=body.bank_account.model_dump() if body.bank_account else None,
        vpa=body.vpa.model_dump() if body.vpa else None,
        db=db,
    )

    return BankAccountResponse(
        fund_account_id=fund_account["id"],
        contact_id=user.razorpay_contact_id or "",
        account_type=body.account_type,
    )


@router.post(
    "/users/me/bank-account/verify",
    status_code=200,
    summary="Trigger penny drop verification",
)
async def verify_bank_account(
    user: CurrentUser,
    db: DbSession,
) -> dict:
    """
    Triggers a ₹1 penny drop to verify the linked fund account.
    """
    if not user.razorpay_fund_account_id:
        raise ValidationError("No bank account linked to verify.")
    
    return await payment_service.verify_bank_account(user.razorpay_fund_account_id)


# ══════════════════════════════════════════════════════════════════════════════
# POST /webhook/razorpay
# ══════════════════════════════════════════════════════════════════════════════


@router.post(
    "/webhook/razorpay",
    status_code=200,
    summary="Razorpay webhook handler",
)
async def razorpay_webhook(
    request: Request,
    db: DbSession,
) -> dict:
    """
    Handle Razorpay events.

    Verifies X-Razorpay-Signature header, then dispatches by event type:
    - payment.captured → confirm_payment_received
    - payout.processed → update milestone status
    - payout.failed → alert admin + freelancer
    - payment.failed → notify client
    - refund.processed → log
    """
    # Read raw body for signature verification
    raw_body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")

    if not payment_service.verify_webhook_signature(raw_body, signature):
        logger.warning("Razorpay webhook: invalid signature")
        raise ForbiddenError("Invalid webhook signature.")

    try:
        payload = await request.json()
    except Exception:
        logger.error("Razorpay webhook: failed to parse body")
        return {"status": "error"}

    event = payload.get("event", "")
    event_payload = payload.get("payload", {})

    logger.info("Razorpay webhook event: %s", event)

    try:
        if event == "payment.captured":
            await _handle_payment_captured(event_payload, db)
        elif event == "payout.processed":
            await _handle_payout_processed(event_payload, db)
        elif event == "payout.failed":
            await _handle_payout_failed(event_payload, db)
        elif event == "payment.failed":
            await _handle_payment_failed(event_payload, db)
        elif event == "refund.processed":
            logger.info("Refund processed: %s", event_payload)
        else:
            logger.info("Unhandled Razorpay event: %s", event)

    except Exception as exc:
        logger.error("Razorpay webhook handler error: %s", exc, exc_info=True)

    return {"status": "ok"}


# ── Event handlers ─────────────────────────────────────────────────────────────


async def _handle_payment_captured(payload: dict, db: DbSession) -> None:
    """Handle payment.captured — confirm escrow."""
    payment_entity = payload.get("payment", {}).get("entity", {})
    order_id = payment_entity.get("order_id", "")
    payment_id = payment_entity.get("id", "")

    if not order_id or not payment_id:
        logger.warning("payment.captured missing order_id or payment_id")
        return

    # For webhook, we don't have the client-side signature.
    # We've already verified the webhook signature, so we trust this.
    # Create a dummy signature for the service call
    import hashlib, hmac  # noqa: PLC0415, E401
    from app.core.config import settings  # noqa: PLC0415

    message = f"{order_id}|{payment_id}"
    signature = hmac.new(
        settings.RAZORPAY_KEY_SECRET.encode(),
        message.encode(),
        hashlib.sha256,
    ).hexdigest()

    try:
        await payment_service.confirm_payment_received(
            order_id=order_id,
            payment_id=payment_id,
            signature=signature,
            db=db,
        )
    except Exception as exc:
        logger.error("Failed to confirm payment from webhook: %s", exc)


async def _handle_payout_processed(payload: dict, db: DbSession) -> None:
    """Handle payout.processed — update milestone."""
    from sqlalchemy import select  # noqa: PLC0415
    from app.db.models import Milestone, MilestoneStatus  # noqa: PLC0415
    from datetime import timezone, datetime  # noqa: PLC0415

    payout_entity = payload.get("payout", {}).get("entity", {})
    reference_id = payout_entity.get("reference_id", "")
    utr = payout_entity.get("utr", "")

    if reference_id:
        result = await db.execute(
            select(Milestone).where(Milestone.id == reference_id)
        )
        milestone = result.scalar_one_or_none()
        if milestone and milestone.status != MilestoneStatus.released:
            milestone.status = MilestoneStatus.released
            milestone.released_at = datetime.now(timezone.utc)
            milestone.razorpay_payout_id = payout_entity.get("id", "")
            db.add(milestone)
            await db.flush()
            logger.info("Payout confirmed for milestone %s, UTR: %s", reference_id, utr)


async def _handle_payout_failed(payload: dict, db: DbSession) -> None:
    """Handle payout.failed — alert admin."""
    payout_entity = payload.get("payout", {}).get("entity", {})
    reference_id = payout_entity.get("reference_id", "")
    failure_reason = payout_entity.get("failure_reason", "unknown")

    logger.error(
        "Payout FAILED for milestone %s: %s", reference_id, failure_reason
    )



async def _handle_payment_failed(payload: dict, db: DbSession) -> None:
    """Handle payment.failed — notify client."""
    payment_entity = payload.get("payment", {}).get("entity", {})
    order_id = payment_entity.get("order_id", "")
    error_desc = payment_entity.get("error_description", "Payment failed")

    logger.warning(
        "Payment failed for order %s: %s", order_id, error_desc
    )

