"""
Smoke test — /health and /api/v1/ping endpoints
"""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_ping(client: AsyncClient) -> None:
    response = await client.get("/api/v1/ping")
    assert response.status_code == 200
    assert response.json() == {"pong": "StayVise API v1"}


@pytest.mark.asyncio
async def test_health_returns_json(client: AsyncClient) -> None:
    response = await client.get("/health")
    data = response.json()
    assert "status" in data
    assert "checks" in data
    assert "app" in data
