import asyncio
from decimal import Decimal
from sqlalchemy import select, func
from app.db.session import SessionLocal
from app.db.models import Project, Transaction, TransactionType, TransactionStatus

async def check_fees():
    async with SessionLocal() as db:
        # Sum of platform fees from projects
        projects_q = await db.execute(select(Project.id, Project.total_amount, Project.platform_fee_amount, Project.status))
        projects = projects_q.all()
        total_project_fees = Decimal(0)
        for p in projects:
            if p.status not in ('draft', 'awaiting_payment'):
                total_project_fees += p.platform_fee_amount

        # Transactions
        txs_q = await db.execute(select(Transaction.transaction_type, Transaction.amount, Transaction.status))
        txs = txs_q.all()
        total_volume = Decimal(0)
        for tx in txs:
            if tx.status == TransactionStatus.success:
                total_volume += tx.amount

if __name__ == "__main__":
    asyncio.run(check_fees())
