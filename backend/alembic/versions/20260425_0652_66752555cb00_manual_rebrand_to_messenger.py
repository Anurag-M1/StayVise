"""
StayVise Alembic script.py.mako template
"""
"""manual_rebrand_to_messenger

Revision ID: 66752555cb00
Revises: 95953083a9fa
Create Date: 2026-04-25 06:52:28.558137

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '66752555cb00'
down_revision: Union[str, None] = '95953083a9fa'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


from sqlalchemy.dialects import postgresql

def upgrade() -> None:
    # 1. Add messenger_name to users
    op.add_column('users', sa.Column('messenger_name', sa.String(length=255), nullable=True))
    
    # 2. Create messenger_sessions table
    op.create_table(
        'messenger_sessions',
        sa.Column('id', postgresql.UUID(as_uuid=False), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column('phone_number', sa.String(length=20), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=False), nullable=True),
        sa.Column(
            'session_state',
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            'last_message_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_messenger_sessions_phone_number', 'messenger_sessions', ['phone_number'], unique=False)
    op.create_index('ix_messenger_sessions_user_id', 'messenger_sessions', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_messenger_sessions_user_id', table_name='messenger_sessions')
    op.drop_index('ix_messenger_sessions_phone_number', table_name='messenger_sessions')
    op.drop_table('messenger_sessions')
    op.drop_column('users', 'messenger_name')
