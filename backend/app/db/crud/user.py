from __future__ import annotations
"""
StayVise — Concrete CRUD classes for every model.

Usage in a router::

    from app.db.crud import user as crud_user
    u = await crud_user.get_by_phone(db, phone="+919876543210")
"""


from typing import Optional, Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.db.crud.base import CRUDBase
from app.db.models import User, UserRole
from app.schemas.user import UserCreate, UserUpdate


class CRUDUser(CRUDBase[User, UserCreate, UserUpdate]):
    """Extended CRUD for User with phone/email helpers."""

    async def get_by_phone(
        self, db: AsyncSession, *, phone: str
    ) -> Optional[User]:
        return await self.get_by(db, phone_number=phone)

    async def get_by_email(
        self, db: AsyncSession, *, email: str
    ) -> Optional[User]:
        return await self.get_by(db, email=email)

    async def create_with_password(
        self,
        db: AsyncSession,
        *,
        obj_in: UserCreate,
    ) -> User:
        """Hash password before persisting (password may be None for OTP users)."""
        data: dict[str, Any] = obj_in.model_dump(exclude={"password"})
        if obj_in.password:
            data["password_hash"] = hash_password(obj_in.password)
        db_obj = User(**data)
        db.add(db_obj)
        await db.flush()
        await db.refresh(db_obj)
        return db_obj

    async def get_active_freelancers(
        self, db: AsyncSession, *, skip: int = 0, limit: int = 20
    ) -> list[User]:
        result = await db.execute(
            select(User)
            .where(User.role == UserRole.freelancer, User.is_active.is_(True))
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def mark_verified(self, db: AsyncSession, *, user: User) -> User:
        return await self.update(db, db_obj=user, obj_in={"is_verified": True})

    async def complete_onboarding(self, db: AsyncSession, *, user: User) -> User:
        return await self.update(db, db_obj=user, obj_in={"onboarding_complete": True})


user = CRUDUser(User)
