"""
UR Labels router — color-coded tags for User Requirements.
"""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.database.models import Employee, URLabel
from app.services.auth_service import get_current_user

router = APIRouter()


class LabelCreate(BaseModel):
    name: str
    color: str = "#6b7280"
    description: Optional[str] = None


class LabelUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    description: Optional[str] = None


class LabelOut(BaseModel):
    id: str
    name: str
    color: str
    description: Optional[str] = None
    created_at: str


def _out(lb: URLabel) -> LabelOut:
    return LabelOut(
        id=str(lb.id),
        name=lb.name,
        color=lb.color,
        description=lb.description,
        created_at=lb.created_at.isoformat(),
    )


@router.get("/ur-labels", response_model=list[LabelOut])
async def list_labels(
    db: AsyncSession = Depends(get_db),
    _: Employee = Depends(get_current_user),
):
    result = await db.execute(select(URLabel).order_by(URLabel.name))
    return [_out(lb) for lb in result.scalars().all()]


@router.post("/ur-labels", response_model=LabelOut, status_code=201)
async def create_label(
    data: LabelCreate,
    db: AsyncSession = Depends(get_db),
    _: Employee = Depends(get_current_user),
):
    lb = URLabel(name=data.name, color=data.color, description=data.description)
    db.add(lb)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, f"Label '{data.name}' already exists")
    return _out(lb)


@router.put("/ur-labels/{label_id}", response_model=LabelOut)
async def update_label(
    label_id: str,
    data: LabelUpdate,
    db: AsyncSession = Depends(get_db),
    _: Employee = Depends(get_current_user),
):
    lb = await db.get(URLabel, uuid.UUID(label_id))
    if not lb:
        raise HTTPException(404, "Label not found")
    if data.name is not None:
        lb.name = data.name
    if data.color is not None:
        lb.color = data.color
    if data.description is not None:
        lb.description = data.description
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, f"Label name '{data.name}' already exists")
    return _out(lb)


@router.delete("/ur-labels/{label_id}", status_code=204)
async def delete_label(
    label_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Employee = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(403, "Admin access required to delete labels")
    lb = await db.get(URLabel, uuid.UUID(label_id))
    if not lb:
        raise HTTPException(404, "Label not found")
    await db.delete(lb)
