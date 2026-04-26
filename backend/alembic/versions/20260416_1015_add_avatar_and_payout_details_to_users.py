"""add_avatar_and_payout_details_to_users

Revision ID: 7d5d2c4b1a10
Revises: 41464b28dc2e
Create Date: 2026-04-16 10:15:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "7d5d2c4b1a10"
down_revision: Union[str, None] = "41464b28dc2e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("avatar_url", sa.Text(), nullable=True))
    op.add_column(
        "users",
        sa.Column(
            "payout_details",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "payout_details")
    op.drop_column("users", "avatar_url")
