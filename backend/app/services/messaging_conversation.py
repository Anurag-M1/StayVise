from __future__ import annotations
"""
StayVise — Messenger Conversation State Machine.

All state is stored in ``messenger_sessions.session_state`` (JSONB) — never
in memory. Each inbound message loads the session, routes through the
state machine, then saves the updated state.

States
------
  IDLE                         → welcome + main menu
  MAIN_MENU                    → route button press
  CREATING_PROJECT_TITLE       → collect project title
  CREATING_PROJECT_DESCRIPTION → collect description
  CREATING_PROJECT_CLIENT      → collect client phone
  CREATING_PROJECT_MILESTONES  → milestone loop
  CREATING_PROJECT_CONFIRM     → final confirmation
  VIEWING_PROJECTS             → show project list
  AWAITING_MILESTONE_ACTION    → approve / dispute flow
  AWAITING_DISPUTE_REASON      → collect dispute text

Commands (work in any state):
  /help    → show help text
  /cancel  → reset to IDLE
  /status  → show active project count
  /projects → show project list
"""


import logging
import re
from decimal import Decimal, InvalidOperation
from typing import Any, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Milestone,
    MilestoneStatus,
    Project,
    ProjectStatus,
    User,
    UserRole,
    MessengerSession,
)

logger = logging.getLogger("stayvise.conversation")

# Phone pattern for validation
_INDIA_PHONE_RE = re.compile(r"^\+?91[6-9]\d{9}$")


