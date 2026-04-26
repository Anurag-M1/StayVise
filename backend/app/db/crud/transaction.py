from __future__ import annotations
from typing import Optional
"""Concrete CRUD for Transaction (append-only ledger)."""


from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func

from app.db.crud.base import CRUDBase
from app.db.models import Transaction, TransactionStatus, TransactionType
from app.schemas.transaction import TransactionCreate, TransactionUpdate


class CRUDTransaction(CRUDBase[Transaction, TransactionCreate, TransactionUpdate]):
    """
    Transactions are append-only — never call remove() on this CRUD.
    The update() method exists for marking status (pending → success/failed).
    """

    async def get_by_project(
        self, db: AsyncSession, *, project_id: str
    ) -> list[Transaction]:
        result = await db.execute(
            select(Transaction)
            .where(Transaction.project_id == project_id)
            .order_by(Transaction.created_at)
        )
        return list(result.scalars().all())

    async def get_by_razorpay_ref(
        self, db: AsyncSession, *, reference: str
    ) -> Optional[Transaction]:
        return await self.get_by(db, razorpay_reference=reference)

    async def sum_by_type(
        self,
        db: AsyncSession,
        *,
        project_id: str,
        tx_type: TransactionType,
    ) -> Decimal:
        """Sum all successful transactions of a given type for a project."""
        result = await db.execute(
            select(func.coalesce(func.sum(Transaction.amount), 0)).where(
                Transaction.project_id == project_id,
                Transaction.transaction_type == tx_type,
                Transaction.status == TransactionStatus.success,
            )
        )
        return Decimal(str(result.scalar_one()))

    async def mark_success(
        self,
        db: AsyncSession,
        *,
        transaction: Transaction,
        razorpay_reference: Optional[str] = None,
    ) -> Transaction:
        updates: dict = {"status": TransactionStatus.success}
        if razorpay_reference:
            updates["razorpay_reference"] = razorpay_reference
        return await self.update(db, db_obj=transaction, obj_in=updates)

    async def mark_failed(
        self, db: AsyncSession, *, transaction: Transaction
    ) -> Transaction:
        return await self.update(
            db, db_obj=transaction, obj_in={"status": TransactionStatus.failed}
        )


transaction = CRUDTransaction(Transaction)
