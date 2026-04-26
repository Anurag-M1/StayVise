"""
StayVise Alembic script.py.mako template
"""
"""performance_indexing_and_metrics

Revision ID: 5eb1edca964d
Revises: 87f212b8b56d
Create Date: 2026-04-18 21:35:59.401504

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5eb1edca964d'
down_revision: Union[str, None] = '87f212b8b56d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Enable pg_stat_statements ──────────────────────────────────────────────
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_stat_statements;")

    # ── Performance Indexes ───────────────────────────────────────────────────
    # Note: Using op.execute with COMMIT to allow CONCURRENTLY (Postgres restriction)
    # This migration SHOULD NOT be run inside a transaction if possible, 
    # but op.execute("COMMIT") is a workaround for standard alembic runners.
    
    # 1. Projects: Fast lookup for dashboard project lists
    op.execute("COMMIT")
    op.execute("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_freelancer_status ON projects(freelancer_id, status);")
    op.execute("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_client_status ON projects(client_id, status);")
    
    # 2. Milestones: Fast ordering for release logic
    op.execute("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_milestones_project_seq ON milestones(project_id, sequence_number);")
    
    # 3. Transactions: Fast project ledger access
    op.execute("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_project ON transactions(project_id);")
    
    # 4. WhatsApp: Fast session lookup
    op.execute("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wa_sessions_phone ON whatsapp_sessions(phone_number);")
    
    # 5. Notifications: Fast unread count for badges
    # Partial index for even better performance
    op.execute("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id) WHERE sent_at IS NULL;")


def downgrade() -> None:
    op.drop_index("idx_notifications_user_unread", table_name="notifications")
    op.drop_index("idx_wa_sessions_phone", table_name="whatsapp_sessions")
    op.drop_index("idx_transactions_project", table_name="transactions")
    op.drop_index("idx_milestones_project_seq", table_name="milestones")
    op.drop_index("idx_projects_client_status", table_name="projects")
    op.drop_index("idx_projects_freelancer_status", table_name="projects")
    # We generally don't drop pg_stat_statements in downgrade as other tools might use it
