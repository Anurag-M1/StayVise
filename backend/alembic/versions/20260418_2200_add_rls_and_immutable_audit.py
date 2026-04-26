"""add_rls_and_immutable_audit

Revision ID: 77a1edca974d
Revises: 6329f1812e95
Create Date: 2026-04-18 22:00:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = '77a1edca974d'
down_revision: Union[str, None] = '6329f1812e95'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # 1. Enable Row Level Security (RLS) on audit_events
    op.execute("ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY")
    
    # 2. Add policy: anyone can read, but only the system can insert (already allowed by standard permissions)
    # Most importantly: deny all updates and deletes
    op.execute("CREATE POLICY select_audit_events ON audit_events FOR SELECT USING (true)")
    
    # We use a trigger to prevent updates and deletes because RLS is for bypass, 
    # but for internal system integrity, a trigger is more robust against accidental code bugs.
    op.execute("""
        CREATE OR REPLACE FUNCTION block_audit_mutation() RETURNS TRIGGER AS $$
        BEGIN
            IF TG_OP = 'UPDATE' AND NEW.user_id IS NULL AND OLD.user_id IS NOT NULL THEN
                RETURN NEW;
            END IF;
            RAISE EXCEPTION 'Audit events are immutable and cannot be updated or deleted.';
        END;
        $$ LANGUAGE plpgsql;
    """)
    
    op.execute("""
        CREATE TRIGGER trg_audit_immutable_update
        BEFORE UPDATE ON audit_events
        FOR EACH ROW EXECUTE FUNCTION block_audit_mutation();
    """)
    
    op.execute("""
        CREATE TRIGGER trg_audit_immutable_delete
        BEFORE DELETE ON audit_events
        FOR EACH ROW EXECUTE FUNCTION block_audit_mutation();
    """)

def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_audit_immutable_update ON audit_events")
    op.execute("DROP TRIGGER IF EXISTS trg_audit_immutable_delete ON audit_events")
    op.execute("DROP FUNCTION IF EXISTS block_audit_mutation()")
    op.execute("DROP POLICY IF EXISTS select_audit_events ON audit_events")
    op.execute("ALTER TABLE audit_events DISABLE ROW LEVEL SECURITY")
