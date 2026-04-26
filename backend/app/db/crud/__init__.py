"""CRUD registry — import singletons from here in routers and services."""

from app.db.crud.user import user  # noqa: F401
from app.db.crud.project import project  # noqa: F401
from app.db.crud.milestone import milestone  # noqa: F401
from app.db.crud.trust_score import trust_score  # noqa: F401
from app.db.crud.dispute import dispute  # noqa: F401
from app.db.crud.transaction import transaction  # noqa: F401
from app.db.crud.messenger_session import messenger_session  # noqa: F401
from app.db.crud.notification import notification  # noqa: F401

__all__ = [
    "user",
    "project",
    "milestone",
    "trust_score",
    "dispute",
    "transaction",
    "messenger_session",
    "notification",
]
