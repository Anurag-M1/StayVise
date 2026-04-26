"""
StayVise — Trust Score engine tests.

Covers:
  - New user calculation (neutral default)
  - Perfect score scenario (100)
  - Low score scenario (disputes, late delivery)
  - Badge system logic
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Milestone,
    MilestoneStatus,
    Project,
    ProjectStatus,
    TrustScore,
    User,
    UserRole,
    WhatsAppSession,
)
from app.services.trust_score import trust_score_service


async def _create_user(db_session: AsyncSession, days_old: int = 10) -> User:
    """Helper to create a test user."""
    user = User(
        phone_number=f"+918800000{str(days_old).zfill(3)}",
        full_name=f"User {days_old}",
        role=UserRole.freelancer,
        is_verified=True,
    )
    user.created_at = datetime.now(UTC) - timedelta(days=days_old)
    db_session.add(user)
    await db_session.flush()
    await db_session.refresh(user)
    return user


import uuid
async def _create_project(
    db_session: AsyncSession, freelancer_id: str, status: ProjectStatus, days_ago: int = 5
) -> Project:
    uid = uuid.uuid4().hex[:4]
    client = User(
        phone_number=f"+91880{uid.ljust(7, '0')}",
        full_name=f"Client {days_ago}",
        role=UserRole.client,
    )
    db_session.add(client)
    await db_session.flush()
    await db_session.refresh(client)

    project = Project(
        title=f"Test Project {status.value}",
        description="A test project",
        freelancer_id=freelancer_id,
        client_id=client.id,
        status=status,
        total_amount=Decimal("1000.00"),
        platform_fee_amount=Decimal("20.00"),
        freelancer_payout_amount=Decimal("980.00"),
        currency="INR",
        escrow_held_at=datetime.now(UTC) - timedelta(days=days_ago),
    )
    db_session.add(project)
    await db_session.flush()
    await db_session.refresh(project)
    return project


async def _add_milestone(
    db_session: AsyncSession, project: Project, is_late: bool, days_ago: int = 1
) -> Milestone:
    release_time = datetime.now(UTC) - timedelta(days=days_ago)
    milestone = Milestone(
        project_id=project.id,
        title="Test Milestone",
        description="Milestone description",
        amount=project.total_amount,
        sequence_number=1,
        status=MilestoneStatus.released,
        released_at=release_time,
    )
    
    # Force project deadline if late
    if is_late:
        project.deadline = (release_time - timedelta(days=2)).date()
        db_session.add(project)
    
    db_session.add(milestone)
    await db_session.flush()
    return milestone


async def _add_whatsapp_sessions(db_session: AsyncSession, user_id: str, count: int) -> None:
    now = datetime.now(UTC)
    for i in range(count):
        session = WhatsAppSession(
            user_id=user_id,
            phone_number=f"+91WA{str(i).zfill(8)}",  # Doesn't strictly matter for the query
            session_state={"state": "IDLE"},
            last_message_at=now - timedelta(hours=i),
            expires_at=now + timedelta(days=1),
        )
        db_session.add(session)
    await db_session.flush()


# ══════════════════════════════════════════════════════════════════════════════
# Tests
# ══════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_new_user_score(db_session: AsyncSession) -> None:
    """A completely new user should get a neutral default score."""
    user = await _create_user(db_session, days_old=0)
    
    score = await trust_score_service.calculate_and_save(str(user.id), db_session)
    
    assert score is not None
    assert score.total_projects == 0
    # completion rate default = 0.5 * 40 = 20
    # delivery speed default = 0.5 * 25 = 12.5
    # response rate default = 0.8 * 20 = 16
    # longevity bonus = 0 * 15 = 0
    # expected raw = 48.50 -> rounded to two decimal places
    assert float(score.score) == 48.50
    assert score.avg_delivery_days is None


@pytest.mark.asyncio
async def test_perfect_score_scenario(db_session: AsyncSession) -> None:
    """Perfect reliability user -> high score."""
    user = await _create_user(db_session, days_old=365)  # Max longevity bonus
    
    # 3 completed projects, all on time
    for _ in range(3):
        project = await _create_project(db_session, str(user.id), ProjectStatus.completed)
        await _add_milestone(db_session, project, is_late=False)

    # Add 5 active WhatsApp sessions
    await _add_whatsapp_sessions(db_session, str(user.id), 5)

    score = await trust_score_service.calculate_and_save(str(user.id), db_session)
    
    assert score.total_projects == 3
    assert score.completed_projects == 3
    assert score.disputed_projects == 0
    
    # completion rate = 1.0 * 40 = 40
    # delivery speed = 1.0 * 25 = 25
    # response rate = 0.85 * 20 = 17 (from placeholder logic)
    # longevity = 1.0 * 15 = 15
    # expected raw = 97.00
    assert float(score.score) == 97.00


@pytest.mark.asyncio
async def test_low_score_scenario(db_session: AsyncSession) -> None:
    """User with disputes and late deliveries -> low score."""
    user = await _create_user(db_session, days_old=30)  # Low longevity
    
    # 1 completed late
    p1 = await _create_project(db_session, str(user.id), ProjectStatus.completed)
    await _add_milestone(db_session, p1, is_late=True)
    
    # 2 disputed
    for _ in range(2):
        await _create_project(db_session, str(user.id), ProjectStatus.disputed)

    score = await trust_score_service.calculate_and_save(str(user.id), db_session)
    
    assert score.total_projects == 3
    assert score.completed_projects == 1
    assert score.disputed_projects == 2
    
    # completion rate = 1/3 * 40 = 13.33
    # delivery speed = 0 (1 late, 0 on-time) * 25 = 0
    # response rate = <5 sessions -> default 0.8 * 20 = 16
    # longevity = 30/365 = 0.082 * 15 = 1.23
    # expected raw ~ 30.56
    assert float(score.score) > 25.0
    assert float(score.score) < 35.0


@pytest.mark.asyncio
async def test_batch_recalculation(db_session: AsyncSession) -> None:
    """Test batch recalculation method."""
    u1 = await _create_user(db_session, days_old=10)
    u2 = await _create_user(db_session, days_old=20)
    
    processed = await trust_score_service.recalculate_batch([str(u1.id), str(u2.id)], db_session)
    assert processed == 2


def test_badges_elite_and_volume() -> None:
    """Badge system properly assigns tags."""
    ts = TrustScore(
        score=Decimal("95.00"),
        completed_projects=60,
        disputed_projects=0,
        avg_delivery_days=Decimal("2.5"),
    )
    user = User(is_verified=True, created_at=datetime.now(UTC) - timedelta(days=400))
    
    badges = trust_score_service.get_badges(ts, user)
    
    assert "elite" in badges
    assert "expert" in badges        # >= 50 completed
    assert "fast_delivery" in badges # < 5 days delivery
    assert "established" in badges   # > 365 days old
    
    # Exclusive score tier
    assert "verified_pro" not in badges
    assert "trusted" not in badges


def test_badges_verified_pro_and_veteran() -> None:
    ts = TrustScore(
        score=Decimal("80.00"),
        completed_projects=15,
        disputed_projects=1,
        avg_delivery_days=Decimal("6.0"),
    )
    user = User(is_verified=True, created_at=datetime.now(UTC) - timedelta(days=100))
    
    badges = trust_score_service.get_badges(ts, user)
    
    assert "verified_pro" in badges
    assert "veteran" in badges
    
    assert "elite" not in badges
    assert "expert" not in badges
    assert "fast_delivery" not in badges
    assert "established" not in badges


def test_badges_trusted() -> None:
    ts = TrustScore(
        score=Decimal("65.00"),
        completed_projects=5,
        disputed_projects=0,
    )
    user = User(is_verified=False, created_at=datetime.now(UTC) - timedelta(days=10))
    
    badges = trust_score_service.get_badges(ts, user)
    
    assert "trusted" in badges
    assert "veteran" not in badges


def test_badges_low_score() -> None:
    ts = TrustScore(
        score=Decimal("40.00"),
        completed_projects=1,
    )
    user = User(is_verified=False)
    
    badges = trust_score_service.get_badges(ts, user)
    
    # Below 60 score, < 10 projects, no verified, no longevity -> no badges at all
    assert len(badges) == 0
