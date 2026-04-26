import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
import sys
import os

# Add current directory to path
sys.path.append(os.getcwd())

try:
    from app.core.config import settings
except ImportError:
    print("Could not import app.core.config. Make sure you are running from the backend directory.")
    sys.exit(1)

async def reset_db():
    db_url = str(settings.DATABASE_URL)
    print(f"Connecting to database...")
    
    # Use sync engine for schema manipulation if possible, but let's stick to async as per project setup
    engine = create_async_engine(db_url)
    
    async with engine.connect() as conn:
        print("Wiping schema 'public'...")
        # CASCADE ensures dependent objects (tables, types, etc.) are also dropped
        await conn.execute(text("DROP SCHEMA IF EXISTS public CASCADE;"))
        await conn.execute(text("CREATE SCHEMA public;"))
        
        # Restore default permissions (Postgres defaults)
        await conn.execute(text("GRANT ALL ON SCHEMA public TO public;"))
        
        # Ensure the stayvise user (if separate) has rights
        db_user = db_url.split("://")[1].split(":")[0]
        if db_user:
            await conn.execute(text(f"GRANT ALL ON SCHEMA public TO {db_user};"))
            
        await conn.commit()
        print("Schema 'public' has been successfully reset.")
    
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(reset_db())
