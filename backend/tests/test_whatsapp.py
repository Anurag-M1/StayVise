"""
StayVise — WhatsApp integration tests.

Groups:
  1. WhatsAppService (send methods) — 5 tests
  2. Webhook endpoints — 4 tests
  3. Message parsing — 3 tests
  4. Conversation state machine — 8 tests
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient

from app.api.v1.webhook import parse_inbound_message
from app.core.config import settings
from app.services.whatsapp import WhatsAppService
from tests.conftest import auth_headers, create_user_and_get_token


# ══════════════════════════════════════════════════════════════════════════════
# 1. WhatsAppService — send methods
# ══════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_whatsapp_service_text_payload() -> None:
    """Verify text message payload construction."""
    service = WhatsAppService()

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = MagicMock(
            status_code=200,
            json=lambda: {"messages": [{"id": "wamid.test123"}]},
        )

        result = await service.send_text_message("+919876543210", "Hello World")

        mock_post.assert_called_once()
        call_kwargs = mock_post.call_args
        payload = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json")

        assert payload["messaging_product"] == "whatsapp"
        assert payload["to"] == "+919876543210"
        assert payload["type"] == "text"
        assert payload["text"]["body"] == "Hello World"
        assert result["messages"][0]["id"] == "wamid.test123"


@pytest.mark.asyncio
async def test_whatsapp_service_template_payload() -> None:
    """Verify template message payload construction."""
    service = WhatsAppService()

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = MagicMock(
            status_code=200,
            json=lambda: {"messages": [{"id": "wamid.tmpl1"}]},
        )

        result = await service.send_template_message(
            "+919876543210",
            template_name="otp_message",
            components=[
                {"type": "body", "parameters": [{"type": "text", "text": "123456"}]},
            ],
        )

        call_args = mock_post.call_args
        payload = call_args[1].get("json")
        assert payload["type"] == "template"
        assert payload["template"]["name"] == "otp_message"
        assert payload["template"]["language"]["code"] == "en"
        assert len(payload["template"]["components"]) == 1


@pytest.mark.asyncio
async def test_whatsapp_service_interactive_buttons() -> None:
    """Verify interactive button message structure."""
    service = WhatsAppService()

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = MagicMock(
            status_code=200,
            json=lambda: {"messages": [{"id": "wamid.btn1"}]},
        )

        await service.send_interactive_message(
            "+919876543210",
            body_text="Choose an action:",
            buttons=[
                {"id": "approve_123", "title": "Approve"},
                {"id": "dispute_123", "title": "Dispute"},
            ],
            header="Milestone Review",
        )

        call_args = mock_post.call_args
        payload = call_args[1].get("json")
        assert payload["type"] == "interactive"
        interactive = payload["interactive"]
        assert interactive["type"] == "button"
        assert len(interactive["action"]["buttons"]) == 2
        assert interactive["action"]["buttons"][0]["reply"]["id"] == "approve_123"
        assert interactive["header"]["text"] == "Milestone Review"


@pytest.mark.asyncio
async def test_whatsapp_service_list_message() -> None:
    """Verify list message structure."""
    service = WhatsAppService()

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = MagicMock(
            status_code=200,
            json=lambda: {"messages": [{"id": "wamid.list1"}]},
        )

        await service.send_list_message(
            "+919876543210",
            body_text="Your projects:",
            button_text="View Projects",
            sections=[{
                "title": "Active",
                "rows": [{"id": "p1", "title": "Website", "description": "₹20K"}],
            }],
        )

        call_args = mock_post.call_args
        payload = call_args[1].get("json")
        interactive = payload["interactive"]
        assert interactive["type"] == "list"
        assert interactive["action"]["button"] == "View Projects"
        assert len(interactive["action"]["sections"]) == 1


@pytest.mark.asyncio
async def test_whatsapp_service_max_buttons_validation() -> None:
    """More than 3 buttons should raise WhatsAppError."""
    from app.core.exceptions import WhatsAppError

    service = WhatsAppService()

    with pytest.raises(WhatsAppError, match="max 3 buttons"):
        await service.send_interactive_message(
            "+919876543210",
            body_text="Too many buttons",
            buttons=[
                {"id": "b1", "title": "One"},
                {"id": "b2", "title": "Two"},
                {"id": "b3", "title": "Three"},
                {"id": "b4", "title": "Four"},  # Too many!
            ],
        )


# ══════════════════════════════════════════════════════════════════════════════
# 2. Webhook endpoints
# ══════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_webhook_verify_success(client: AsyncClient) -> None:
    """GET /webhook/whatsapp should return challenge on valid token."""
    resp = await client.get(
        "/api/v1/webhook/whatsapp",
        params={
            "hub.mode": "subscribe",
            "hub.verify_token": settings.WHATSAPP_VERIFY_TOKEN,
            "hub.challenge": "test_challenge_123",
        },
    )
    assert resp.status_code == 200
    assert resp.text == "test_challenge_123"


@pytest.mark.asyncio
async def test_webhook_verify_failure(client: AsyncClient) -> None:
    """GET /webhook/whatsapp with wrong token should return 403."""
    resp = await client.get(
        "/api/v1/webhook/whatsapp",
        params={
            "hub.mode": "subscribe",
            "hub.verify_token": "wrong_token",
            "hub.challenge": "test_challenge",
        },
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_webhook_receive_message(client: AsyncClient) -> None:
    """POST /webhook/whatsapp should return 200 immediately."""
    payload = {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "123",
                "changes": [
                    {
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {"phone_number_id": "test"},
                            "contacts": [{"profile": {"name": "Test"}, "wa_id": "919876543210"}],
                            "messages": [
                                {
                                    "from": "919876543210",
                                    "id": "wamid.unique123",
                                    "timestamp": "1713000000",
                                    "text": {"body": "Hello"},
                                    "type": "text",
                                }
                            ],
                        },
                        "field": "messages",
                    }
                ],
            }
        ],
    }

    resp = await client.post("/api/v1/webhook/whatsapp", json=payload)
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_webhook_production_signature_verification(client: AsyncClient) -> None:
    """In production, webhook should fail if signature is missing or invalid."""
    import hmac
    import hashlib
    from app.core.config import settings
    
    payload = {"object": "whatsapp_business_account", "entry": []}
    body = __import__("json").dumps(payload).encode("utf-8")
    
    # 1. Missing signature
    with patch("app.core.config.settings.ENVIRONMENT", "production"):
        resp = await client.post("/api/v1/webhook/whatsapp", content=body)
        assert resp.status_code == 403
        assert "Missing" in resp.json()["detail"]

    # 2. Invalid signature
    with patch("app.core.config.settings.ENVIRONMENT", "production"), \
         patch("app.core.config.settings.WHATSAPP_APP_SECRET", "secret"):
        resp = await client.post(
            "/api/v1/webhook/whatsapp", 
            content=body,
            headers={"X-Hub-Signature-256": "sha256=invalid"}
        )
        assert resp.status_code == 403
        assert "Invalid" in resp.json()["detail"]

    # 3. Valid signature
    secret = "my_secret"
    expected_sig = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    with patch("app.core.config.settings.ENVIRONMENT", "production"), \
         patch("app.core.config.settings.WHATSAPP_APP_SECRET", secret):
        resp = await client.post(
            "/api/v1/webhook/whatsapp",
            content=body,
            headers={"X-Hub-Signature-256": f"sha256={expected_sig}"}
        )
        assert resp.status_code == 200


@pytest.mark.asyncio
async def test_webhook_receive_status_update(client: AsyncClient) -> None:
    """POST with status update should also return 200."""
    payload = {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "123",
                "changes": [
                    {
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {"phone_number_id": "test"},
                            "statuses": [
                                {
                                    "id": "wamid.sent123",
                                    "status": "delivered",
                                    "timestamp": "1713000000",
                                    "recipient_id": "919876543210",
                                }
                            ],
                        },
                        "field": "messages",
                    }
                ],
            }
        ],
    }

    resp = await client.post("/api/v1/webhook/whatsapp", json=payload)
    assert resp.status_code == 200


# ══════════════════════════════════════════════════════════════════════════════
# 3. Message parsing
# ══════════════════════════════════════════════════════════════════════════════


def test_parse_text_message() -> None:
    """Parse a plain text message."""
    raw = {
        "id": "wamid.xxx",
        "type": "text",
        "text": {"body": "Hello world"},
        "timestamp": "1713000000",
    }
    parsed = parse_inbound_message(raw)
    assert parsed["type"] == "text"
    assert parsed["text"] == "Hello world"
    assert parsed["message_id"] == "wamid.xxx"


def test_parse_button_reply() -> None:
    """Parse an interactive button reply."""
    raw = {
        "id": "wamid.yyy",
        "type": "interactive",
        "interactive": {
            "type": "button_reply",
            "button_reply": {"id": "approve_ms123", "title": "Approve"},
        },
        "timestamp": "1713000000",
    }
    parsed = parse_inbound_message(raw)
    assert parsed["type"] == "interactive"
    assert parsed["button_id"] == "approve_ms123"
    assert parsed["button_title"] == "Approve"


def test_parse_list_reply() -> None:
    """Parse an interactive list reply."""
    raw = {
        "id": "wamid.zzz",
        "type": "interactive",
        "interactive": {
            "type": "list_reply",
            "list_reply": {"id": "proj_abc", "title": "Website"},
        },
        "timestamp": "1713000000",
    }
    parsed = parse_inbound_message(raw)
    assert parsed["type"] == "interactive"
    assert parsed["list_id"] == "proj_abc"
    assert parsed["list_title"] == "Website"


# ══════════════════════════════════════════════════════════════════════════════
# 4. Conversation state machine
# ══════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_conversation_idle_sends_menu(db_session) -> None:
    """IDLE state should transition to MAIN_MENU."""
    from app.db.models import WhatsAppSession
    from app.services.conversation import ConversationStateMachine

    session = WhatsAppSession(
        phone_number="+919876543210",
        session_state={"state": "IDLE"},
        last_message_at=__import__("datetime").datetime.now(__import__("datetime").UTC),
        expires_at=__import__("datetime").datetime.now(__import__("datetime").UTC),
    )

    machine = ConversationStateMachine(
        session=session, user=None, db=db_session, phone="+919876543210"
    )

    with patch("app.services.whatsapp.whatsapp_service.send_main_menu", new_callable=AsyncMock):
        await machine.handle({"type": "text", "text": "hi"})

    assert session.session_state["state"] == "MAIN_MENU"


@pytest.mark.asyncio
async def test_conversation_help_command(db_session) -> None:
    """/help should send help text without changing state."""
    from app.db.models import WhatsAppSession
    from app.services.conversation import ConversationStateMachine

    session = WhatsAppSession(
        phone_number="+919876543210",
        session_state={"state": "MAIN_MENU"},
        last_message_at=__import__("datetime").datetime.now(__import__("datetime").UTC),
        expires_at=__import__("datetime").datetime.now(__import__("datetime").UTC),
    )

    machine = ConversationStateMachine(
        session=session, user=None, db=db_session, phone="+919876543210"
    )

    with patch("app.services.whatsapp.whatsapp_service.send_text_message", new_callable=AsyncMock) as mock_send:
        await machine.handle({"type": "text", "text": "/help"})

    mock_send.assert_called_once()
    call_text = mock_send.call_args[0][1]
    assert "Help" in call_text


@pytest.mark.asyncio
async def test_conversation_cancel_command(db_session) -> None:
    """/cancel should reset to IDLE + send main menu."""
    from app.db.models import WhatsAppSession
    from app.services.conversation import ConversationStateMachine

    session = WhatsAppSession(
        phone_number="+919876543210",
        session_state={"state": "CREATING_PROJECT_TITLE", "project_data": {"title": "Test"}},
        last_message_at=__import__("datetime").datetime.now(__import__("datetime").UTC),
        expires_at=__import__("datetime").datetime.now(__import__("datetime").UTC),
    )

    machine = ConversationStateMachine(
        session=session, user=None, db=db_session, phone="+919876543210"
    )

    with patch("app.services.whatsapp.whatsapp_service.send_text_message", new_callable=AsyncMock), \
         patch("app.services.whatsapp.whatsapp_service.send_main_menu", new_callable=AsyncMock):
        await machine.handle({"type": "text", "text": "/cancel"})

    assert session.session_state["state"] == "IDLE"


@pytest.mark.asyncio
async def test_conversation_create_project_flow_title(db_session) -> None:
    """CREATING_PROJECT_TITLE should collect title and move to description."""
    from app.db.models import User, UserRole, WhatsAppSession
    from app.services.conversation import ConversationStateMachine

    user = User(
        phone_number="+919876543210",
        full_name="Test Freelancer",
        role=UserRole.freelancer,
        is_verified=True,
    )
    db_session.add(user)
    await db_session.flush()

    session = WhatsAppSession(
        phone_number="+919876543210",
        user_id=user.id,
        session_state={"state": "CREATING_PROJECT_TITLE", "project_data": {}},
        last_message_at=__import__("datetime").datetime.now(__import__("datetime").UTC),
        expires_at=__import__("datetime").datetime.now(__import__("datetime").UTC),
    )

    machine = ConversationStateMachine(
        session=session, user=user, db=db_session, phone="+919876543210"
    )

    with patch("app.services.whatsapp.whatsapp_service.send_text_message", new_callable=AsyncMock):
        await machine.handle({"type": "text", "text": "Website Redesign"})

    assert session.session_state["state"] == "CREATING_PROJECT_DESCRIPTION"
    assert session.session_state["project_data"]["title"] == "Website Redesign"


@pytest.mark.asyncio
async def test_conversation_create_project_short_title_rejected(db_session) -> None:
    """Short title (< 3 chars) should be rejected."""
    from app.db.models import WhatsAppSession
    from app.services.conversation import ConversationStateMachine

    session = WhatsAppSession(
        phone_number="+919876543210",
        session_state={"state": "CREATING_PROJECT_TITLE", "project_data": {}},
        last_message_at=__import__("datetime").datetime.now(__import__("datetime").UTC),
        expires_at=__import__("datetime").datetime.now(__import__("datetime").UTC),
    )

    machine = ConversationStateMachine(
        session=session, user=None, db=db_session, phone="+919876543210"
    )

    with patch("app.services.whatsapp.whatsapp_service.send_text_message", new_callable=AsyncMock) as mock_send:
        await machine.handle({"type": "text", "text": "Hi"})

    # State should NOT advance
    assert session.session_state["state"] == "CREATING_PROJECT_TITLE"
    assert "3 characters" in mock_send.call_args[0][1]


@pytest.mark.asyncio
async def test_conversation_create_project_client_phone_validation(db_session) -> None:
    """Invalid client phone should be rejected."""
    from app.db.models import WhatsAppSession
    from app.services.conversation import ConversationStateMachine

    session = WhatsAppSession(
        phone_number="+919876543210",
        session_state={"state": "CREATING_PROJECT_CLIENT", "project_data": {"title": "Test", "description": "Desc"}},
        last_message_at=__import__("datetime").datetime.now(__import__("datetime").UTC),
        expires_at=__import__("datetime").datetime.now(__import__("datetime").UTC),
    )

    machine = ConversationStateMachine(
        session=session, user=None, db=db_session, phone="+919876543210"
    )

    with patch("app.services.whatsapp.whatsapp_service.send_text_message", new_callable=AsyncMock) as mock_send:
        await machine.handle({"type": "text", "text": "+1234567890"})

    assert session.session_state["state"] == "CREATING_PROJECT_CLIENT"
    assert "Invalid" in mock_send.call_args[0][1]


@pytest.mark.asyncio
async def test_conversation_description_flow(db_session) -> None:
    """CREATING_PROJECT_DESCRIPTION → CREATING_PROJECT_CLIENT."""
    from app.db.models import WhatsAppSession
    from app.services.conversation import ConversationStateMachine

    session = WhatsAppSession(
        phone_number="+919876543210",
        session_state={"state": "CREATING_PROJECT_DESCRIPTION", "project_data": {"title": "Test"}},
        last_message_at=__import__("datetime").datetime.now(__import__("datetime").UTC),
        expires_at=__import__("datetime").datetime.now(__import__("datetime").UTC),
    )

    machine = ConversationStateMachine(
        session=session, user=None, db=db_session, phone="+919876543210"
    )

    with patch("app.services.whatsapp.whatsapp_service.send_text_message", new_callable=AsyncMock):
        await machine.handle({"type": "text", "text": "Full redesign of corporate website with 5 pages"})

    assert session.session_state["state"] == "CREATING_PROJECT_CLIENT"
    assert session.session_state["project_data"]["description"] == "Full redesign of corporate website with 5 pages"


@pytest.mark.asyncio
async def test_conversation_milestone_amount_validation(db_session) -> None:
    """Invalid milestone amount should be rejected."""
    from app.db.models import WhatsAppSession
    from app.services.conversation import ConversationStateMachine

    session = WhatsAppSession(
        phone_number="+919876543210",
        session_state={
            "state": "CREATING_PROJECT_MILESTONES",
            "project_data": {"title": "Test", "milestones": []},
            "milestone_step": "amount",
            "current_milestone": {"title": "Design"},
        },
        last_message_at=__import__("datetime").datetime.now(__import__("datetime").UTC),
        expires_at=__import__("datetime").datetime.now(__import__("datetime").UTC),
    )

    machine = ConversationStateMachine(
        session=session, user=None, db=db_session, phone="+919876543210"
    )

    with patch("app.services.whatsapp.whatsapp_service.send_text_message", new_callable=AsyncMock) as mock_send:
        await machine.handle({"type": "text", "text": "not a number"})

    assert session.session_state["state"] == "CREATING_PROJECT_MILESTONES"
    assert "valid amount" in mock_send.call_args[0][1]


@pytest.mark.asyncio
async def test_conversation_onboarding_flow(db_session) -> None:
    """Verify full onboarding flow via WhatsApp."""
    from app.db.models import WhatsAppSession, User
    from app.services.conversation import ConversationStateMachine

    session = WhatsAppSession(
        phone_number="+919999999999",
        session_state={"state": "IDLE"},
        last_message_at=__import__("datetime").datetime.now(__import__("datetime").UTC),
        expires_at=__import__("datetime").datetime.now(__import__("datetime").UTC),
    )

    machine = ConversationStateMachine(
        session=session, user=None, db=db_session, phone="+919999999999"
    )

    # 1. Enter Main Menu from IDLE
    with patch("app.services.whatsapp.whatsapp_service.send_main_menu", new_callable=AsyncMock):
        await machine.handle({"type": "text", "text": "hi"})
    assert session.session_state["state"] == "MAIN_MENU"

    # 2. Start project creation without being registered
    with patch("app.services.whatsapp.whatsapp_service.send_text_message", new_callable=AsyncMock) as mock_send:
        await machine.handle({"type": "text", "text": "create project"})
    
    # Needs to register first
    assert session.session_state["state"] == "ONBOARDING_NAME"
    assert "register first" in mock_send.call_args[0][1]

    # 3. Provide name
    with patch("app.services.whatsapp.whatsapp_service.send_interactive_message", new_callable=AsyncMock) as mock_role_msg:
        await machine.handle({"type": "text", "text": "John Doe"})
    
    assert session.session_state["state"] == "ONBOARDING_ROLE"
    assert session.session_state["full_name"] == "John Doe"
    mock_role_msg.assert_called_once()

    # 4. Choose role
    with patch("app.services.whatsapp.whatsapp_service.send_text_message", new_callable=AsyncMock), \
         patch("app.services.whatsapp.whatsapp_service.send_main_menu", new_callable=AsyncMock):
        await machine.handle({"type": "interactive", "button_id": "role_freelancer"})
    
    assert session.session_state["state"] == "IDLE"
    
    # Verify user created in DB
    from sqlalchemy import select
    result = await db_session.execute(select(User).where(User.phone_number == "+919999999999"))
    user = result.scalar_one()
    assert user.full_name == "John Doe"
    assert user.role == "freelancer"
