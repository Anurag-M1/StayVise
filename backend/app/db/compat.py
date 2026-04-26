from __future__ import annotations
"""
StayVise — Cross-dialect type compatibility.

SQLAlchemy dialect-specific types (UUID, JSONB, ARRAY) fail on SQLite.
This module provides type decorators that work on both PostgreSQL and SQLite,
enabling the test suite to run against an in-memory SQLite database.

Usage in models.py:
    from app.db.compat import GUID, JSONType, ArrayOfText
"""


import json
import uuid
from typing import Optional, Any

from sqlalchemy import Text, TypeDecorator, types


class GUID(TypeDecorator):
    """
    Platform-independent UUID type.
    Uses PostgreSQL's UUID type when available, otherwise stores as CHAR(36).
    """

    impl = types.CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect: Any) -> Any:
        if dialect.name == "postgresql":
            from sqlalchemy.dialects.postgresql import UUID as PG_UUID

            return dialect.type_descriptor(PG_UUID(as_uuid=False))
        return dialect.type_descriptor(types.CHAR(36))

    def process_bind_param(self, value: Any, dialect: Any) -> Optional[str]:
        if value is None:
            return None
        if isinstance(value, uuid.UUID):
            return str(value)
        return str(value)

    def process_result_value(self, value: Any, dialect: Any) -> Optional[str]:
        if value is None:
            return None
        return str(value)


class JSONType(TypeDecorator):
    """
    Platform-independent JSON/JSONB type.
    Uses JSONB on PostgreSQL, TEXT with JSON serialization on SQLite.
    """

    impl = Text
    cache_ok = True

    def load_dialect_impl(self, dialect: Any) -> Any:
        if dialect.name == "postgresql":
            from sqlalchemy.dialects.postgresql import JSONB

            return dialect.type_descriptor(JSONB())
        return dialect.type_descriptor(Text())

    def process_bind_param(self, value: Any, dialect: Any) -> Optional[str]:
        if value is None:
            return None
        if dialect.name == "postgresql":
            return value  # JSONB handles serialization
        return json.dumps(value)

    def process_result_value(self, value: Any, dialect: Any) -> Optional[Any]:
        if value is None:
            return None
        if dialect.name == "postgresql":
            return value  # Already deserialized by JSONB
        if isinstance(value, str):
            return json.loads(value)
        return value


class ArrayOfText(TypeDecorator):
    """
    Platform-independent ARRAY(Text) type.
    Uses PG ARRAY on PostgreSQL, TEXT with JSON serialization on SQLite.
    """

    impl = Text
    cache_ok = True

    def load_dialect_impl(self, dialect: Any) -> Any:
        if dialect.name == "postgresql":
            from sqlalchemy import ARRAY as PG_ARRAY

            return dialect.type_descriptor(PG_ARRAY(Text))
        return dialect.type_descriptor(Text())

    def process_bind_param(self, value: Any, dialect: Any) -> Any:
        if value is None:
            return None if dialect.name == "postgresql" else "[]"
        if dialect.name == "postgresql":
            return value  # PG handles list natively
        return json.dumps(value)

    def process_result_value(self, value: Any, dialect: Any) -> Optional[list[str]]:
        if value is None:
            return []
        if dialect.name == "postgresql":
            return value
        if isinstance(value, str):
            return json.loads(value)
        return list(value)
