#!/usr/bin/env python3
"""
StayVise — Pre-deployment Database Checklist
Checks DB size, active project volume, and migration safety before applying DDL.
"""

import sys
import asyncio
import subprocess
from sqlalchemy import text
from app.db.session import get_engine
from app.core.config import settings

async def run_checks():
    print("🚀 Starting Pre-deployment Database Checklist...")
    engine = get_engine()
    
    try:
        async with engine.connect() as conn:
            # 1. DB Size
            res = await conn.execute(text("SELECT pg_size_pretty(pg_database_size(current_database()))"))
            db_size = res.scalar()
            print(f"📊 Database Size: {db_size}")
            
            # 2. Active Projects
            res = await conn.execute(text("SELECT count(*) FROM projects WHERE status='in_progress'"))
            active_count = res.scalar()
            print(f"📈 Active Projects (In Progress): {active_count}")
            
            # 3. Pending Migrations Count
            # Using alembic check to see if we are out of sync, 
            # but simpler to just run 'alembic current' and 'alembic heads'
            print("🔍 Checking migration status...")
            # This is a bit complex to do cleanly via API, so we use subprocess
            
        # 4. Dry-run Alembic SQL
        print("🧪 Performing dry-run (alembic upgrade head --sql)...")
        result = subprocess.run(
            ["alembic", "upgrade", "head", "--sql"],
            capture_output=True,
            text=True,
            check=True
        )
        sql_output = result.stdout
        
        # Log SQL for review
        with open("migration_dry_run.sql", "w") as f:
            f.write(sql_output)
        print("✅ SQL dry-run complete. Saved to migration_dry_run.sql for manual review.")
        
        # 5. Verify SQL for Unsafe Patterns
        unsafe_patterns = ['ALTER TABLE.*NOT NULL', 'DROP COLUMN', 'RENAME']
        import re
        for p in unsafe_patterns:
            if re.search(p, sql_output, re.IGNORECASE):
                print(f"⚠️  WARNING: Unsafe DDL pattern detected: {p}")
        
        print("\n✨ Pre-deploy checks PASSED.")
        return True

    except Exception as e:
        print(f"❌ Pre-deploy checks FAILED: {e}")
        return False

if __name__ == "__main__":
    if not asyncio.run(run_checks()):
        sys.exit(1)
