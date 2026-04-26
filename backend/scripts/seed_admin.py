import asyncio
from app.db.session import get_session_factory
from app.db.models import User, UserRole
from app.core.security import hash_password
from sqlalchemy import select

async def seed_admin():
    async_session = get_session_factory()
    async with async_session() as session:
        # 1. Update/Create new admin
        result = await session.execute(select(User).where(User.email == "dr.anuragkr@gmail.com"))
        admin_user = result.scalar_one_or_none()

        if admin_user:
            admin_user.phone_number = "+919470961258"
            admin_user.role = UserRole.admin
            admin_user.password_hash = None # Sign-in with link enabled
            admin_user.is_verified = True
        else:
            admin_user = User(
                email="dr.anuragkr@gmail.com",
                phone_number="+919470961258",
                full_name="Anurag (Admin)",
                password_hash=None,
                role=UserRole.admin,
                is_verified=True,
                is_active=True,
            )
            session.add(admin_user)

        # 2. Optionally clean up old admin if it exists
        old_result = await session.execute(select(User).where(User.email == "anurag@stayvise.in"))
        old_admin = old_result.scalar_one_or_none()
        if old_admin and old_admin.email != "dr.anuragkr@gmail.com":
            await session.delete(old_admin)

        await session.commit()

if __name__ == "__main__":
    asyncio.run(seed_admin())
