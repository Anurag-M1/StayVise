"""add_notification_read_and_transaction_audit_hashes

Revision ID: c2e8f7b6a901
Revises: 7d5d2c4b1a10
Create Date: 2026-04-16 18:45:00
"""

from __future__ import annotations

import hashlib
import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c2e8f7b6a901"
down_revision: Union[str, None] = "7d5d2c4b1a10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _build_audit_hash(row: sa.Row, previous_hash: str | None) -> str:
    payload = {
        "id": str(row.id),
        "project_id": str(row.project_id),
        "milestone_id": str(row.milestone_id) if row.milestone_id else None,
        "transaction_type": row.transaction_type,
        "amount": str(row.amount),
        "status": row.status,
        "razorpay_reference": row.razorpay_reference,
        "created_at": row.created_at.isoformat() if row.created_at else "",
        "previous_audit_hash": previous_hash,
        "tx_metadata": row.tx_metadata or {},
    }
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def upgrade() -> None:
    op.add_column("notifications", sa.Column("read_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("transactions", sa.Column("previous_audit_hash", sa.String(length=64), nullable=True))
    op.add_column("transactions", sa.Column("audit_hash", sa.String(length=64), nullable=True))
    op.create_index("ix_transactions_audit_hash", "transactions", ["audit_hash"], unique=False)

    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            """
            SELECT id, project_id, milestone_id, transaction_type, amount, status,
                   razorpay_reference, created_at, tx_metadata
            FROM transactions
            ORDER BY project_id, created_at, id
            """
        )
    ).fetchall()

    previous_by_project: dict[str, str | None] = {}
    for row in rows:
        project_id = str(row.project_id)
        previous_hash = previous_by_project.get(project_id)
        audit_hash = _build_audit_hash(row, previous_hash)
        bind.execute(
            sa.text(
                """
                UPDATE transactions
                SET previous_audit_hash = :previous_hash,
                    audit_hash = :audit_hash
                WHERE id = :transaction_id
                """
            ),
            {
                "previous_hash": previous_hash,
                "audit_hash": audit_hash,
                "transaction_id": row.id,
            },
        )
        previous_by_project[project_id] = audit_hash


def downgrade() -> None:
    op.drop_index("ix_transactions_audit_hash", table_name="transactions")
    op.drop_column("transactions", "audit_hash")
    op.drop_column("transactions", "previous_audit_hash")
    op.drop_column("notifications", "read_at")
