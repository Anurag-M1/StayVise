"""
StayVise Alembic script.py.mako template
"""
"""security_hardening_audit_and_paise

Revision ID: 6329f1812e95
Revises: 5eb1edca964d
Create Date: 2026-04-18 21:49:07.738312

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6329f1812e95'
down_revision: Union[str, None] = '5eb1edca964d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. Create audit_events table ───────────────────────────────────────────
    op.create_table(
        'audit_events',
        sa.Column('id', sa.UUID(), nullable=False, server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', sa.UUID(), nullable=True),
        sa.Column('event_type', sa.String(length=100), nullable=False),
        sa.Column('resource_type', sa.String(length=50), nullable=True),
        sa.Column('resource_id', sa.UUID(), nullable=True),
        sa.Column('metadata', sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column('ip_address', sa.String(length=50), nullable=True),
        sa.Column('user_agent', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_audit_events_user_id', 'audit_events', ['user_id'])
    op.create_index('ix_audit_events_event_type', 'audit_events', ['event_type'])

    # ── 2. Convert amounts (Numeric -> BigInteger Paise) ───────────────────────
    # We multiply by 100 during the cast
    
    # Projects
    op.execute("ALTER TABLE projects ALTER COLUMN total_amount TYPE BIGINT USING (total_amount * 100)::BIGINT")
    op.execute("ALTER TABLE projects ALTER COLUMN platform_fee_amount TYPE BIGINT USING (platform_fee_amount * 100)::BIGINT")
    op.execute("ALTER TABLE projects ALTER COLUMN freelancer_payout_amount TYPE BIGINT USING (freelancer_payout_amount * 100)::BIGINT")
    
    # Milestones
    op.execute("ALTER TABLE milestones ALTER COLUMN amount TYPE BIGINT USING (amount * 100)::BIGINT")
    
    # Transactions
    op.execute("ALTER TABLE transactions ALTER COLUMN amount TYPE BIGINT USING (amount * 100)::BIGINT")
    
    # Proposals
    op.execute("ALTER TABLE proposals ALTER COLUMN amount TYPE BIGINT USING (amount * 100)::BIGINT")


def downgrade() -> None:
    # Convert amounts back (BigInteger Paise -> Numeric INR)
    op.execute("ALTER TABLE projects ALTER COLUMN total_amount TYPE NUMERIC(12, 2) USING (total_amount / 100.0)")
    op.execute("ALTER TABLE projects ALTER COLUMN platform_fee_amount TYPE NUMERIC(12, 2) USING (platform_fee_amount / 100.0)")
    op.execute("ALTER TABLE projects ALTER COLUMN freelancer_payout_amount TYPE NUMERIC(12, 2) USING (freelancer_payout_amount / 100.0)")
    
    op.execute("ALTER TABLE milestones ALTER COLUMN amount TYPE NUMERIC(12, 2) USING (amount / 100.0)")
    op.execute("ALTER TABLE transactions ALTER COLUMN amount TYPE NUMERIC(12, 2) USING (amount / 100.0)")
    op.execute("ALTER TABLE proposals ALTER COLUMN amount TYPE NUMERIC(12, 2) USING (amount / 100.0)")

    op.drop_table('audit_events')
