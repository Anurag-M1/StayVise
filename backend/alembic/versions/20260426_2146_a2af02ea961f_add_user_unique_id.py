"""
StayVise Alembic script.py.mako template
"""
"""add_user_unique_id

Revision ID: a2af02ea961f
Revises: 66752555cb00
Create Date: 2026-04-26 21:46:50.952844

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a2af02ea961f'
down_revision: Union[str, None] = '66752555cb00'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    import secrets
    op.add_column('users', sa.Column('unique_id', sa.String(length=20), nullable=True))
    
    connection = op.get_bind()
    users = connection.execute(sa.text("SELECT id FROM users")).fetchall()
    for user in users:
        new_id = f"SV-{secrets.token_hex(4).upper()}"
        connection.execute(sa.text("UPDATE users SET unique_id = :new_id WHERE id = :id"), {"new_id": new_id, "id": user[0]})
        
    op.alter_column('users', 'unique_id', nullable=False)
    op.create_index(op.f('ix_users_unique_id'), 'users', ['unique_id'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_users_unique_id'), table_name='users')
    op.drop_column('users', 'unique_id')
