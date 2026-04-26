import asyncio
from sqlalchemy import update, select
from app.db.session import get_session_factory
from app.models.user import User

async def update_admin():
    session_factory = get_session_factory()
    async with session_factory() as db:
        # Check if user exists
        result = await db.execute(select(User).where(User.email == "dr.anuragkr@gmail.com"))
        user = result.scalar_one_or_none()
        
        if user:
            print(f"Current name: {user.full_name}")
            await db.execute(
                update(User)
                .where(User.email == "dr.anuragkr@gmail.com")
                .values(full_name="Anurag")
            )
            await db.commit()
            print("Admin name updated to Anurag in DB.")
        else:
            print("Admin user not found in DB.")

if __name__ == "__main__":
    asyncio.run(update_admin())
