"""
StayVise Alembic script.py.mako template
"""
"""catch_up_missing_columns

Revision ID: a37fb5df96a2
Revises: 88b1edca99d
Create Date: 2026-04-19 21:52:42.221555

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a37fb5df96a2'
down_revision: Union[str, None] = '88b1edca99d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── users ──────────────────────────────────────────────────────────────────
    op.add_column("users", sa.Column("bank_account_number", sa.Text(), nullable=True))
    
    # ── milestones ─────────────────────────────────────────────────────────────
    op.add_column("milestones", sa.Column("auto_release_at", sa.DateTime(timezone=True), nullable=True))
    
    # ── audit_events ───────────────────────────────────────────────────────────
    # Adding updated_at with a default value to avoid NULL constraints on existing/new rows
    op.add_column(
        "audit_events", 
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)
    )


def downgrade() -> None:
    op.drop_column("audit_events", "updated_at")
    op.drop_column("milestones", "auto_release_at")
    op.drop_column("users", "bank_account_number")
