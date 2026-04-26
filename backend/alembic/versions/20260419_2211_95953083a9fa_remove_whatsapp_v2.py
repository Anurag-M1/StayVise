"""
StayVise Alembic script.py.mako template
"""
"""remove_whatsapp_v2

Revision ID: 95953083a9fa
Revises: a37fb5df96a2
Create Date: 2026-04-19 22:11:16.729968

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '95953083a9fa'
down_revision: Union[str, None] = 'a37fb5df96a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Drop the whatsapp_sessions table
    op.drop_table('whatsapp_sessions')
    
    # 2. Remove columns from users table
    op.drop_column('users', 'whatsapp_name')
    
    # 3. Remove columns from projects table
    op.drop_column('projects', 'whatsapp_thread_id')


def downgrade() -> None:
    # (Permanent removal, no downgrade path implemented for these specific fields)
    pass
