from __future__ import annotations
from typing import Optional
"""
StayVise — Razorpay Payment & Escrow Service.

All Razorpay API calls are abstracted here. No direct SDK usage anywhere else.

Flow:
  1. create_payment_order  → Razorpay Order for checkout
  2. verify_payment_signature → HMAC-SHA256 check
  3. confirm_payment_received → escrow hold, status transition
  4. release_milestone_payment → RazorpayX Payout to freelancer
  5. process_auto_release → Celery-driven auto-release
  6. handle_refund → full refund on cancellation
"""


import hashlib
import hmac
import json
import logging
from datetime import timezone, datetime, timedelta
from decimal import Decimal

import httpx
from fastapi import Request
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.exceptions import NotFoundError, PaymentError, ValidationError
from app.core.audit_log import log_audit_event
from app.db.crud.notification import notification as notification_crud
from app.db.models import (
    Milestone,
    MilestoneStatus,
    NotificationChannel,
    NotificationType,
    Project,
    ProjectStatus,
    Transaction,
    TransactionStatus,
    TransactionType,
    User,
)

logger = logging.getLogger("stayvise.payment")

# ── Razorpay API base URLs ─────────────────────────────────────────────────────
_RAZORPAY_API = "https://api.razorpay.com/v1"


class PaymentService:
    """Encapsulates all Razorpay interactions."""

    def _get_auth(self) -> tuple[str, str]:
        """Fetch current credentials from settings (bypassing stale process environment)."""
        return (settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET)




    async def _append_transaction(
        self,
        db: AsyncSession,
        *,
        project_id: str,
        transaction_type: TransactionType,
        amount: Decimal,
        status: TransactionStatus,
        razorpay_reference: Optional[str],
        tx_metadata: dict,
        milestone_id: Optional[str] = None,
    ) -> Transaction:
        previous_result = await db.execute(
            select(Transaction)
            .where(Transaction.project_id == project_id)
            .order_by(desc(Transaction.created_at), desc(Transaction.id))
            .limit(1)
        )
        previous_tx = previous_result.scalar_one_or_none()
        previous_hash = previous_tx.audit_hash if previous_tx else None

        tx = Transaction(
            project_id=project_id,
            milestone_id=milestone_id,
            transaction_type=transaction_type,
            amount=amount,
            razorpay_reference=razorpay_reference,
            status=status,
            tx_metadata=tx_metadata,
            previous_audit_hash=previous_hash,
        )
        db.add(tx)
        await db.flush()

        tx.audit_hash = self._build_audit_hash(tx, previous_hash)
        db.add(tx)
        await db.flush()
        return tx

    def _build_audit_hash(self, tx: Transaction, previous_hash: Optional[str]) -> str:
        payload = {
            "id": str(tx.id),
            "project_id": str(tx.project_id),
            "milestone_id": str(tx.milestone_id) if tx.milestone_id else None,
            "transaction_type": tx.transaction_type.value,
            "amount": str(tx.amount),
            "status": tx.status.value,
            "razorpay_reference": tx.razorpay_reference,
            "created_at": tx.created_at.isoformat() if tx.created_at else "",
            "previous_audit_hash": previous_hash,
            "tx_metadata": tx.tx_metadata,
        }
        raw = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
        return hashlib.sha256(raw).hexdigest()

    async def _record_notification(
        self,
        db: AsyncSession,
        *,
        user_id: str,
        notif_type: NotificationType,
        payload: dict,
        channel: NotificationChannel = NotificationChannel.push,
    ) -> None:
        await notification_crud.create_for_user(
            db,
            user_id=user_id,
            notif_type=notif_type,
            channel=channel,
            payload=payload,
        )

    # ══════════════════════════════════════════════════════════════════════════
    # 1. Create payment order
    # ══════════════════════════════════════════════════════════════════════════

    async def create_payment_order(
        self, project_id: str, db: AsyncSession
    ) -> dict:
        """
        Create a Razorpay order for the full project amount + platform fee.

        Returns dict with order_id, amount, currency, key_id for the
        frontend Razorpay checkout widget.
        """
        project = await self._get_project(db, project_id)

        if project.status not in (ProjectStatus.draft, ProjectStatus.awaiting_payment):
            raise ValidationError(
                f"Cannot create payment order: project status is '{project.status.value}', "
                f"expected 'draft' or 'awaiting_payment'."
            )

        client_total = project.total_amount + project.platform_fee_amount
        amount_paise = client_total



        # Call Razorpay API
        order_data = {
            "amount": amount_paise,
            "currency": project.currency,
            "receipt": str(project_id),
            "notes": {
                "project_id": str(project_id),
                "freelancer_id": str(project.freelancer_id),
                "client_id": str(project.client_id),
            },
            "payment_capture": True,  # Auto-capture on successful payment
        }

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{_RAZORPAY_API}/orders",
                json=order_data,
                auth=self._get_auth(),
            )

        if response.status_code not in (200, 201):
            logger.error(
                "Razorpay order creation failed: %d — %s",
                response.status_code,
                response.text[:500],
            )
            # Check for authentication failure specifically
            error_data = response.json() if response.status_code != 401 else {}
            if response.status_code == 401 or (error_data.get("error", {}).get("description") == "Authentication failed"):
                raise ValidationError("Razorpay authentication failed. Please verify your RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in the .env file.")
            
            raise PaymentError(f"Failed to create payment order: {response.text[:200]}")

        rz_order = response.json()
        order_id = rz_order["id"]

        # Update project
        project.razorpay_order_id = order_id
        project.status = ProjectStatus.awaiting_payment
        db.add(project)
        await db.flush()

        logger.info(
            "Razorpay order created: %s for project %s (₹%s)",
            order_id, project_id, client_total,
        )

        return {
            "order_id": order_id,
            "amount": amount_paise,
            "currency": project.currency,
            "key_id": settings.RAZORPAY_KEY_ID,
            "project_id": str(project_id),
            "description": f"StayVise — {project.title}",
            "prefill": {
                "contact": "",  # Will be filled by frontend
            },
        }

    # ══════════════════════════════════════════════════════════════════════════
    # 2. Verify payment signature
    # ══════════════════════════════════════════════════════════════════════════

    def verify_payment_signature(
        self, order_id: str, payment_id: str, signature: str
    ) -> bool:
        """
        HMAC-SHA256 verify: order_id|payment_id signed with KEY_SECRET.
        Returns True/False — never raises.
        """


        try:
            message = f"{order_id}|{payment_id}"
            expected = hmac.new(
                settings.RAZORPAY_KEY_SECRET.encode("utf-8"),
                message.encode("utf-8"),
                hashlib.sha256,
            ).hexdigest()
            return hmac.compare_digest(expected, signature)
        except Exception as exc:
            logger.error("Signature verification error: %s", exc)
            return False

    # ══════════════════════════════════════════════════════════════════════════
    # 3. Confirm payment received (hold in escrow)
    # ══════════════════════════════════════════════════════════════════════════

    async def confirm_payment_received(
        self,
        order_id: str,
        payment_id: str,
        signature: str,
        db: AsyncSession,
        request: Optional[Request] = None,
    ) -> Project:
        """
        Called after successful payment — holds funds in escrow.

        1. Verify signature
        2. Re-fetch payment from Razorpay to confirm amount
        3. Transition project to in_progress
        4. Create escrow_hold transaction
        5. Notify both parties via WhatsApp
        """
        # Verify signature
        if not self.verify_payment_signature(order_id, payment_id, signature):
            raise PaymentError("Payment signature verification failed. Possible tampering.")

        # Fetch project
        result = await db.execute(
            select(Project)
            .options(selectinload(Project.milestones))
            .where(Project.razorpay_order_id == order_id)
        )
        project = result.scalar_one_or_none()
        if not project:
            raise NotFoundError("Project", f"order_id={order_id}")

        if project.status == ProjectStatus.in_progress:
            logger.warning("Payment already confirmed for project %s", project.id)
            return project

        # double check transaction log
        existing_tx = await db.execute(
            select(Transaction).where(
                Transaction.project_id == project.id,
                Transaction.transaction_type == TransactionType.escrow_hold,
                Transaction.status == TransactionStatus.success
            )
        )
        if existing_tx.scalar_one_or_none():
            logger.warning("Escrow hold transaction already exists for project %s", project.id)
            project.status = ProjectStatus.in_progress
            return project

        if project.status != ProjectStatus.awaiting_payment:
            raise ValidationError(
                f"Project status is '{project.status.value}', expected 'awaiting_payment'."
            )

        rz_payment = await self._fetch_razorpay_payment(payment_id)
            
        expected_paise = project.total_amount + project.platform_fee_amount
        actual_paise = rz_payment.get("amount", 0)

        if actual_paise < expected_paise:
            raise PaymentError(
                f"Amount mismatch: expected ₹{expected_paise / 100}, "
                f"received ₹{actual_paise / 100}."
            )

        # Transition project
        now = datetime.now(timezone.utc)
        project.status = ProjectStatus.in_progress
        project.razorpay_payment_id = payment_id
        project.escrow_held_at = now
        project.auto_release_at = None
        db.add(project)

        await self._append_transaction(
            db,
            project_id=project.id,
            transaction_type=TransactionType.escrow_hold,
            amount=project.total_amount + project.platform_fee_amount,
            razorpay_reference=payment_id,
            status=TransactionStatus.success,
            tx_metadata={
                "order_id": order_id,
                "payment_id": payment_id,
                "razorpay_response": rz_payment,
            },
        )

        await log_audit_event(
            db, "payment_escrow_hold", user_id=project.client_id,
            resource_type="project", resource_id=project.id,
            request=request,
            metadata={"payment_id": payment_id, "amount": project.total_amount}
        )
        await self._record_notification(
            db,
            user_id=project.client_id,
            notif_type=NotificationType.payment_received,
            payload={
                "title": "Escrow funded successfully",
                "description": f"{project.title} is now funded and protected in escrow.",
                "path": f"/projects/{project.id}",
            },
        )
        await self._record_notification(
            db,
            user_id=project.freelancer_id,
            notif_type=NotificationType.payment_received,
            payload={
                "title": "Client payment secured",
                "description": f"Funds for {project.title} are now held in escrow.",
                "path": f"/projects/{project.id}",
            },
        )
        await db.commit()

        logger.info(
            "Payment confirmed: project=%s payment=%s amount=₹%s",
            project.id, payment_id, project.total_amount,
        )

        # Notify parties (fire-and-forget)
        await self._notify_payment_confirmed(project, db)

        return project

    # ══════════════════════════════════════════════════════════════════════════
    # 4. Release milestone payment (RazorpayX Payout)
    # ══════════════════════════════════════════════════════════════════════════

    async def release_milestone_payment(
        self, milestone_id: str, db: AsyncSession, request: Optional[Request] = None
    ) -> dict:
        """
        Release one milestone's payment to the freelancer via RazorpayX.

        Returns the payout response dict.
        """
        # Fetch milestone + project + freelancer
        ms_result = await db.execute(
            select(Milestone)
            .options(selectinload(Milestone.project))
            .where(Milestone.id == milestone_id)
        )
        milestone = ms_result.scalar_one_or_none()
        if not milestone:
            raise NotFoundError("Milestone", milestone_id)

        project = milestone.project
        if not project:
            raise NotFoundError("Project", "for milestone")

        # Validate states
        if milestone.status not in (MilestoneStatus.submitted, MilestoneStatus.approved):
            raise ValidationError(
                f"Cannot release payment: milestone status is '{milestone.status.value}'."
            )
        if project.status == ProjectStatus.disputed:
            raise ValidationError("Cannot release payment: project is under dispute.")
        
        if milestone.status == MilestoneStatus.released:
            logger.warning("Milestone %s already released, skipping.", milestone_id)
            return {"status": "already_released", "id": milestone.razorpay_payout_id}

        # Fetch freelancer
        fl_result = await db.execute(
            select(User).where(User.id == project.freelancer_id)
        )
        freelancer = fl_result.scalar_one_or_none()
        if not freelancer:
            raise NotFoundError("Freelancer", project.freelancer_id)

        if not freelancer.razorpay_fund_account_id:
            raise ValidationError(
                "Freelancer has no bank account / UPI linked. "
                "Please add a bank account before payouts can be made."
            )

        amount_paise = milestone.amount
        payout_amount = amount_paise / 100
        
        # ── ₹1,00,000 High-Value Payout Alert ──────────────────────────────────
        if amount_paise >= 10000000: # 1,00,000.00 paise
            logger.warning("HIGH VALUE PAYOUT ALERT: ₹%d released for milestone %s", amount_paise // 100, milestone_id)
            sentry_sdk.capture_message(
                f"HIGH VALUE PAYOUT: ₹{amount_paise // 100} released for milestone {milestone_id}",
                level="warning"
            )
            # Future: add WhatsApp alert to admin here

        # Create RazorpayX Payout
        payout_data = {
            "account_number": settings.RAZORPAY_ACCOUNT_NUMBER,
            "fund_account_id": freelancer.razorpay_fund_account_id,
            "amount": amount_paise,
            "currency": "INR",
            "mode": "UPI",
            "purpose": "payout",
            "queue_if_low_balance": True,
            "reference_id": str(milestone_id)[:40],
            "narration": f"StayVise - {project.title[:30]} - {milestone.title[:30]}",
        }
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{_RAZORPAY_API}/payouts",
                json=payout_data,
                auth=self._get_auth(),
            )
        if response.status_code not in (200, 201):
            logger.error(
                "RazorpayX payout failed: %d — %s",
                response.status_code, response.text[:500],
            )
            # Try IMPS fallback
            payout_data["mode"] = "IMPS"
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    f"{_RAZORPAY_API}/payouts",
                    json=payout_data,
                    auth=self._get_auth(),
                )
            if response.status_code not in (200, 201):
                raise PaymentError(
                    f"Payout failed (UPI + IMPS): {response.text[:200]}"
                )
        payout_response = response.json()
        payout_id = payout_response.get("id", "")

        # Update milestone
        now = datetime.now(timezone.utc)
        milestone.status = MilestoneStatus.released
        milestone.released_at = now
        milestone.razorpay_payout_id = payout_id
        db.add(milestone)

        await self._append_transaction(
            db,
            project_id=project.id,
            milestone_id=milestone.id,
            transaction_type=TransactionType.milestone_release,
            amount=amount_paise,
            razorpay_reference=payout_id,
            status=TransactionStatus.success,
            tx_metadata={
                "payout_id": payout_id,
                "mode": payout_response.get("mode", "MOCK"),
                "razorpay_response": payout_response,
            },
        )

        await log_audit_event(
            db, "payout_released", user_id=project.client_id, # Usually client releases it
            resource_type="milestone", resource_id=milestone.id,
            request=request,
            metadata={"payout_id": payout_id, "amount": amount_paise}
        )

        await self._record_notification(
            db,
            user_id=project.freelancer_id,
            notif_type=NotificationType.milestone_approved,
            payload={
                "title": "Milestone released",
                "description": f"{milestone.title} has been approved and payout is on the way.",
                "path": f"/projects/{project.id}",
            },
        )
        await self._record_notification(
            db,
            user_id=project.client_id,
            notif_type=NotificationType.milestone_approved,
            payload={
                "title": "Payment released",
                "description": f"{milestone.title} has been approved and released from escrow.",
                "path": f"/projects/{project.id}",
            },
        )
        await db.commit()

        logger.info(
            "Milestone payout: %s (₹%s) → freelancer %s, payout_id=%s",
            milestone_id, payout_amount, freelancer.id, payout_id,
        )

        # Notify freelancer
        await self._notify_payment_released(milestone, project, freelancer, payout_response)

        return payout_response

    # ══════════════════════════════════════════════════════════════════════════
    # 5. Auto-release (called by Celery)
    # ══════════════════════════════════════════════════════════════════════════

    async def process_auto_release(
        self, milestone_id: str, db: AsyncSession
    ) -> None:
        """
        Called by Celery when the auto-release deadline hits.
        Only releases if milestone is still in 'submitted' status.
        """
        result = await db.execute(
            select(Milestone).where(Milestone.id == milestone_id)
        )
        milestone = result.scalar_one_or_none()

        if not milestone:
            logger.warning("Auto-release: milestone %s not found", milestone_id)
            return

        if milestone.status != MilestoneStatus.submitted:
            logger.info(
                "Auto-release skip: milestone %s status is '%s' (already %s)",
                milestone_id, milestone.status.value,
                "approved/released" if milestone.status in (MilestoneStatus.approved, MilestoneStatus.released) else "other",
            )
            return

        logger.info(
            "Auto-releasing milestone %s",
            milestone_id,
        )

        try:
            await self.release_milestone_payment(milestone_id, db)
        except Exception as exc:
            logger.error(
                "Auto-release failed for milestone %s: %s", milestone_id, exc
            )
            # Alerting admin (via Sentry)

    # ══════════════════════════════════════════════════════════════════════════
    # 6. Refund
    # ══════════════════════════════════════════════════════════════════════════

    async def handle_refund(
        self, project_id: str, reason: str, db: AsyncSession
    ) -> dict:
        """Full refund to client — only for projects before work started."""
        project = await self._get_project(db, project_id)

        refundable = (ProjectStatus.draft, ProjectStatus.awaiting_payment, ProjectStatus.in_progress)
        if project.status not in refundable:
            raise ValidationError(
                f"Cannot refund project with status '{project.status.value}'. "
                f"Eligible statuses: {', '.join(s.value for s in refundable)}."
            )

        if not project.razorpay_payment_id:
            raise ValidationError("No payment to refund — project was never paid.")

        # Check if any milestones are already released
        result = await db.execute(
            select(Milestone).where(
                Milestone.project_id == project_id,
                Milestone.status == MilestoneStatus.released,
            )
        )
        released = list(result.scalars().all())
        if released:
            raise ValidationError(
                f"{len(released)} milestone(s) already released. "
                "Full refund is not possible; please raise a dispute instead."
            )

        refund_amount_paise = int(project.total_amount + project.platform_fee_amount)
        
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{_RAZORPAY_API}/payments/{project.razorpay_payment_id}/refund",
                json={
                    "amount": refund_amount_paise,
                    "notes": {
                        "project_id": str(project_id),
                        "reason": reason[:200],
                    },
                    "speed": "normal",
                },
                auth=self._get_auth(),
            )

        if response.status_code not in (200, 201):
            raise PaymentError(f"Razorpay refund failed: {response.text[:200]}")
        refund_response = response.json()
        refund_id = refund_response.get("id", "")

        # Update project
        project.status = ProjectStatus.cancelled
        db.add(project)

        await self._append_transaction(
            db,
            project_id=project.id,
            transaction_type=TransactionType.refund,
            amount=project.total_amount + project.platform_fee_amount,
            razorpay_reference=refund_id,
            status=TransactionStatus.success,
            tx_metadata={
                "refund_id": refund_id,
                "reason": reason,
                "razorpay_response": refund_response,
            },
        )
        await self._record_notification(
            db,
            user_id=project.client_id,
            notif_type=NotificationType.payment_received,
            payload={
                "title": "Refund processed",
                "description": f"Refund for {project.title} has been recorded in your ledger.",
                "path": "/payments",
            },
        )
        await db.commit()

        logger.info(
            "Refund processed: project=%s refund_id=%s amount=₹%s",
            project_id, refund_id, project.total_amount,
        )

        return refund_response

    # ══════════════════════════════════════════════════════════════════════════
    # Razorpay webhook signature verification
    # ══════════════════════════════════════════════════════════════════════════

    def verify_webhook_signature(self, raw_body: bytes, signature: str) -> bool:
        """
        Verify the X-Razorpay-Signature header.
        HMAC-SHA256 of raw request body with webhook secret.
        """
        try:
            expected = hmac.new(
                settings.RAZORPAY_WEBHOOK_SECRET.encode("utf-8"),
                raw_body,
                hashlib.sha256,
            ).hexdigest()
            return hmac.compare_digest(expected, signature)
        except Exception as exc:
            logger.error("Webhook signature verification error: %s", exc)
            return False

    # ══════════════════════════════════════════════════════════════════════════
    # RazorpayX: Create Contact + Fund Account
    # ══════════════════════════════════════════════════════════════════════════

    async def verify_bank_account(self, fund_account_id: str) -> dict:
        """
        Perform a penny drop verification on a fund account.
        Razorpay charges ~₹1 for this and returns the name on the account.
        """
        # https://razorpay.com/docs/api/razorpayx/account-validation/
        logger.info("Performing penny drop for fund account: %s", fund_account_id)
        
        # In production, we'd trigger a payout of ₹1 with purpose='verification'
        # For now, we'll implement the API mapping
        async with httpx.AsyncClient(timeout=30) as client:
            # Note: Verification usually happens via a specific Account Validation API
            # or by sending a ₹1 payout.
            resp = await client.post(
                f"{_RAZORPAY_API}/payouts",
                json={
                    "account_number": settings.RAZORPAY_ACCOUNT_NUMBER,
                    "fund_account_id": fund_account_id,
                    "amount": 100, # ₹1.00
                    "currency": "INR",
                    "mode": "IMPS",
                    "purpose": "verification",
                    "reference_id": f"verify_{fund_account_id[:30]}",
                },
                auth=self._get_auth(),
            )
        
        if resp.status_code not in (200, 201):
            logger.error("Penny drop failed: %s", resp.text)
            return {"status": "failed", "error": resp.text[:200]}
            
        return resp.json()

    async def create_fund_account(
        self,
        user: User,
        *,
        account_type: str,  # "bank_account" or "vpa" (UPI)
        bank_account: Optional[dict] = None,
        vpa: Optional[dict] = None,
        db: AsyncSession,
    ) -> dict:
        """
        Create a RazorpayX Contact and Fund Account for the user.

        For bank_account::
            {"name": "...", "ifsc": "...", "account_number": "..."}

        For vpa (UPI)::
            {"address": "user@upi"}
        """
        # Step 1: Create RazorpayX Contact (if not already created)
        if not user.razorpay_contact_id:
            contact_data = {
                "name": user.full_name,
                "contact": user.phone_number,
                "type": "customer",
                "reference_id": str(user.id)[:40],
            }
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"{_RAZORPAY_API}/contacts",
                    json=contact_data,
                    auth=self._get_auth(),
                )
            if resp.status_code not in (200, 201):
                # Log warning but don't hard crash the whole flow.
                # Payout details can be linked later when the account is active.
                logger.warning(
                    "RazorpayX contact creation failed: %d — %s",
                    resp.status_code, resp.text[:200]
                )
                return {"id": "pending_linking"}
            contact = resp.json()
                
            user.razorpay_contact_id = contact["id"]
            db.add(user)
            await db.flush()
            logger.info("RazorpayX contact created: %s for user %s", contact["id"], user.id)

        # Step 2: Create Fund Account
        fund_data: dict = {
            "contact_id": user.razorpay_contact_id,
            "account_type": account_type,
        }

        if account_type == "bank_account" and bank_account:
            fund_data["bank_account"] = bank_account
        elif account_type == "vpa" and vpa:
            fund_data["vpa"] = vpa
        else:
            raise ValidationError(
                f"Must provide {'bank_account' if account_type == 'bank_account' else 'vpa'} details."
            )

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{_RAZORPAY_API}/fund_accounts",
                json=fund_data,
                auth=self._get_auth(),
            )
        if resp.status_code not in (200, 201):
            raise PaymentError(f"Failed to create fund account: {resp.text[:200]}")
        fund_account = resp.json()
            
        user.razorpay_fund_account_id = fund_account["id"]
        if account_type == "bank_account" and bank_account:
            account_number = bank_account.get("account_number", "")
            user.payout_details = {
                "account_type": "bank_account",
                "holder_name": bank_account.get("name", user.full_name),
                "ifsc": bank_account.get("ifsc", ""),
                "account_number_masked": (
                    f"{'*' * max(len(account_number) - 4, 0)}{account_number[-4:]}"
                    if account_number else ""
                ),
                "label": f"Bank account ending {account_number[-4:]}" if account_number else "Bank account",
                "fund_account_id": fund_account["id"],
            }
        elif account_type == "vpa" and vpa:
            address = vpa.get("address", "")
            user.payout_details = {
                "account_type": "vpa",
                "address": address,
                "label": address,
                "fund_account_id": fund_account["id"],
            }
        db.add(user)
        await db.flush()

        logger.info(
            "RazorpayX fund account created: %s (%s) for user %s",
            fund_account["id"], account_type, user.id,
        )

        return fund_account

    # ══════════════════════════════════════════════════════════════════════════
    # Internal helpers
    # ══════════════════════════════════════════════════════════════════════════

    async def _get_project(self, db: AsyncSession, project_id: str) -> Project:
        result = await db.execute(
            select(Project)
            .options(selectinload(Project.milestones))
            .where(Project.id == project_id)
        )
        project = result.scalar_one_or_none()
        if not project:
            raise NotFoundError("Project", project_id)
        return project

    async def _fetch_razorpay_payment(self, payment_id: str) -> dict:
        """Fetch payment details from Razorpay API."""
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{_RAZORPAY_API}/payments/{payment_id}",
                auth=self._get_auth(),
            )
        if resp.status_code != 200:
            raise PaymentError(f"Failed to fetch payment {payment_id}: {resp.text[:200]}")
        return resp.json()

    async def _notify_payment_confirmed(self, project: Project, db: AsyncSession) -> None:
        """Send WhatsApp notifications after payment confirmed."""
        try:
            from app.services.messaging import messenger_service  # noqa: PLC0415

            # Notify freelancer
            fl_result = await db.execute(select(User).where(User.id == project.freelancer_id))
            freelancer = fl_result.scalar_one_or_none()
            if freelancer:
                await messenger_service.send_payment_confirmed(
                    freelancer.phone_number,
                    project_title=project.title,
                    amount=f"₹{project.total_amount}",
                )

            # Notify client
            cl_result = await db.execute(select(User).where(User.id == project.client_id))
            client_user = cl_result.scalar_one_or_none()
            if client_user:
                await messenger_service.send_text_message(
                    client_user.phone_number,
                    f"✅ Payment received for *{project.title}*!\n"
                    f"₹{project.total_amount + project.platform_fee_amount} is now held in escrow.\n"
                    f"The freelancer can start working.",
                )
        except Exception as exc:
            logger.warning("Failed to send payment notification: %s", exc)

    async def _notify_payment_released(
        self, milestone: Milestone, project: Project, freelancer: User, payout: dict
    ) -> None:
        """Send WhatsApp notification after payout."""
        try:
            from app.services.messaging import messenger_service  # noqa: PLC0415

            utr = payout.get("utr", payout.get("id", "N/A"))
            await messenger_service.send_payment_released(
                freelancer.phone_number,
                milestone_title=milestone.title,
                amount=f"₹{milestone.amount}",
                utr_number=str(utr),
            )
        except Exception as exc:
            logger.warning("Failed to send release notification: %s", exc)


# ── Module singleton ───────────────────────────────────────────────────────────
payment_service = PaymentService()
