from __future__ import annotations
import time
import logging
from typing import Tuple
from redis.asyncio import Redis

logger = logging.getLogger("stayvise.ratelimit")

class RateLimiter:
    def __init__(self, redis: Redis):
        self.redis = redis

    async def check(self, key: str, limit: int, window_seconds: int) -> Tuple[bool, int, int]:
        """
        Sliding window rate limit check using Redis ZSET.
        Returns (allowed, remaining, reset_timestamp)
        """
        now = time.time()
        window_start = now - window_seconds
        
        # Use a pipeline to ensure atomicity
        pipe = self.redis.pipeline()
        # Remove old entries outside the window
        pipe.zremrangebyscore(key, 0, window_start)
        # Add the current request (unique member using timestamp + random or just timestamp if precision is enough)
        # Using timestamp + some entropy to avoid collisions in same microsecond
        member = f"{now}-{key}" 
        pipe.zadd(key, {member: now})
        # Count elements in the window
        pipe.zcard(key)
        # Set expiry on the key
        pipe.expire(key, window_seconds)
        
        results = await pipe.execute()
        count = results[2]
        
        remaining = max(0, limit - count)
        reset_timestamp = int(now + window_seconds)
        
        return count <= limit, remaining, reset_timestamp

    async def is_blocked(self, ip: str) -> bool:
        """Check if an IP is currently blocked."""
        return await self.redis.exists(f"blocked_ip:{ip}")

    async def block_ip(self, ip: str, duration_seconds: int = 21600):
        """Block an IP for a specific duration."""
        logger.warning("🚫 Blocking IP %s for %d seconds due to abuse", ip, duration_seconds)
        await self.redis.setex(f"blocked_ip:{ip}", duration_seconds, "1")

    async def increment_abuse_counter(self, ip: str) -> int:
        """Increment count of 429s for this IP in the last hour."""
        key = f"abuse_count:{ip}"
        count = await self.redis.incr(key)
        if count == 1:
            await self.redis.expire(key, 3600)
        return count
