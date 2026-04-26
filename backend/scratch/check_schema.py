import asyncio
from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import create_async_engine
import sys
import os

# Add current directory to path
sys.path.append(os.getcwd())

from app.core.config import settings
from app.db.models import Base

async def check_schema():
    print(f"Connecting to database...")
    engine = create_async_engine(str(settings.DATABASE_URL))
    
    async with engine.connect() as conn:
        def inspect_sync(connection):
            inspector = inspect(connection)
            db_tables = inspector.get_table_names()
            model_tables = Base.metadata.tables.keys()
            
            print(f"\nTables in DB: {db_tables}")
            print(f"Tables in Models: {list(model_tables)}")
            
            for table_name in model_tables:
                if table_name not in db_tables:
                    print(f"MISSING TABLE: {table_name}")
                    continue
                
                db_columns = {c['name'] for c in inspector.get_columns(table_name)}
                model_columns = {c.name for c in Base.metadata.tables[table_name].columns}
                
                missing_in_db = model_columns - db_columns
                if missing_in_db:
                    print(f"Table '{table_name}' is missing columns in DB: {missing_in_db}")
                else:
                    print(f"Table '{table_name}' matches model columns.")

        await conn.run_sync(inspect_sync)
    
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(check_schema())
