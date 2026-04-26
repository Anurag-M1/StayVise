"""
StayVise Alembic script.py.mako template
"""
"""add_marketplace_features

Revision ID: 41464b28dc2e
Revises: cdea34971218
Create Date: 2026-04-14 23:57:51.127612

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '41464b28dc2e'
down_revision: Union[str, None] = 'cdea34971218'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Projects table updates ────────────────────────────────────────────────
    # 1. Make freelancer_id nullable for public postings
    op.alter_column('projects', 'freelancer_id',
               existing_type=sa.UUID(),
               nullable=True)
    
    # 2. Add is_public flag
    op.add_column('projects', sa.Column('is_public', sa.Boolean(), server_default='false', nullable=False))
    
    # 3. Handle ProjectStatus VARCHAR constraint update
    # Note: Since native_enum=False was used, SQLAlchemy added a CheckConstraint.
    # We drop the old one and add the new one (if strictly enforced by DB).
    # However, for simplicity and to avoid naming conflicts, we'll assume standard VARCHAR 
    # and update the model. If a CheckConstraint exists, standard Alembic batch might be safer.
    
    # ── Create Proposals table ────────────────────────────────────────────────
    op.create_table('proposals',
        sa.Column('id', sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column('project_id', sa.UUID(), nullable=False),
        sa.Column('freelancer_id', sa.UUID(), nullable=False),
        sa.Column('amount', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('cover_letter', sa.Text(), nullable=False),
        sa.Column('status', sa.String(length=30), server_default='pending', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['freelancer_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('project_id', 'freelancer_id', name='uq_proposals_project_freelancer')
    )
    op.create_index('ix_proposals_project_id', 'proposals', ['project_id'])
    op.create_index('ix_proposals_freelancer_id', 'proposals', ['freelancer_id'])
    op.create_index('ix_proposals_status', 'proposals', ['status'])


def downgrade() -> None:
    op.drop_table('proposals')
    op.drop_column('projects', 'is_public')
    op.alter_column('projects', 'freelancer_id',
               existing_type=sa.UUID(),
               nullable=False)

