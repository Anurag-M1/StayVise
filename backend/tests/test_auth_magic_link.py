import pytest
from unittest.mock import patch, AsyncMock
from httpx import AsyncClient
from app.main import app
from app.core.config import settings

@pytest.mark.asyncio
async def test_request_secure_access_link_success(client: AsyncClient):
    """POST /auth/magic-link with phone_number should trigger an email."""
    payload = {
        "email": "test@example.com",
        "phone_number": "+919876543210"
    }
    
    with patch("app.services.email.MagicLinkService.send_magic_link", new_callable=AsyncMock) as mock_send:
        mock_send.return_value = True
        resp = await client.post("/api/v1/auth/magic-link", json=payload)
        
        assert resp.status_code == 202
        assert resp.json()["message"] == "If that email exists, a secure access link has been sent."
        assert mock_send.called
        
        # Check if the link contains the token
        args, _ = mock_send.call_args
        email, link = args
        assert email == "test@example.com"
        assert "/verify-link?token=" in link

@pytest.mark.asyncio
async def test_verify_magic_link_invalid_token(client: AsyncClient):
    """POST /auth/verify-magic-link should fail with bad token."""
    payload = {"token": "invalid.jwt.token"}
    
    resp = await client.post("/api/v1/auth/verify-magic-link", json=payload)
    assert resp.status_code == 401
    assert "Invalid or expired link" in resp.json()["detail"]
