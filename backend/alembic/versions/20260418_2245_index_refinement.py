"""index_refinement

Revision ID: 88b1edca99d
Revises: 5ebb1edca98d
Create Date: 2026-04-18 22:45:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '88b1edca99d'
down_revision: Union[str, None] = '5ebb1edca98d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # 1. WhatsApp session lookup optimization
    # User query: WHERE phone_number =  AND expires_at > NOW() ORDER BY last_message_at DESC
    op.execute("COMMIT")
    op.execute("DROP INDEX IF EXISTS idx_wa_sessions_phone")
    op.execute("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wa_sessions_lookup ON whatsapp_sessions(phone_number, last_message_at DESC, expires_at)")

    # 2. Notifications unread optimization
    # User query: ON notifications(user_id, created_at DESC) WHERE sent_at IS NULL
    op.execute("DROP INDEX IF EXISTS idx_notifications_user_unread")
    op.execute("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_unread ON notifications(user_id, created_at DESC) WHERE sent_at IS NULL")

def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_notifications_unread")
    op.execute("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id) WHERE sent_at IS NULL")
    
    op.execute("DROP INDEX IF EXISTS idx_wa_sessions_lookup")
    op.execute("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wa_sessions_phone ON whatsapp_sessions(phone_number)")
