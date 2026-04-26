from __future__ import annotations
"""
StayVise — Payment Pydantic schemas.
"""


from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


# ── Request schemas ────────────────────────────────────────────────────────────


class CreateOrderRequest(BaseModel):
    """POST /payments/create-order"""
    project_id: str


class VerifyPaymentRequest(BaseModel):
    """POST /payments/verify"""
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class RefundRequest(BaseModel):
    """POST /payments/refund"""
    project_id: str
    reason: str = Field(..., min_length=10)


# ── Bank account schemas ───────────────────────────────────────────────────────


class BankAccountDetails(BaseModel):
    """Bank account info for RazorpayX."""
    name: str = Field(..., min_length=2, max_length=120)
    ifsc: str = Field(..., pattern=r"^[A-Z]{4}0[A-Z0-9]{6}$")
    account_number: str = Field(..., min_length=5, max_length=20)


class UPIDetails(BaseModel):
    """UPI VPA for RazorpayX."""
    address: str = Field(..., pattern=r"^[\w.\-]+@[\w]+$")


class AddBankAccountRequest(BaseModel):
    """POST /users/me/bank-account"""
    account_type: str = Field(
        ..., description="'bank_account' or 'vpa' (UPI)"
    )
    bank_account: Optional[BankAccountDetails] = None
    vpa: Optional[UPIDetails] = None


class BankAccountResponse(BaseModel):
    """Response after linking bank account."""
    fund_account_id: str
    contact_id: str
    account_type: str
    message: str = "Bank account linked successfully"


# ── Response schemas ───────────────────────────────────────────────────────────


class OrderResponse(BaseModel):
    """Returned to frontend for Razorpay checkout."""
    order_id: str
    amount: int  # In paise
    currency: str
    key_id: str
    project_id: str
    description: str


class PaymentStatusResponse(BaseModel):
    """GET /payments/project/{project_id}/status"""
    project_id: str
    status: str
    razorpay_order_id: Optional[str] = None
    razorpay_payment_id: Optional[str] = None
    escrow_held_at: Optional[datetime] = None
    total_amount: Decimal
    platform_fee_amount: Decimal
    is_paid: bool


class TransactionLedgerEntry(BaseModel):
    """Entry for the paginated global ledger."""
    id: str
    created_at: datetime
    project_title: str
    milestone_title: Optional[str] = None
    amount: Decimal
    transaction_type: str
    status: str
    razorpay_reference: Optional[str] = None
    audit_hash: Optional[str] = None
    previous_audit_hash: Optional[str] = None
    is_audit_verified: bool = False


class PaymentStats(BaseModel):
    """Summary financial metrics for the ledger header."""
    total_received: Decimal
    total_spent: Decimal
    platform_fees_paid: Decimal
    pending_escrow: Decimal
    transaction_count: int
    verified_entries: int
    last_entry_at: Optional[datetime] = None
