import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from app.db.models import Base
from app.core.config import settings

async def audit_schema():
    engine = create_async_engine(settings.DATABASE_URL)
    
    missing_columns = []
    
    async with engine.connect() as conn:
        for table_name, table in Base.metadata.tables.items():
            # Check if table exists
            res = await conn.execute(text(
                "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = :t)"
            ), {"t": table_name})
            if not res.scalar():
                print(f"MISSING TABLE: {table_name}")
                continue
                
            # Get columns from DB
            res = await conn.execute(text(
                "SELECT column_name FROM information_schema.columns WHERE table_name = :t"
            ), {"t": table_name})
            db_columns = {r[0] for r in res.fetchall()}
            
            # Compare with model
            for col in table.columns:
                if col.name not in db_columns:
                    # Determine SQL type
                    col_type = str(col.type)
                    if "VARCHAR" in col_type:
                        pass # use as is
                    elif "JSON" in col_type:
                        col_type = "JSONB"
                    elif "DateTime" in col_type:
                        col_type = "TIMESTAMP WITH TIME ZONE"
                    elif "Integer" in col_type:
                        col_type = "INTEGER"
                    elif "Boolean" in col_type:
                        col_type = "BOOLEAN"
                    elif "GUID" in col_type:
                        col_type = "UUID"
                    
                    missing_columns.append((table_name, col.name, col_type))
    
    if not missing_columns:
        print("NO MISSING COLUMNS FOUND")
    else:
        print(f"FOUND {len(missing_columns)} MISSING COLUMNS:")
        for table, col, ctype in missing_columns:
            # We use a safe subset of types for the ADD COLUMN command
            print(f"ALTER TABLE {table} ADD COLUMN {col} {ctype};")

if __name__ == "__main__":
    asyncio.run(audit_schema())
