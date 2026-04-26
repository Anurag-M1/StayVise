"""
StayVise — Alembic async migration runner
Imports ALL models so autogenerate can diff against the current schema.
"""

import asyncio
import re
import logging
from logging.config import fileConfig

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import settings

# ── Import every model module so metadata is populated ────────────────────────
# Add new model files here as the project grows.
from app.db.models import Base  # noqa: F401 — registers all 8 tables on Base.metadata
import app.db.models  # noqa: F401

# ── Alembic config ─────────────────────────────────────────────────────────────
config = context.config
config.set_main_option("sqlalchemy.url", str(settings.DATABASE_URL))

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata
logger = logging.getLogger("alembic.env")


def check_migration_safety(migration_script_path: str) -> None:
    """
    Scans a migration script for potentially unsafe operations.
    Raises a warning if unsafe patterns are detected.
    """
    try:
        with open(migration_script_path, "r") as f:
            content = f.read()
            
        unsafe_patterns = [
            r'ALTER TABLE.*NOT NULL', 
            r'DROP COLUMN', 
            r'RENAME',
            r'op\.drop_column',
            r'op\.drop_table',
            r'op\.rename_column',
        ]
        
        for p in unsafe_patterns:
            if re.search(p, content, re.IGNORECASE):
                logger.warning(
                    "⚠️ UNSAFE migration detected in %s: '%s'. "
                    "Review before applying to production.", 
                    migration_script_path, p
                )
    except Exception as e:
        logger.error("Error checking migration safety: %s", e)


# ── Offline mode (generates SQL without a live DB) ────────────────────────────
def run_migrations_offline() -> None:
    """
    Run migrations without a database connection.
    Useful for generating SQL scripts to review before applying.

    Usage:
        ENVIRONMENT=production alembic upgrade head --sql > migration.sql
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
        include_schemas=True,
    )
    with context.begin_transaction():
        context.run_migrations()


# ── Online mode (applies migrations against a live DB) ────────────────────────
def do_run_migrations(connection):  # type: ignore[no-untyped-def]
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
        include_schemas=True,
        # Render dialect-specific types (e.g. JSONB, ARRAY) correctly
        render_as_batch=False,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Create an async engine and run migrations within a sync connection context."""
    connectable = create_async_engine(
        str(settings.DATABASE_URL),
        echo=False,
        # Use NullPool for migration runs — never reuse connections
        poolclass=__import__("sqlalchemy.pool", fromlist=["NullPool"]).NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
