from __future__ import annotations
"""
StayVise — Generic async CRUD base
===================================
Usage
-----
Define a concrete CRUD class for each model::

    from app.db.crud.base import CRUDBase
    from app.db.models import Project
    from app.schemas.project import ProjectCreate, ProjectUpdate

    class CRUDProject(CRUDBase[Project, ProjectCreate, ProjectUpdate]):
        async def get_by_razorpay_order(
            self, db: AsyncSession, *, order_id: str
        ) -> Optional[Project]:
            result = await db.execute(
                select(Project).where(Project.razorpay_order_id == order_id)
            )
            return result.scalar_one_or_none()

    project = CRUDProject(Project)

Then inject in routes::

    @router.get("/{project_id}")
    async def read_project(project_id: str, db: DbSession) -> ProjectRead:
        obj = await project.get(db, id=project_id)
        if not obj:
            raise HTTPException(404)
        return obj
"""


from typing import Optional, Any, Generic, TypeVar

from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Base

# ── Generic type vars ──────────────────────────────────────────────────────────

ModelType = TypeVar("ModelType", bound=Base)
CreateSchemaType = TypeVar("CreateSchemaType", bound=BaseModel)
UpdateSchemaType = TypeVar("UpdateSchemaType", bound=BaseModel)


# ══════════════════════════════════════════════════════════════════════════════
# CRUDBase
# ══════════════════════════════════════════════════════════════════════════════


