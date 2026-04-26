"""initial_schema

Creates all 8 core tables for StayVise:
  users, projects, milestones, trust_scores,
  disputes, transactions, whatsapp_sessions, notifications

Revision ID: 0001
Revises: —
Create Date: 2026-04-13
"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers
revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── users ──────────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=False),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("phone_number", sa.String(20), nullable=False, comment="E.164 format"),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("whatsapp_name", sa.String(255), nullable=True),
        sa.Column("password_hash", sa.String(255), nullable=True),
        sa.Column(
            "role",
            sa.Enum(
                "freelancer", "client", "admin",
                name="userrole",
                native_enum=False,
                length=20,
            ),
            nullable=False,
        ),
        sa.Column(
            "is_verified", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
        sa.Column(
            "is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False
        ),
        sa.Column(
            "onboarding_complete",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("phone_number"),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_users_phone_number", "users", ["phone_number"])
    op.create_index("ix_users_email", "users", ["email"])

    # ── projects ───────────────────────────────────────────────────────────────
    op.create_table(
        "projects",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=False),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("freelancer_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("client_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "draft", "awaiting_payment", "in_progress",
                "completed", "disputed", "cancelled",
                name="projectstatus",
                native_enum=False,
                length=30,
            ),
            nullable=False,
        ),
        sa.Column("total_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("platform_fee_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("freelancer_payout_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column(
            "currency",
            sa.String(3),
            server_default=sa.text("'INR'"),
            nullable=False,
        ),
        sa.Column("razorpay_order_id", sa.String(100), nullable=True),
        sa.Column("razorpay_payment_id", sa.String(100), nullable=True),
        sa.Column("escrow_held_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deadline", sa.Date(), nullable=True),
        sa.Column("auto_release_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("whatsapp_thread_id", sa.String(255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("total_amount > 0", name="ck_projects_positive_total"),
        sa.CheckConstraint(
            "platform_fee_amount >= 0", name="ck_projects_non_negative_fee"
        ),
        sa.ForeignKeyConstraint(
            ["freelancer_id"], ["users.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["client_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("razorpay_order_id"),
    )
    op.create_index("ix_projects_freelancer_status", "projects", ["freelancer_id", "status"])
    op.create_index("ix_projects_client_status", "projects", ["client_id", "status"])
    op.create_index("ix_projects_status", "projects", ["status"])
    op.create_index("ix_projects_razorpay_order_id", "projects", ["razorpay_order_id"])

    # ── milestones ─────────────────────────────────────────────────────────────
    op.create_table(
        "milestones",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=False),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("project_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("sequence_number", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "pending", "submitted", "approved", "disputed", "released",
                name="milestonestatus",
                native_enum=False,
                length=20,
            ),
            nullable=False,
        ),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("released_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("razorpay_payout_id", sa.String(100), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("amount > 0", name="ck_milestone_positive_amount"),
        sa.CheckConstraint("sequence_number > 0", name="ck_milestone_positive_seq"),
        sa.ForeignKeyConstraint(
            ["project_id"], ["projects.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "project_id", "sequence_number", name="uq_milestone_project_seq"
        ),
    )
    op.create_index(
        "ix_milestones_project_sequence", "milestones", ["project_id", "sequence_number"]
    )
    op.create_index("ix_milestones_project_id", "milestones", ["project_id"])
    op.create_index("ix_milestones_status", "milestones", ["status"])

    # ── trust_scores ───────────────────────────────────────────────────────────
    op.create_table(
        "trust_scores",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=False),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("user_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column(
            "score", sa.Numeric(5, 2), server_default=sa.text("0"), nullable=False
        ),
        sa.Column(
            "total_projects", sa.Integer(), server_default=sa.text("0"), nullable=False
        ),
        sa.Column(
            "completed_projects",
            sa.Integer(),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "disputed_projects",
            sa.Integer(),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column("avg_delivery_days", sa.Numeric(6, 2), nullable=True),
        sa.Column(
            "response_rate",
            sa.Numeric(5, 2),
            server_default=sa.text("100"),
            nullable=False,
        ),
        sa.Column("last_calculated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "score >= 0 AND score <= 100", name="ck_trust_score_range"
        ),
        sa.CheckConstraint(
            "response_rate >= 0 AND response_rate <= 100",
            name="ck_trust_response_rate_range",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )

    # ── disputes ───────────────────────────────────────────────────────────────
    op.create_table(
        "disputes",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=False),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("project_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("milestone_id", postgresql.UUID(as_uuid=False), nullable=True),
        sa.Column("raised_by_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "open", "under_review", "resolved_freelancer",
                "resolved_client", "escalated",
                name="disputestatus",
                native_enum=False,
                length=30,
            ),
            nullable=False,
        ),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column(
            "evidence_urls",
            postgresql.ARRAY(sa.Text()),
            server_default=sa.text("'{}'"),
            nullable=False,
        ),
        sa.Column("resolution_notes", sa.Text(), nullable=True),
        sa.Column("resolved_by_id", postgresql.UUID(as_uuid=False), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["milestone_id"], ["milestones.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["raised_by_id"], ["users.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["resolved_by_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_disputes_project_status", "disputes", ["project_id", "status"]
    )
    op.create_index("ix_disputes_project_id", "disputes", ["project_id"])
    op.create_index("ix_disputes_milestone_id", "disputes", ["milestone_id"])
    op.create_index("ix_disputes_status", "disputes", ["status"])

    # ── transactions ───────────────────────────────────────────────────────────
    op.create_table(
        "transactions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=False),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("project_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("milestone_id", postgresql.UUID(as_uuid=False), nullable=True),
        sa.Column(
            "transaction_type",
            sa.Enum(
                "escrow_hold", "milestone_release", "platform_fee", "refund",
                name="transactiontype",
                native_enum=False,
                length=30,
            ),
            nullable=False,
        ),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("razorpay_reference", sa.String(100), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "pending", "success", "failed",
                name="transactionstatus",
                native_enum=False,
                length=20,
            ),
            nullable=False,
        ),
        sa.Column(
            "metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["milestone_id"], ["milestones.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_transactions_project_type", "transactions", ["project_id", "transaction_type"]
    )
    op.create_index(
        "ix_transactions_razorpay_ref", "transactions", ["razorpay_reference"]
    )
    op.create_index("ix_transactions_project_id", "transactions", ["project_id"])
    op.create_index("ix_transactions_milestone_id", "transactions", ["milestone_id"])
    op.create_index("ix_transactions_status", "transactions", ["status"])
    op.create_index("ix_transactions_type", "transactions", ["transaction_type"])

    # ── whatsapp_sessions ──────────────────────────────────────────────────────
    op.create_table(
        "whatsapp_sessions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=False),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("phone_number", sa.String(20), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=False), nullable=True),
        sa.Column(
            "session_state",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "last_message_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_wa_sessions_phone_expires", "whatsapp_sessions", ["phone_number", "expires_at"])
    op.create_index("ix_whatsapp_sessions_phone_number", "whatsapp_sessions", ["phone_number"])
    op.create_index("ix_whatsapp_sessions_user_id", "whatsapp_sessions", ["user_id"])

    # ── notifications ──────────────────────────────────────────────────────────
    op.create_table(
        "notifications",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=False),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("user_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column(
            "type",
            sa.Enum(
                "project_created", "payment_received", "milestone_submitted",
                "milestone_approved", "dispute_opened", "auto_release_warning",
                name="notificationtype",
                native_enum=False,
                length=40,
            ),
            nullable=False,
        ),
        sa.Column(
            "channel",
            sa.Enum(
                "whatsapp", "email", "push",
                name="notificationchannel",
                native_enum=False,
                length=20,
            ),
            nullable=False,
        ),
        sa.Column(
            "payload",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notifications_user_type", "notifications", ["user_id", "type"])
    op.create_index("ix_notifications_created", "notifications", ["created_at"])
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"])
    op.create_index("ix_notifications_type", "notifications", ["type"])


def downgrade() -> None:
    # Drop in reverse dependency order
    op.drop_table("notifications")
    op.drop_table("whatsapp_sessions")
    op.drop_table("transactions")
    op.drop_table("disputes")
    op.drop_table("trust_scores")
    op.drop_table("milestones")
    op.drop_table("projects")
    op.drop_table("users")

    # Drop enum types (only needed when native_enum=True, but left here for safety)
    # op.execute("DROP TYPE IF EXISTS notificationchannel")
    # op.execute("DROP TYPE IF EXISTS notificationtype")
    # op.execute("DROP TYPE IF EXISTS transactionstatus")
    # op.execute("DROP TYPE IF EXISTS transactiontype")
    # op.execute("DROP TYPE IF EXISTS disputestatus")
    # op.execute("DROP TYPE IF EXISTS milestonestatus")
    # op.execute("DROP TYPE IF EXISTS projectstatus")
    # op.execute("DROP TYPE IF EXISTS userrole")
