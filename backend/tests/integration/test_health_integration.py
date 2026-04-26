import pytest
import httpx

@pytest.mark.asyncio
async def test_health_endpoint_integration():
    """
    Integration test: verifies the /health endpoint is reachable
    and returns 200 with 'healthy' status.
    """
    # In docker-compose.test.yml, the backend service name is 'backend'
    # and it listens on port 8000.
    async with httpx.AsyncClient(base_url="http://localhost:8000", timeout=10.0) as client:
        response = await client.get("/health")
        
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "postgres" in data["checks"]
    assert "redis" in data["checks"]
    assert data["checks"]["postgres"] == "ok"
    assert data["checks"]["redis"] == "ok"
