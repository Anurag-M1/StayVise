from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from app.core.config import settings


@pytest.mark.asyncio
async def test_send_otp_calls_whatsapp_service(client: AsyncClient) -> None:
    """Verify that send-otp calls whatsapp_service.send_otp in staging environment."""
    
    # We need to simulate a non-development environment to trigger the WhatsApp branch
    with patch("app.core.config.settings.ENVIRONMENT", "staging"), \
         patch("app.services.whatsapp.whatsapp_service.send_otp", new_callable=AsyncMock) as mock_send_otp:
        
        payload = {"phone_number": "+919876543210"}
        resp = await client.post("/api/v1/auth/send-otp", json=payload)
        
        assert resp.status_code == 200
        assert "WhatsApp" in resp.json()["message"]
        
        # Verify the mock was called with the correct phone and a 6-digit OTP
        mock_send_otp.assert_called_once()
        args, _ = mock_send_otp.call_args
        assert args[0] == "+919876543210"
        assert len(args[1]) == 6
        assert args[1].isdigit()


@pytest.mark.asyncio
async def test_send_otp_whatsapp_failure_handling(client: AsyncClient) -> None:
    """Verify that WhatsApp service failures are handled gracefully."""
    
    with patch("app.core.config.settings.ENVIRONMENT", "production"), \
         patch("app.services.whatsapp.whatsapp_service.send_otp", side_effect=Exception("API Down")):
        
        payload = {"phone_number": "+919876543210"}
        resp = await client.post("/api/v1/auth/send-otp", json=payload)
        
        # In production, we should return a 400 with a helpful message (via OTPError mapping)
        assert resp.status_code == 400
        assert "Failed to send OTP" in resp.json()["detail"]
