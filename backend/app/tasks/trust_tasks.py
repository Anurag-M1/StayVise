from __future__ import annotations
"""
StayVise — Trust Score Celery Tasks.

Calculates trust scores asynchronously based on triggers and nightly schedules.
"""


import asyncio
import logging
from datetime import timezone, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.db.models import User
from app.services.trust_score import trust_score_service
from app.worker import celery_app

logger = logging.getLogger("stayvise.tasks.trust")


@celery_app.task(
    bind=True,
    name="tasks.recalculate_user_trust_score",
    max_retries=3,
    default_retry_delay=60,
    acks_late=True,
)
def recalculate_user_trust_score(self, user_id: str) -> None:  # type: ignore[no-untyped-def]
    """
    Recalculate a single user's trust score.
    Triggered after: milestone approved, dispute resolved, project completed.
    """
    try:
        asyncio.run(_recalculate_single(user_id))
    except Exception as exc:
        logger.error("Failed to recalculate trust score for user %s: %s", user_id, exc)
        raise self.retry(exc=exc)


async def _recalculate_single(user_id: str) -> None:
    engine = create_async_engine(str(settings.DATABASE_URL), echo=False)
    SessionFactory = async_sessionmaker(engine, expire_on_commit=False)

    async with SessionFactory() as db:
        await trust_score_service.calculate_and_save(user_id, db)
        await db.commit()
    await engine.dispose()


@celery_app.task(
    name="tasks.nightly_trust_recalculation",
    acks_late=True,
)
def nightly_trust_recalculation() -> None:
    """
    Runs daily to recalculate trust scores for active users.
    (Longevity bonuses, response rates, etc. change naturally over time).
    """
    asyncio.run(_recalculate_batch_nightly())


async def _recalculate_batch_nightly() -> None:
    engine = create_async_engine(str(settings.DATABASE_URL), echo=False)
    SessionFactory = async_sessionmaker(engine, expire_on_commit=False)

    async with SessionFactory() as db:
        # Get active users with activity in last 30 days
        # For MVP, we might just get all verified users to ensure up-to-date scores
        cutoff = datetime.now(timezone.utc) - timedelta(days=30)
        
        result = await db.execute(
            select(User.id).where(
                User.is_active.is_(True),
                User.is_verified.is_(True),
                # Using created_at or updated_at as proxy for active in MVP without joined loads
                User.updated_at >= cutoff
            )
        )
        active_user_ids = [str(uid) for uid in result.scalars().all()]
        
        logger.info("Starting nightly trust score recalculation for %d users", len(active_user_ids))
        
        # Process in batches of 50
        batch_size = 50
        total_processed = 0
        
        for i in range(0, len(active_user_ids), batch_size):
            batch = active_user_ids[i:i + batch_size]
            processed = await trust_score_service.recalculate_batch(batch, db)
            total_processed += processed
            await db.commit() # Commit after each batch
            
        logger.info("Finished nightly trust score recalculation. Processed: %d", total_processed)

    await engine.dispose()
