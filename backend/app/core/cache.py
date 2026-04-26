from __future__ import annotations
"""
StayVise — Redis Cache Utils.
Implements TTL-based caching for high-traffic API responses.
"""

import json
import logging
import functools
from typing import Any, Callable, Optional, TypeVar, cast
from datetime import datetime, date
from decimal import Decimal

import redis.asyncio as aioredis
from app.main import get_redis
from app.core.config import settings

logger = logging.getLogger("stayvise.cache")

T = TypeVar("T")

class CacheJSONEncoder(json.JSONEncoder):
    """Handles Decimal, datetime, and date for cache serialization."""
    def default(self, obj: Any) -> Any:
        if isinstance(obj, Decimal):
            return str(obj)
        if isinstance(obj, (datetime, date)):
            return obj.isoformat()
        return super().default(obj)

async def set_cache(key: str, value: Any, ttl: int = 300) -> None:
    """Serialize and store a value in Redis."""
    try:
        redis = get_redis()
        serialized = json.dumps(value, cls=CacheJSONEncoder)
        await redis.setex(key, ttl, serialized)
    except Exception as exc:
        logger.warning("Cache write failed for %s: %s", key, exc)

async def get_cache(key: str) -> Optional[Any]:
    """Retrieve and deserialize a value from Redis."""
    try:
        redis = get_redis()
        hit = await redis.get(key)
        if hit:
            return json.loads(hit)
    except Exception as exc:
        logger.warning("Cache read failed for %s: %s", key, exc)
    return None

async def invalidate_cache(pattern: str) -> None:
    """Invalidate keys matching a pattern using SCAN (non-blocking)."""
    try:
        redis = get_redis()
        cursor = 0
        while True:
            cursor, keys = await redis.scan(cursor, match=pattern, count=100)
            if keys:
                await redis.delete(*keys)
            if cursor == 0:
                break
        logger.info("Invalidated cache pattern: %s", pattern)
    except Exception as exc:
        logger.warning("Cache invalidation failed for %s: %s", pattern, exc)

def cached_response(key_prefix: str, ttl: int = 300):
    """
    Decorator for caching FastAPI route responses.
    Automatically handles Pydantic models and lists of models.
    """
    def decorator(func: Callable[..., Any]):
        @functools.wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            # Skip cache in testing if needed
            if settings.ENVIRONMENT == "testing" and not kwargs.get("use_cache_in_test"):
                return await func(*args, **kwargs)

            # Construct cache key from arguments (excluding 'db' and 'admin' deps)
            cache_args = {k: v for k, v in kwargs.items() if k not in ("db", "admin", "current_user")}
            cache_key = f"{key_prefix}:" + ":".join(f"{k}={v}" for k, v in sorted(cache_args.items()))
            
            hit = await get_cache(cache_key)
            if hit:
                logger.debug("Cache HIT: %s", cache_key)
                return hit
            
            logger.debug("Cache MISS: %s", cache_key)
            result = await func(*args, **kwargs)
            
            # ── Serialize ──────────────────────────────────────────────────────
            # Handle Pydantic v2 models, lists, and dicts
            serialized_result = result
            try:
                if hasattr(result, "model_dump"):
                    serialized_result = result.model_dump()
                elif isinstance(result, list):
                    serialized_result = [
                        item.model_dump() if hasattr(item, "model_dump") else item 
                        for item in result
                    ]
            except Exception as exc:
                logger.warning("Cache serialization failed for %s: %s", cache_key, exc)
                return result

            await set_cache(cache_key, serialized_result, ttl)
            return result
        return wrapper
    return decorator
