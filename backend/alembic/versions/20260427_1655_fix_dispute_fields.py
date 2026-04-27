"""Add missing dispute fields

Revision ID: fix_dispute_fields
Revises: b12f129
Create Date: 2026-04-27 16:55:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from app.db.compat import GUID

# revision identifiers, used by Alembic.
revision: str = 'fix_dispute_fields'
down_revision: Union[str, None] = 'c95787593000'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # Add missing columns to disputes table
    op.add_column('disputes', sa.Column('details', sa.Text(), nullable=True))
    op.add_column('disputes', sa.Column('severity', sa.String(length=20), server_default=sa.text("'green'"), nullable=False))

def downgrade() -> None:
    op.drop_column('disputes', 'severity')
    op.drop_column('disputes', 'details')
