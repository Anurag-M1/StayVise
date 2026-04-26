"""
StayVise Alembic script.py.mako template
"""
"""add_admin_override_score

Revision ID: c95787593000
Revises: a2af02ea961f
Create Date: 2026-04-26 21:52:04.297237

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c95787593000'
down_revision: Union[str, None] = 'a2af02ea961f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('trust_scores', sa.Column('admin_override_score', sa.Numeric(precision=5, scale=2), nullable=True))


def downgrade() -> None:
    op.drop_column('trust_scores', 'admin_override_score')
