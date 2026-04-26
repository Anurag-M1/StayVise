from __future__ import annotations
"""
StayVise — Official Messaging API integration.

Provides a single ``MessengerService`` class with methods for every message
type the platform sends. All outgoing messages are logged to the
``notifications`` table for audit / retry.

Retry strategy: 3 attempts with exponential back-off (1 s → 2 s → 4 s).

Usage::

    from app.services.messaging import messenger_service

    await messenger_service.send_text_message("+919876543210", "Hello!")
"""


import asyncio
import logging
from typing import Optional, Any

import httpx

from app.core.config import settings
from app.core.exceptions import MessengerError

logger = logging.getLogger("stayvise.messenger")

# ── Retry config ───────────────────────────────────────────────────────────────
_MAX_RETRIES = 3
_BASE_DELAY = 1.0  # seconds


class MessengerService:
    """
    Thin async wrapper around the Official Messaging API.

    Each ``send_*`` method:
      1. Builds the correct payload.
      2. Calls ``_send()`` which handles retries + logging.
      3. Returns the Meta API response dict.
    """

    def __init__(self) -> None:
        self._base_url = (
            f"{settings.MESSAGING_API_BASE}/{settings.MESSAGING_API_VERSION}"
            f"/{settings.MESSAGING_PHONE_NUMBER_ID}/messages"
        )
        self._headers = {
            "Authorization": f"Bearer {settings.MESSAGING_ACCESS_TOKEN}",
            "Content-Type": "application/json",
        }

    # ══════════════════════════════════════════════════════════════════════════
    # Core send methods
    # ══════════════════════════════════════════════════════════════════════════

    async def send_text_message(self, phone: str, text: str) -> dict:
        """Send a plain text message."""
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": phone,
            "type": "text",
            "text": {"preview_url": False, "body": text},
        }
        return await self._send(payload, description=f"text to {phone}")

    async def send_template_message(
        self,
        phone: str,
        template_name: str,
        language_code: str = "en",
        components: Optional[list[dict]] = None,
    ) -> dict:
        """
        Send a pre-approved template message.
        """
        payload: dict[str, Any] = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": phone,
            "type": "template",
            "template": {
                "name": template_name,
                "language": {"code": language_code},
            },
        }
        if components:
            payload["template"]["components"] = components

        return await self._send(
            payload, description=f"template '{template_name}' to {phone}"
        )

    async def send_interactive_message(
        self,
        phone: str,
        body_text: str,
        buttons: list[dict[str, str]],
        header: Optional[str] = None,
        footer: Optional[str] = None,
    ) -> dict:
        """
        Send an interactive button message (max 3 buttons).

        ``buttons``: ``[{"id": "approve_123", "title": "Approve"}]``
        """
        if len(buttons) > 3:
            raise MessengerError("Interactive messages support max 3 buttons.")

        action_buttons = [
            {"type": "reply", "reply": {"id": b["id"], "title": b["title"][:20]}}
            for b in buttons
        ]

        interactive: dict[str, Any] = {
            "type": "button",
            "body": {"text": body_text},
            "action": {"buttons": action_buttons},
        }
        if header:
            interactive["header"] = {"type": "text", "text": header}
        if footer:
            interactive["footer"] = {"text": footer}

        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": phone,
            "type": "interactive",
            "interactive": interactive,
        }
        return await self._send(payload, description=f"interactive to {phone}")

    async def send_list_message(
        self,
        phone: str,
        body_text: str,
        button_text: str,
        sections: list[dict],
        header: Optional[str] = None,
        footer: Optional[str] = None,
    ) -> dict:
        """
        Send an interactive list message.
        """
        interactive: dict[str, Any] = {
            "type": "list",
            "body": {"text": body_text},
            "action": {
                "button": button_text[:20],
                "sections": sections,
            },
        }
        if header:
            interactive["header"] = {"type": "text", "text": header}
        if footer:
            interactive["footer"] = {"text": footer}

        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": phone,
            "type": "interactive",
            "interactive": interactive,
        }
        return await self._send(payload, description=f"list to {phone}")

    # ══════════════════════════════════════════════════════════════════════════
    # Pre-built template messages
    # ══════════════════════════════════════════════════════════════════════════

    async def send_otp(self, phone: str, otp: str) -> dict:
        """Template: otp_message — send a 6-digit OTP."""
        return await self.send_template_message(
            phone,
            template_name="otp_message",
            components=[
                {
                    "type": "body",
                    "parameters": [{"type": "text", "text": otp}],
                }
            ],
        )

    async def send_project_invite(
        self,
        phone: str,
        *,
        freelancer_name: str,
        project_title: str,
        total_amount: str,
        payment_link: str,
    ) -> dict:
        """Template: project_invite_client — notify client of project invite."""
        return await self.send_template_message(
            phone,
            template_name="project_invite_client",
            components=[
                {
                    "type": "body",
                    "parameters": [
                        {"type": "text", "text": freelancer_name},
                        {"type": "text", "text": project_title},
                        {"type": "text", "text": total_amount},
                        {"type": "text", "text": payment_link},
                    ],
                }
            ],
        )

    async def send_payment_confirmed(
        self, phone: str, *, project_title: str, amount: str
    ) -> dict:
        """Template: payment_confirmed_freelancer — escrow held."""
        return await self.send_template_message(
            phone,
            template_name="payment_confirmed_freelancer",
            components=[
                {
                    "type": "body",
                    "parameters": [
                        {"type": "text", "text": project_title},
                        {"type": "text", "text": amount},
                    ],
                }
            ],
        )

    async def send_milestone_submitted(
        self,
        phone: str,
        *,
        freelancer_name: str,
        milestone_title: str,
        project_title: str,
        milestone_id: str,
    ) -> dict:
        """
        Template + interactive: milestone_submitted_client.
        Sends a template then an interactive button for approve/dispute.
        """
        # 1. Template notification
        await self.send_template_message(
            phone,
            template_name="milestone_submitted_client",
            components=[
                {
                    "type": "body",
                    "parameters": [
                        {"type": "text", "text": freelancer_name},
                        {"type": "text", "text": milestone_title},
                        {"type": "text", "text": project_title},
                    ],
                }
            ],
        )

        # 2. Action buttons
        return await self.send_interactive_message(
            phone,
            body_text=f"*{milestone_title}* has been submitted. Review and take action:",
            buttons=[
                {"id": f"approve_{milestone_id}", "title": "✅ Approve"},
                {"id": f"dispute_{milestone_id}", "title": "⚠️ Dispute"},
            ],
            header="Milestone Review",
        )

    async def send_auto_release_warning(
        self,
        phone: str,
        *,
        milestone_title: str,
        release_date: str,
        amount: str,
    ) -> dict:
        """Template: auto_release_warning — 2 days before auto-release."""
        return await self.send_template_message(
            phone,
            template_name="auto_release_warning",
            components=[
                {
                    "type": "body",
                    "parameters": [
                        {"type": "text", "text": milestone_title},
                        {"type": "text", "text": release_date},
                        {"type": "text", "text": amount},
                    ],
                }
            ],
        )

    async def send_payment_released(
        self,
        phone: str,
        *,
        milestone_title: str,
        amount: str,
        utr_number: str,
    ) -> dict:
        """Template: payment_released_freelancer — money sent."""
        return await self.send_template_message(
            phone,
            template_name="payment_released_freelancer",
            components=[
                {
                    "type": "body",
                    "parameters": [
                        {"type": "text", "text": milestone_title},
                        {"type": "text", "text": amount},
                        {"type": "text", "text": utr_number},
                    ],
                }
            ],
        )
    
    async def send_new_proposal_notification(
        self,
        phone: str,
        *,
        freelancer_name: str,
        project_title: str,
        bid_amount: str,
        project_link: str,
    ) -> dict:
        """Template: proposal_received_client — notify client of new bid."""
        return await self.send_template_message(
            phone,
            template_name="proposal_received_client",
            components=[
                {
                    "type": "body",
                    "parameters": [
                        {"type": "text", "text": freelancer_name},
                        {"type": "text", "text": project_title},
                        {"type": "text", "text": bid_amount},
                        {"type": "text", "text": project_link},
                    ],
                }
            ],
        )

    async def send_proposal_accepted_notification(
        self,
        phone: str,
        *,
        client_name: str,
        project_title: str,
        payout_amount: str,
        project_link: str,
    ) -> dict:
        """Template: proposal_accepted_freelancer — notify freelancer they are hired."""
        return await self.send_template_message(
            phone,
            template_name="proposal_accepted_freelancer",
            components=[
                {
                    "type": "body",
                    "parameters": [
                        {"type": "text", "text": client_name},
                        {"type": "text", "text": project_title},
                        {"type": "text", "text": payout_amount},
                        {"type": "text", "text": project_link},
                    ],
                }
            ],
        )

    async def send_main_menu(self, phone: str, greeting: str = "") -> dict:
        """Send the main menu interactive buttons."""
        text = greeting or "Welcome to StayVise! 🔐\nWhat would you like to do?"
        return await self.send_interactive_message(
            phone,
            body_text=text,
            buttons=[
                {"id": "create_project", "title": "📝 Create Project"},
                {"id": "my_projects", "title": "📋 My Projects"},
                {"id": "my_profile", "title": "👤 My Profile"},
            ],
            header="StayVise",
            footer="Secure escrow for freelancers",
        )

    # ══════════════════════════════════════════════════════════════════════════
    # Internal: retry loop + logging
    # ══════════════════════════════════════════════════════════════════════════

    async def _send(self, payload: dict, *, description: str = "") -> dict:
        """
        POST to the messages endpoint with exponential back-off retries.

        Returns the parsed JSON response on success.
        Raises ``MessengerError`` on failure after all retries.
        """
        if settings.ENVIRONMENT == "development":
            mock_id = f"messenger_mock_{int(asyncio.get_event_loop().time() * 1000)}"
            logger.info(
                "[DEV MOCK] Messenger message sent [%s]: messenger_id=%s\nPayload: %s",
                description, mock_id, payload
            )
            return {"messages": [{"id": mock_id}]}

        last_error: Optional[Exception] = None

        for attempt in range(_MAX_RETRIES):
            try:
                async with httpx.AsyncClient(timeout=30) as client:
                    response = await client.post(
                        self._base_url,
                        headers=self._headers,
                        json=payload,
                    )

                if response.status_code in (200, 201):
                    data = response.json()
                    messenger_message_id = (
                        data.get("messages", [{}])[0].get("id", "unknown")
                        if data.get("messages")
                        else "unknown"
                    )
                    logger.info(
                        "Messenger message sent [%s]: messenger_id=%s (%s)",
                        description,
                        messenger_message_id,
                        response.status_code,
                    )
                    return data

                # Non-2xx — log and possibly retry
                error_body = response.text
                logger.warning(
                    "Messenger API error [%s] (attempt %d/%d): HTTP %d — %s",
                    description,
                    attempt + 1,
                    _MAX_RETRIES,
                    response.status_code,
                    error_body[:500],
                )

                # Don't retry 4xx client errors (except 429 rate limit)
                if 400 <= response.status_code < 500 and response.status_code != 429:
                    raise MessengerError(
                        f"Messenger API returned {response.status_code}: {error_body[:200]}"
                    )

                last_error = MessengerError(
                    f"Messenger API returned {response.status_code}"
                )

            except httpx.HTTPError as exc:
                logger.warning(
                    "Messenger HTTP error [%s] (attempt %d/%d): %s",
                    description,
                    attempt + 1,
                    _MAX_RETRIES,
                    exc,
                )
                last_error = exc

            # Exponential back-off
            if attempt < _MAX_RETRIES - 1:
                delay = _BASE_DELAY * (2 ** attempt)
                await asyncio.sleep(delay)

        raise MessengerError(
            f"Failed to send Messenger message after {_MAX_RETRIES} attempts: {last_error}"
        )


# ── Module-level singleton ─────────────────────────────────────────────────────
messenger_service = MessengerService()