class ConversationStateMachine:
    """
    Routes inbound WhatsApp messages based on session state.

    All ``handle_*`` methods update ``self.session.session_state`` in place;
    the caller (Celery task) commits the change.
    """

    def __init__(
        self,
        *,
        session: MessengerSession,
        user: Optional[User],
        db: AsyncSession,
        phone: str,
    ) -> None:
        self.session = session
        self.user = user
        self.db = db
        self.phone = phone
        self._state: dict[str, Any] = dict(session.session_state or {})

    @property
    def current_state(self) -> str:
        return self._state.get("state", "IDLE")

    def _set_state(self, state: str, **extra: Any) -> None:
        self._state["state"] = state
        self._state.update(extra)
        self.session.session_state = dict(self._state)

    def _reset(self) -> None:
        self._state = {"state": "IDLE"}
        self.session.session_state = {"state": "IDLE"}

    # ── Main dispatch ──────────────────────────────────────────────────────────

    async def handle(self, parsed: dict[str, Any]) -> None:
        """Route an inbound message to the appropriate handler."""
        msg_type = parsed.get("type", "unknown")
        text = parsed.get("text", "").strip()
        button_id = parsed.get("button_id", "")
        list_id = parsed.get("list_id", "")

        # ── Global commands (work in any state) ────────────────────────────────
        if text.startswith("/"):
            handled = await self._handle_command(text.lower())
            if handled:
                return

        # ── Button reply handlers (approve/dispute shortcuts) ──────────────────
        if button_id:
            if button_id.startswith("approve_"):
                await self._handle_approve_button(button_id)
                return
            if button_id.startswith("dispute_"):
                milestone_id = button_id.replace("dispute_", "")
                self._set_state("AWAITING_DISPUTE_REASON", milestone_id=milestone_id)
                await self._send("Please describe the issue with this milestone (min 20 characters):")
                return
            if button_id.startswith("pay_"):
                await self._handle_pay_button(button_id)
                return

        # ── State-based routing ────────────────────────────────────────────────
        state = self.current_state

        if state == "IDLE":
            await self._handle_idle(parsed)
        elif state == "MAIN_MENU":
            await self._handle_main_menu(parsed)
        elif state == "CREATING_PROJECT_TITLE":
            await self._handle_project_title(text)
        elif state == "CREATING_PROJECT_DESCRIPTION":
            await self._handle_project_description(text)
        elif state == "CREATING_PROJECT_CLIENT":
            await self._handle_project_client(text)
        elif state == "CREATING_PROJECT_MILESTONES":
            await self._handle_project_milestones(parsed)
        elif state == "CREATING_PROJECT_CONFIRM":
            await self._handle_project_confirm(parsed)
        elif state == "VIEWING_PROJECTS":
            await self._handle_viewing_projects(parsed)
        elif state == "AWAITING_MILESTONE_ACTION":
            await self._handle_milestone_action(parsed)
        elif state == "AWAITING_DISPUTE_REASON":
            await self._handle_dispute_reason(text)
        elif state == "ONBOARDING_NAME":
            await self._handle_onboarding_name(text)
        elif state == "ONBOARDING_ROLE":
            await self._handle_onboarding_role(parsed)
        else:
            self._reset()
            await self._handle_idle(parsed)

    # ── Global commands ────────────────────────────────────────────────────────

    async def _handle_command(self, text: str) -> bool:
        """Handle slash commands. Returns True if handled."""
        cmd = text.split()[0] if text else ""

        if cmd == "/help":
            await self._send(
                "📖 *StayVise Help*\n\n"
                "Available commands:\n"
                "• /help — Show this help\n"
                "• /cancel — Cancel current action\n"
                "• /status — Show active project count\n"
                "• /projects — List your projects\n\n"
                "Or just send any message to see the main menu."
            )
            return True

        if cmd == "/cancel":
            self._reset()
            await self._send("✅ Cancelled. Returning to main menu.")
            await self._send_main_menu()
            return True

        if cmd == "/status":
            await self._handle_status_command()
            return True

        if cmd == "/projects":
            await self._show_projects_list()
            return True

        return False

    # ── State handlers ─────────────────────────────────────────────────────────

    async def _handle_idle(self, parsed: dict) -> None:
        """Any message in IDLE → send welcome + main menu."""
        name = ""
        if self.user:
            name = f" {self.user.full_name}"

        greeting = f"Hello{name}! 👋 Welcome to *StayVise* — secure escrow for freelancers."
        self._set_state("MAIN_MENU")
        await self._send_main_menu(greeting)

    async def _handle_main_menu(self, parsed: dict) -> None:
        """Route main menu button presses."""
        button_id = parsed.get("button_id", "")
        text = parsed.get("text", "").lower().strip()

        # Support both button IDs and text input
        if button_id == "create_project" or "create" in text:
            if not self.user:
                await self._send(
                    "⚠️ You need to register first.\n"
                    "Send your name to get started:"
                )
                self._set_state("ONBOARDING_NAME")
                return

            if self.user.role not in (UserRole.freelancer, UserRole.admin):
                await self._send("⚠️ Only freelancers can create projects.")
                await self._send_main_menu()
                return

            self._set_state("CREATING_PROJECT_TITLE", project_data={})
            await self._send("📝 *Create New Project*\n\nWhat's the project title?")

        elif button_id == "my_projects" or "project" in text:
            await self._show_projects_list()

        elif button_id == "my_profile" or "profile" in text:
            await self._show_profile()

        else:
            await self._send_main_menu("I didn't understand that. Please choose an option:")

    # ── Project creation flow ──────────────────────────────────────────────────

    async def _handle_project_title(self, text: str) -> None:
        if len(text) < 3:
            await self._send("⚠️ Title must be at least 3 characters. Try again:")
            return

        project_data = self._state.get("project_data", {})
        project_data["title"] = text
        self._set_state("CREATING_PROJECT_DESCRIPTION", project_data=project_data)
        await self._send("📝 Great! Now give a brief description of the project:")

    async def _handle_project_description(self, text: str) -> None:
        if len(text) < 10:
            await self._send("⚠️ Description must be at least 10 characters. Try again:")
            return

        project_data = self._state.get("project_data", {})
        project_data["description"] = text
        self._set_state("CREATING_PROJECT_CLIENT", project_data=project_data)
        await self._send(
            "📱 What is the client's phone number?\n"
            "(Indian format: +91XXXXXXXXXX)"
        )

    async def _handle_project_client(self, text: str) -> None:
        phone = re.sub(r"[\s\-\(\)]", "", text)
        if not phone.startswith("+"):
            phone = f"+{phone}"

        if not _INDIA_PHONE_RE.match(phone):
            await self._send("⚠️ Invalid phone number. Please use format: +91XXXXXXXXXX")
            return

        if self.user and phone == self.user.phone_number:
            await self._send("⚠️ You can't set yourself as the client. Enter a different number:")
            return

        project_data = self._state.get("project_data", {})
        project_data["client_phone"] = phone
        project_data["milestones"] = []
        self._set_state("CREATING_PROJECT_MILESTONES", project_data=project_data, milestone_step="title")
        await self._send(
            "🎯 *Milestone 1*\n\nWhat's the title of this milestone?"
        )

    async def _handle_project_milestones(self, parsed: dict) -> None:
        text = parsed.get("text", "").strip()
        button_id = parsed.get("button_id", "")
        project_data = self._state.get("project_data", {})
        milestones = project_data.get("milestones", [])
        step = self._state.get("milestone_step", "title")
        current = self._state.get("current_milestone", {})

        if step == "title":
            if len(text) < 3:
                await self._send("⚠️ Title must be at least 3 characters:")
                return
            current["title"] = text
            current["description"] = text  # Default description = title
            self._set_state(
                "CREATING_PROJECT_MILESTONES",
                project_data=project_data,
                milestone_step="amount",
                current_milestone=current,
            )
            await self._send(f"💰 How much for \"{text}\"? (amount in ₹, e.g. 5000)")

        elif step == "amount":
            try:
                amount = Decimal(text.replace(",", "").replace("₹", "").strip())
                if amount <= 0:
                    raise InvalidOperation
            except (InvalidOperation, ValueError):
                await self._send("⚠️ Please enter a valid amount (numbers only, e.g. 5000):")
                return

            current["amount"] = str(amount)
            current["sequence_number"] = len(milestones) + 1
            milestones.append(current)
            project_data["milestones"] = milestones

            # Ask to add another or finish
            from app.services.messaging import messenger_service  # noqa: PLC0415

            total = sum(Decimal(m["amount"]) for m in milestones)
            await messenger_service.send_interactive_message(
                self.phone,
                body_text=(
                    f"✅ Milestone {len(milestones)} added: *{current['title']}* — ₹{amount}\n"
                    f"Running total: ₹{total}\n\n"
                    f"Add another milestone or confirm?"
                ),
                buttons=[
                    {"id": "add_milestone", "title": "➕ Add Another"},
                    {"id": "confirm_project", "title": "✅ Confirm Project"},
                ],
            )
            self._set_state(
                "CREATING_PROJECT_MILESTONES",
                project_data=project_data,
                milestone_step="choice",
                current_milestone={},
            )

        elif step == "choice":
            if button_id == "add_milestone" or "add" in text.lower():
                self._set_state(
                    "CREATING_PROJECT_MILESTONES",
                    project_data=project_data,
                    milestone_step="title",
                    current_milestone={},
                )
                n = len(milestones) + 1
                await self._send(f"🎯 *Milestone {n}*\n\nWhat's the title?")

            elif button_id == "confirm_project" or "confirm" in text.lower():
                await self._show_project_summary(project_data)

            else:
                await self._send("Please choose 'Add Another' or 'Confirm Project'.")

    async def _show_project_summary(self, project_data: dict) -> None:
        """Display project summary and ask for final confirmation."""
        milestones = project_data.get("milestones", [])
        total = sum(Decimal(m["amount"]) for m in milestones)

        from app.core.config import settings  # noqa: PLC0415

        fee = total * Decimal(str(settings.ESCROW_FEE_PERCENT)) / 100
        payout = total - fee

        lines = [
            "📋 *Project Summary*\n",
            f"*Title:* {project_data.get('title', '—')}",
            f"*Description:* {project_data.get('description', '—')}",
            f"*Client:* {project_data.get('client_phone', '—')}",
            "",
            "*Milestones:*",
        ]
        for m in milestones:
            lines.append(f"  {m['sequence_number']}. {m['title']} — ₹{m['amount']}")

        lines += [
            "",
            f"*Total:* ₹{total}",
            f"*Platform fee ({settings.ESCROW_FEE_PERCENT}%):* ₹{fee}",
            f"*Your payout:* ₹{payout}",
        ]

        from app.services.messaging import messenger_service  # noqa: PLC0415

        await messenger_service.send_interactive_message(
            self.phone,
            body_text="\n".join(lines),
            buttons=[
                {"id": "project_create_yes", "title": "✅ Create Project"},
                {"id": "project_create_no", "title": "❌ Cancel"},
            ],
        )
        self._set_state("CREATING_PROJECT_CONFIRM", project_data=project_data)

    async def _handle_project_confirm(self, parsed: dict) -> None:
        button_id = parsed.get("button_id", "")
        text = parsed.get("text", "").lower()

        if button_id == "project_create_yes" or "create" in text or "yes" in text:
            project_data = self._state.get("project_data", {})
            await self._create_project_from_session(project_data)
        elif button_id == "project_create_no" or "cancel" in text or "no" in text:
            self._reset()
            await self._send("❌ Project creation cancelled.")
            await self._send_main_menu()
        else:
            await self._send("Please tap 'Create Project' or 'Cancel'.")

    async def _create_project_from_session(self, project_data: dict) -> None:
        """Actually create the project in the database."""
        if not self.user:
            await self._send("⚠️ You need to be registered. Please sign up first.")
            self._reset()
            return

        try:
            milestones = project_data.get("milestones", [])
            total = sum(Decimal(m["amount"]) for m in milestones)

            from app.core.config import settings  # noqa: PLC0415
            from decimal import ROUND_HALF_UP  # noqa: PLC0415

            fee = (total * Decimal(str(settings.ESCROW_FEE_PERCENT)) / 100).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
            payout = total - fee

            # Find or create client
            result = await self.db.execute(
                select(User).where(User.phone_number == project_data["client_phone"])
            )
            client = result.scalar_one_or_none()
            if client is None:
                client = User(
                    phone_number=project_data["client_phone"],
                    full_name="Invited Client",
                    role=UserRole.client,
                    is_verified=False,
                )
                self.db.add(client)
                await self.db.flush()
                await self.db.refresh(client)

            # Create project
            project = Project(
                title=project_data["title"],
                description=project_data["description"],
                freelancer_id=self.user.id,
                client_id=client.id,
                status=ProjectStatus.draft,
                total_amount=total,
                platform_fee_amount=fee,
                freelancer_payout_amount=payout,
                currency="INR",
            )
            self.db.add(project)
            await self.db.flush()
            await self.db.refresh(project)

            # Create milestones
            for m in milestones:
                ms = Milestone(
                    project_id=project.id,
                    title=m["title"],
                    description=m.get("description", m["title"]),
                    amount=Decimal(m["amount"]),
                    sequence_number=m["sequence_number"],
                    status=MilestoneStatus.pending,
                )
                self.db.add(ms)

            await self.db.flush()

            await self._send(
                f"🎉 *Project Created!*\n\n"
                f"*{project.title}*\n"
                f"Total: ₹{total} | {len(milestones)} milestones\n\n"
                f"We'll notify your client at {project_data['client_phone']}."
            )

            # Send invite to client
            try:
                from app.services.messaging import messenger_service  # noqa: PLC0415

                await messenger_service.send_project_invite(
                    project_data["client_phone"],
                    freelancer_name=self.user.full_name,
                    project_title=project.title,
                    total_amount=f"₹{total}",
                    payment_link=f"https://stayvise.com/pay/{project.id}",
                )
            except Exception as exc:
                logger.warning("Failed to send client invite: %s", exc)

            self._reset()
            await self._send_main_menu("What would you like to do next?")

        except Exception as exc:
            logger.error("Project creation from WhatsApp failed: %s", exc, exc_info=True)
            await self._send(
                "❌ Sorry, something went wrong creating the project. "
                "Please try again or use the web app."
            )
            self._reset()

    # ── Project browsing ───────────────────────────────────────────────────────

    async def _show_projects_list(self) -> None:
        if not self.user:
            await self._send("⚠️ You need to register first to view your projects.")
            self._reset()
            return

        from sqlalchemy import or_  # noqa: PLC0415

        result = await self.db.execute(
            select(Project)
            .where(
                or_(
                    Project.freelancer_id == self.user.id,
                    Project.client_id == self.user.id,
                ),
                Project.status.notin_([ProjectStatus.cancelled]),
            )
            .order_by(Project.created_at.desc())
            .limit(10)
        )
        projects = list(result.scalars().all())

        if not projects:
            await self._send("📋 You don't have any projects yet.")
            self._set_state("MAIN_MENU")
            await self._send_main_menu()
            return

        # Build list message
        rows = []
        for p in projects:
            role = "Freelancer" if p.freelancer_id == self.user.id else "Client"
            rows.append({
                "id": f"proj_{p.id}",
                "title": p.title[:24],
                "description": f"{p.status.value} | ₹{p.total_amount} | {role}",
            })

        from app.services.messaging import messenger_service  # noqa: PLC0415

        await messenger_service.send_list_message(
            self.phone,
            body_text=f"📋 You have *{len(projects)}* project(s):",
            button_text="View Projects",
            sections=[{"title": "Your Projects", "rows": rows}],
            header="My Projects",
        )
        self._set_state("VIEWING_PROJECTS")

    async def _handle_viewing_projects(self, parsed: dict) -> None:
        list_id = parsed.get("list_id", "")

        if list_id.startswith("proj_"):
            project_id = list_id.replace("proj_", "")
            result = await self.db.execute(
                select(Project).where(Project.id == project_id)
            )
            project = result.scalar_one_or_none()
            if project:
                await self._send_project_detail(project)
            else:
                await self._send("⚠️ Project not found.")
        else:
            self._set_state("MAIN_MENU")
            await self._send_main_menu()

    async def _send_project_detail(self, project: Project) -> None:
        """Send a detailed project view via WhatsApp."""
        from sqlalchemy.orm import selectinload  # noqa: PLC0415

        result = await self.db.execute(
            select(Project)
            .options(selectinload(Project.milestones))
            .where(Project.id == project.id)
        )
        proj = result.scalar_one()

        lines = [
            f"📋 *{proj.title}*\n",
            f"Status: {proj.status.value}",
            f"Total: ₹{proj.total_amount}",
            "",
            "*Milestones:*",
        ]
        for ms in sorted(proj.milestones, key=lambda m: m.sequence_number):
            emoji = {"pending": "⏳", "submitted": "📤", "approved": "✅", "released": "💰", "disputed": "⚠️"}
            e = emoji.get(ms.status.value, "•")
            lines.append(f"  {e} {ms.sequence_number}. {ms.title} — ₹{ms.amount} ({ms.status.value})")

        await self._send("\n".join(lines))
        self._set_state("MAIN_MENU")

    # ── Button reply handlers ──────────────────────────────────────────────────

    async def _handle_approve_button(self, button_id: str) -> None:
        """Handle approve_{milestone_id} button press."""
        milestone_id = button_id.replace("approve_", "")

        if not self.user:
            await self._send("⚠️ You need to be registered to approve milestones.")
            return

        result = await self.db.execute(
            select(Milestone).where(Milestone.id == milestone_id)
        )
        milestone = result.scalar_one_or_none()

        if not milestone:
            await self._send("⚠️ Milestone not found.")
            return

        # Get the project
        result = await self.db.execute(
            select(Project).where(Project.id == milestone.project_id)
        )
        project = result.scalar_one_or_none()

        if not project or project.client_id != self.user.id:
            await self._send("⚠️ Only the client can approve milestones.")
            return

        if milestone.status != MilestoneStatus.submitted:
            await self._send(f"⚠️ This milestone has status '{milestone.status.value}', cannot approve.")
            return

        # Approve
        from datetime import timezone, datetime  # noqa: PLC0415

        milestone.status = MilestoneStatus.approved
        milestone.approved_at = datetime.now(timezone.utc)
        project.auto_release_at = None
        self.db.add(milestone)
        self.db.add(project)
        await self.db.flush()

        await self._send(
            f"✅ *Milestone Approved!*\n\n"
            f"*{milestone.title}* — ₹{milestone.amount}\n"
            f"Payment will be released to the freelancer."
        )

        # Notify freelancer
        try:
            freelancer_result = await self.db.execute(
                select(User).where(User.id == project.freelancer_id)
            )
            freelancer = freelancer_result.scalar_one_or_none()
            if freelancer:
                from app.services.messaging import messenger_service  # noqa: PLC0415

                await messenger_service.send_text_message(
                    freelancer.phone_number,
                    f"🎉 Great news! Your milestone *{milestone.title}* "
                    f"for project *{project.title}* has been approved! "
                    f"₹{milestone.amount} will be released soon."
                )
        except Exception as exc:
            logger.warning("Failed to notify freelancer: %s", exc)

        self._set_state("MAIN_MENU")

    async def _handle_pay_button(self, button_id: str) -> None:
        project_id = button_id.replace("pay_", "")
        await self._send(
            f"💳 Payment link:\nhttps://stayvise.com/pay/{project_id}"
        )
        self._set_state("MAIN_MENU")

    async def _handle_dispute_reason(self, text: str) -> None:
        if len(text) < 20:
            await self._send("⚠️ Please provide more detail (at least 20 characters):")
            return

        milestone_id = self._state.get("milestone_id")
        if not milestone_id or not self.user:
            await self._send("⚠️ Session error. Please try again.")
            self._reset()
            return

        result = await self.db.execute(
            select(Milestone).where(Milestone.id == milestone_id)
        )
        milestone = result.scalar_one_or_none()
        if not milestone:
            await self._send("⚠️ Milestone not found.")
            self._reset()
            return

        from app.db.models import Dispute, DisputeStatus  # noqa: PLC0415

        dispute = Dispute(
            project_id=milestone.project_id,
            milestone_id=milestone_id,
            raised_by_id=self.user.id,
            status=DisputeStatus.open,
            reason=text,
            evidence_urls=[],
        )
        self.db.add(dispute)

        # Update project status
        result = await self.db.execute(
            select(Project).where(Project.id == milestone.project_id)
        )
        project = result.scalar_one_or_none()
        if project:
            project.status = ProjectStatus.disputed
            self.db.add(project)

        await self.db.flush()
        await self.db.refresh(dispute)

        await self._send(
            f"⚠️ *Dispute Raised*\n\n"
            f"Dispute #{dispute.id[:8]} has been filed.\n"
            f"Our team will review and respond within 24 hours."
        )
        self._reset()

    # ── Utility handlers ───────────────────────────────────────────────────────

    async def _handle_status_command(self) -> None:
        if not self.user:
            await self._send("⚠️ Register first to see your status.")
            return

        from sqlalchemy import or_  # noqa: PLC0415

        count_result = await self.db.execute(
            select(func.count())
            .select_from(Project)
            .where(
                or_(
                    Project.freelancer_id == self.user.id,
                    Project.client_id == self.user.id,
                ),
                Project.status.in_([
                    ProjectStatus.draft,
                    ProjectStatus.awaiting_payment,
                    ProjectStatus.in_progress,
                ]),
            )
        )
        active_count = count_result.scalar_one()

        await self._send(
            f"📊 *Your Status*\n\n"
            f"Active projects: {active_count}\n"
            f"Role: {self.user.role.value}\n"
            f"Verified: {'✅' if self.user.is_verified else '❌'}"
        )

    async def _show_profile(self) -> None:
        if not self.user:
            await self._send("⚠️ Register first to see your profile.")
            return

        lines = [
            "👤 *Your Profile*\n",
            f"*Name:* {self.user.full_name}",
            f"*Phone:* {self.user.phone_number}",
            f"*Role:* {self.user.role.value}",
            f"*Verified:* {'✅' if self.user.is_verified else '❌'}",
        ]

        if self.user.trust_score:
            ts = self.user.trust_score
            lines += [
                "",
                "📊 *Trust Score*",
                f"  Score: {ts.score}/100",
                f"  Completed: {ts.completed_projects} projects",
                f"  Response rate: {ts.response_rate}%",
            ]

        lines.append(f"\n🔗 Profile: https://stayvise.com/u/{self.user.id}")

        await self._send("\n".join(lines))
        self._set_state("MAIN_MENU")

    # ── Send helper ────────────────────────────────────────────────────────────

    async def _send(self, text: str) -> None:
        """Send a plain text message to the current phone."""
        from app.services.messaging import messenger_service  # noqa: PLC0415

        try:
            await messenger_service.send_text_message(self.phone, text)
        except Exception as exc:
            logger.error("Failed to send message to %s: %s", self.phone, exc)

    async def _send_main_menu(self, greeting: str = "") -> None:
        """Send the main menu interactive buttons."""
        from app.services.messaging import messenger_service  # noqa: PLC0415

        try:
            await messenger_service.send_main_menu(self.phone, greeting)
        except Exception as exc:
            logger.error("Failed to send main menu to %s: %s", self.phone, exc)

    async def _handle_milestone_action(self, parsed: dict) -> None:
        """Fallback for AWAITING_MILESTONE_ACTION state."""
        self._set_state("MAIN_MENU")
        await self._send_main_menu("What would you like to do?")

    # ── Onboarding flow ────────────────────────────────────────────────────────

    async def _handle_onboarding_name(self, text: str) -> None:
        if len(text.split()) < 2:
            await self._send("⚠️ Please enter your full name (first and last name):")
            return

        self._set_state("ONBOARDING_ROLE", full_name=text)
        from app.services.messaging import messenger_service  # noqa: PLC0415
        await messenger_service.send_interactive_message(
            self.phone,
            body_text=f"Nice to meet you, {text}! Are you a Freelancer or a Client?",
            buttons=[
                {"id": "role_freelancer", "title": "Laptop 👨‍💻 Freelancer"},
                {"id": "role_client", "title": "Briefcase 💼 Client"},
            ],
        )

    async def _handle_onboarding_role(self, parsed: dict) -> None:
        button_id = parsed.get("button_id", "")
        text = parsed.get("text", "").lower()
        
        role = None
        if button_id == "role_freelancer" or "freelancer" in text:
            role = UserRole.freelancer
        elif button_id == "role_client" or "client" in text:
            role = UserRole.client

        if not role:
            await self._send("Please choose your role:")
            return

        full_name = self._state.get("full_name")
        
        # Create user
        user = User(
            phone_number=self.phone,
            full_name=full_name,
            role=role,
            is_verified=True,
            onboarding_complete=True,
        )
        self.db.add(user)
        await self.db.flush()
        await self.db.refresh(user)
        self.user = user
        self.session.user_id = user.id

        await self._send(f"🎉 Welcome to StayVise, {full_name}! Your account is ready.")
        self._reset()
        await self._send_main_menu()
