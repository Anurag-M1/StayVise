"""db_hardening

Revision ID: 5ebb1edca98d
Revises: 77a1edca974d
Create Date: 2026-04-18 22:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '5ebb1edca98d'
down_revision: Union[str, None] = '77a1edca974d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # 1. Rename existing constraints to match requested naming
    # Use raw SQL with IF EXISTS logic for renames (via sub-commands)
    # Note: ALTER TABLE RENAME CONSTRAINT doesn't support IF EXISTS easily in one line, 
    # but we can wrap it or just use DO blocks. For simplicity, we'll use op.execute 
    # and expect it might fail if already renamed.
    
    constraints_to_rename = [
        ("projects", "ck_projects_positive_total", "chk_positive_amount"),
        ("milestones", "ck_milestone_positive_amount", "chk_positive_milestone"),
        ("milestones", "ck_milestone_positive_seq", "chk_seq_positive"),
        ("trust_scores", "ck_trust_score_range", "chk_score_range"),
    ]
    
    for table, old, new in constraints_to_rename:
        op.execute(f"DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '{old}') THEN EXECUTE 'ALTER TABLE {table} RENAME CONSTRAINT {old} TO {new}'; END IF; END $$;")

    # 2. Add missing constraints (IF NOT EXISTS pattern)
    op.execute("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_positive_tx') THEN ALTER TABLE transactions ADD CONSTRAINT chk_positive_tx CHECK (amount > 0); END IF; END $$;")
    op.execute("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_no_self_deal') THEN ALTER TABLE projects ADD CONSTRAINT chk_no_self_deal CHECK (freelancer_id != client_id); END IF; END $$;")
    op.execute("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_deadline_future') THEN ALTER TABLE projects ADD CONSTRAINT chk_deadline_future CHECK (deadline IS NULL OR deadline > (created_at AT TIME ZONE 'UTC')::date); END IF; END $$;")

    # 3. Update Foreign Key deletion rules
    op.execute("ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_project_id_fkey")
    op.create_foreign_key(
        "transactions_project_id_fkey", "transactions", "projects",
        ["project_id"], ["id"], ondelete="SET NULL"
    )

    op.execute("ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_user_id_fkey")
    op.create_foreign_key(
        "audit_events_user_id_fkey", "audit_events", "users",
        ["user_id"], ["id"], ondelete="RESTRICT"
    )

    # 4. Partial unique index for razorpay_fund_account_id
    op.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_razorpay_fund_account_id_key")
    op.execute("DROP INDEX IF EXISTS uq_razorpay_fund_account")
    op.execute("CREATE UNIQUE INDEX uq_razorpay_fund_account ON users(razorpay_fund_account_id) WHERE razorpay_fund_account_id IS NOT NULL")

def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_razorpay_fund_account")
    op.execute("ALTER TABLE users ADD CONSTRAINT users_razorpay_fund_account_id_key UNIQUE (razorpay_fund_account_id)")

    op.drop_constraint("audit_events_user_id_fkey", "audit_events", type_="foreignkey")
    op.create_foreign_key(
        "audit_events_user_id_fkey", "audit_events", "users",
        ["user_id"], ["id"], ondelete="SET NULL"
    )

    op.drop_constraint("transactions_project_id_fkey", "transactions", type_="foreignkey")
    op.create_foreign_key(
        "transactions_project_id_fkey", "transactions", "projects",
        ["project_id"], ["id"], ondelete="RESTRICT"
    )

    op.drop_constraint("chk_deadline_future", "projects")
    op.drop_constraint("chk_no_self_deal", "projects")
    op.drop_constraint("chk_positive_tx", "transactions")

    op.execute("ALTER TABLE trust_scores RENAME CONSTRAINT chk_score_range TO ck_trust_score_range")
    op.execute("ALTER TABLE milestones RENAME CONSTRAINT chk_seq_positive TO ck_milestone_positive_seq")
    op.execute("ALTER TABLE milestones RENAME CONSTRAINT chk_positive_milestone TO ck_milestone_positive_amount")
    op.execute("ALTER TABLE projects RENAME CONSTRAINT chk_positive_amount TO ck_projects_positive_total")