class CRUDBase(Generic[ModelType, CreateSchemaType, UpdateSchemaType]):
    """
    Async CRUD operations generic over SQLAlchemy model + two Pydantic schemas.

    Args:
        model: The SQLAlchemy ORM class (e.g. ``User``, ``Project``).
    """

    def __init__(self, model: type[ModelType]) -> None:
        self.model = model

    # ── Read ───────────────────────────────────────────────────────────────────

    async def get(self, db: AsyncSession, *, id: Any) -> Optional[ModelType]:
        """
        Fetch a single record by primary key.

        Returns ``None`` when not found (never raises 404 — that's the
        router's job).
        """
        result = await db.execute(select(self.model).where(self.model.id == id))  # type: ignore[attr-defined]
        return result.scalar_one_or_none()

    async def get_or_404(self, db: AsyncSession, *, id: Any) -> ModelType:
        """
        Fetch by PK; raise ``HTTPException(404)`` when missing.
        Convenience for routers that always expect the record to exist.
        """
        from fastapi import HTTPException  # local import — avoids coupling base to FastAPI

        obj = await self.get(db, id=id)
        if obj is None:
            raise HTTPException(
                status_code=404,
                detail=f"{self.model.__name__} with id={id!r} not found.",
            )
        return obj

    async def get_by(
        self,
        db: AsyncSession,
        **filters: Any,
    ) -> Optional[ModelType]:
        """
        Fetch the first record matching all keyword filters.

        Example::
            user = await crud_user.get_by(db, phone_number="+919876543210")
        """
        stmt = select(self.model)
        for field, value in filters.items():
            stmt = stmt.where(getattr(self.model, field) == value)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_multi(
        self,
        db: AsyncSession,
        *,
        skip: int = 0,
        limit: int = 20,
        order_by: Optional[Any] = None,
        **filters: Any,
    ) -> list[ModelType]:
        """
        Paginated list with optional equality filters.

        Args:
            skip:     Number of records to skip (offset).
            limit:    Max records to return (capped at 200 for safety).
            order_by: SQLAlchemy column expression, e.g. ``Project.created_at.desc()``.
            **filters: Field=value equality filters (ANDed together).

        Example::
            projects = await crud_project.get_multi(
                db, skip=0, limit=10,
                order_by=Project.created_at.desc(),
                freelancer_id=user.id,
            )
        """
        limit = min(limit, 200)
        stmt = select(self.model)
        for field, value in filters.items():
            stmt = stmt.where(getattr(self.model, field) == value)
        if order_by is not None:
            stmt = stmt.order_by(order_by)
        stmt = stmt.offset(skip).limit(limit)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def get_keyset_multi(
        self,
        db: AsyncSession,
        *,
        cursor: Optional[datetime | str] = None,
        limit: int = 20,
        descending: bool = True,
        sort_column: str = "created_at",
        **filters: Any,
    ) -> list[ModelType]:
        """
        Keyset-based (cursor) pagination. 
        More efficient than offset for large datasets and deep paging.
        
        Args:
            cursor: Values for the sort_column from the last item of previous page.
            limit:  Max records.
            descending: Order of result.
            sort_column: Column to sort and paginate by. Must be indexed and ideally unique.
        """
        limit = min(limit, 200)
        stmt = select(self.model)
        
        for field, value in filters.items():
            stmt = stmt.where(getattr(self.model, field) == value)
            
        col = getattr(self.model, sort_column)
        
        if cursor:
            if descending:
                stmt = stmt.where(col < cursor)
            else:
                stmt = stmt.where(col > cursor)
                
        if descending:
            stmt = stmt.order_by(col.desc())
        else:
            stmt = stmt.order_by(col.asc())
            
        stmt = stmt.limit(limit)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def count(self, db: AsyncSession, **filters: Any) -> int:
        """
        Count records matching optional equality filters.

        Example::
            total = await crud_project.count(db, freelancer_id=user.id)
        """
        stmt = select(func.count()).select_from(self.model)
        for field, value in filters.items():
            stmt = stmt.where(getattr(self.model, field) == value)
        result = await db.execute(stmt)
        return result.scalar_one()

    async def exists(self, db: AsyncSession, *, id: Any) -> bool:
        """Return True when a record with the given PK exists."""
        stmt = select(func.count()).select_from(self.model).where(
            self.model.id == id  # type: ignore[attr-defined]
        )
        result = await db.execute(stmt)
        return result.scalar_one() > 0

    # ── Write ──────────────────────────────────────────────────────────────────

    async def create(
        self,
        db: AsyncSession,
        *,
        obj_in: CreateSchemaType,
        extra: dict[str, Optional[Any]] = None,
    ) -> ModelType:
        """
        Insert a new record.

        Args:
            obj_in: Pydantic create-schema instance.
            extra:  Additional fields not in the schema (e.g. computed values).

        The session is NOT committed here — the ``get_db`` dependency handles
        that so callers can group multiple writes in one transaction.
        """
        data = jsonable_encoder(obj_in, exclude_unset=True)
        if extra:
            data.update(extra)
        db_obj = self.model(**data)
        db.add(db_obj)
        await db.flush()   # Assigns PK / server defaults without committing
        await db.refresh(db_obj)
        return db_obj

    async def update(
        self,
        db: AsyncSession,
        *,
        db_obj: ModelType,
        obj_in: UpdateSchemaType | dict[str, Any],
    ) -> ModelType:
        """
        Partially update an existing record.

        Accepts either a Pydantic schema (only set fields applied) or a plain
        dict (all provided keys applied).

        Args:
            db_obj: The SQLAlchemy ORM instance to update (already fetched).
            obj_in: New field values.
        """
        if isinstance(obj_in, dict):
            update_data = obj_in
        else:
            update_data = obj_in.model_dump(exclude_unset=True)

        for field, value in update_data.items():
            if hasattr(db_obj, field):
                setattr(db_obj, field, value)

        db.add(db_obj)
        await db.flush()
        await db.refresh(db_obj)
        return db_obj

    async def remove(self, db: AsyncSession, *, id: Any) -> Optional[ModelType]:
        """
        Delete a record by PK and return the deleted object (or None if not found).

        The deletion is flushed but not committed — caller controls the transaction.
        """
        obj = await self.get(db, id=id)
        if obj is not None:
            await db.delete(obj)
            await db.flush()
        return obj

    async def bulk_create(
        self,
        db: AsyncSession,
        *,
        objs_in: list[CreateSchemaType],
        extra: dict[str, Optional[Any]] = None,
    ) -> list[ModelType]:
        """
        Insert multiple records in a single flush.
        Useful for milestone batch creation.
        """
        db_objs: list[ModelType] = []
        for obj_in in objs_in:
            data = jsonable_encoder(obj_in, exclude_unset=True)
            if extra:
                data.update(extra)
            db_obj = self.model(**data)
            db.add(db_obj)
            db_objs.append(db_obj)

        await db.flush()
        for obj in db_objs:
            await db.refresh(obj)
        return db_objs
