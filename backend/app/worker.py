from __future__ import annotations
"""
StayVise — Celery application
Broker and result backend are sourced from settings (Redis by default).
"""


from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery(
    "stayvise",
    broker=settings.CELERY_BROKER_URL or str(settings.REDIS_URL),
    backend=settings.CELERY_RESULT_BACKEND or str(settings.REDIS_URL),
    include=[
        "app.tasks.messaging_processor",
        "app.tasks.trust_tasks",
        "app.tasks.backup_verify",
        # "app.tasks.notifications",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Kolkata",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,          # Acknowledge only after task completes
    worker_prefetch_multiplier=1, # Fair dispatch — one task at a time per worker
    worker_max_tasks_per_child=1000, # Prevent memory leaks by restarting workers
    broker_pool_limit=10,         # Connection pooling for Redis broker
    result_expires=86_400,        # Keep results for 24 hours
    
    # ── Task Queuing ───────────────────────────────────────────────────────────
    task_default_queue="default",
    task_queues={
        "default": {"exchange": "default", "routing_key": "default"},
        "payments": {"exchange": "payments", "routing_key": "payments"},
        "notifications": {"exchange": "notifications", "routing_key": "notifications"},
    },
    task_routes={
        "tasks.recalculate_user_trust_score": {"queue": "default"},
        "tasks.nightly_trust_recalculation": {"queue": "default"},
        "tasks.process_messenger_message": {"queue": "notifications"},
        "app.tasks.messaging_processor.*": {"queue": "notifications"},
        "app.tasks.payment.*": {"queue": "payments"},
    },

    beat_schedule={
        "nightly_trust_recalculation": {
            "task": "tasks.nightly_trust_recalculation",
            "schedule": crontab(hour=20, minute=30),  # 2am IST = 8:30pm UTC
        },
        "weekly_backup_verification": {
            "task": "tasks.verify_backup_integrity",
            "schedule": crontab(day_of_week=0, hour=22, minute=30),  # Sun 4am IST = Sat 10:30pm UTC
        },
    },
)
