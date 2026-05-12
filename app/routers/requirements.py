"""
Requirements router — UR Lifecycle Management.

Status machine:
  draft -> analysis -> approved -> dev_ready -> done
  Any non-terminal state -> rejected
  rejected -> draft (re-open)
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.database.models import Employee, Project, URLabel, UserRequirement
from app.services.auth_service import get_current_user

router = APIRouter()

VALID_TRANSITIONS: dict[str, list[str]] = {
    "draft": ["analysis", "rejected"],
    "analysis": ["approved", "draft", "rejected"],
    "approved": ["dev_ready", "analysis", "rejected"],
    "dev_ready": ["done", "approved", "rejected"],
    "done": ["dev_ready"],
    "rejected": ["draft"],
}

STATUS_LABELS = {
    "draft": "Draft",
    "analysis": "Analysis",
    "approved": "Approved",
    "dev_ready": "Dev-Ready",
    "done": "Done",
    "rejected": "Rejected",
}

VALID_PRIORITIES = {"critical", "high", "medium", "low"}

_MAX_ID_RETRIES = 5


# ---------------------------------------------------------------------------
# DTOs
# ---------------------------------------------------------------------------

class LabelOut(BaseModel):
    id: str
    name: str
    color: str
    description: Optional[str] = None


class UROut(BaseModel):
    id: str
    requirement_id: str
    title: str
    description: Optional[str] = None
    acceptance_criteria: Optional[str] = None
    status: str
    priority: str
    source_document_id: Optional[str] = None
    source_document_title: Optional[str] = None
    project_id: Optional[str] = None
    project_name: Optional[str] = None
    assignee_id: Optional[str] = None
    assignee_name: Optional[str] = None
    source_text: Optional[str] = None
    jira_key: Optional[str] = None
    jira_url: Optional[str] = None
    labels: list[LabelOut] = []
    created_at: str
    updated_at: str
    approved_at: Optional[str] = None
    valid_transitions: list[str] = []


class URCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = None
    acceptance_criteria: Optional[str] = None
    priority: str = "medium"
    source_document_id: Optional[str] = None
    project_id: Optional[str] = None
    assignee_id: Optional[str] = None
    source_text: Optional[str] = None
    label_ids: list[str] = []

    @field_validator("title", mode="before")
    @classmethod
    def strip_title(cls, v: str) -> str:
        if isinstance(v, str):
            v = v.strip()
        return v


class URUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    acceptance_criteria: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    source_document_id: Optional[str] = None
    project_id: Optional[str] = None
    assignee_id: Optional[str] = None
    source_text: Optional[str] = None
    label_ids: Optional[list[str]] = None


class URStatusUpdate(BaseModel):
    status: str


class URKanbanColumn(BaseModel):
    status: str
    label: str
    items: list[UROut]


class KanbanBoard(BaseModel):
    columns: list[URKanbanColumn]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_uuid_field(value: Optional[str], field_name: str) -> Optional[uuid.UUID]:
    if not value:
        return None
    try:
        return uuid.UUID(value)
    except ValueError:
        raise HTTPException(400, f"Invalid UUID for '{field_name}': {value!r}")


def _ur_out(ur: UserRequirement) -> UROut:
    return UROut(
        id=str(ur.id),
        requirement_id=ur.requirement_id,
        title=ur.title,
        description=ur.description,
        acceptance_criteria=ur.acceptance_criteria,
        status=ur.status,
        priority=ur.priority,
        source_document_id=str(ur.source_document_id) if ur.source_document_id else None,
        source_document_title=ur.source_document.title if ur.source_document else None,
        project_id=str(ur.project_id) if ur.project_id else None,
        project_name=ur.project.name if ur.project else None,
        assignee_id=str(ur.assignee_id) if ur.assignee_id else None,
        assignee_name=ur.assignee.name if ur.assignee else None,
        source_text=ur.source_text,
        jira_key=ur.jira_key,
        jira_url=ur.jira_url,
        labels=[
            LabelOut(id=str(lb.id), name=lb.name, color=lb.color, description=lb.description)
            for lb in (ur.labels or [])
        ],
        created_at=ur.created_at.isoformat(),
        updated_at=ur.updated_at.isoformat(),
        approved_at=ur.approved_at.isoformat() if ur.approved_at else None,
        valid_transitions=VALID_TRANSITIONS.get(ur.status, []),
    )


async def _load_ur(db: AsyncSession, ur_id: uuid.UUID) -> UserRequirement:
    result = await db.execute(
        select(UserRequirement)
        .where(UserRequirement.id == ur_id)
        .options(
            selectinload(UserRequirement.labels),
            selectinload(UserRequirement.project),
            selectinload(UserRequirement.assignee),
            selectinload(UserRequirement.source_document),
        )
    )
    ur = result.scalar_one_or_none()
    if not ur:
        raise HTTPException(404, "Requirement not found")
    return ur


async def _generate_requirement_id(db: AsyncSession) -> str:
    year = datetime.now(timezone.utc).year
    prefix = f"UR-{year}-"
    result = await db.execute(
        select(func.max(UserRequirement.requirement_id)).where(
            UserRequirement.requirement_id.like(f"{prefix}%")
        )
    )
    max_id = result.scalar()
    if max_id:
        try:
            num = int(max_id.split("-")[-1]) + 1
        except (ValueError, IndexError):
            num = 1
    else:
        num = 1
    return f"{prefix}{num:03d}"


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/requirements", response_model=list[UROut])
async def list_requirements(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    search: Optional[str] = Query(None),
    project_id: Optional[str] = None,
    assignee_id: Optional[str] = None,
    label_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    _: Employee = Depends(get_current_user),
):
    stmt = (
        select(UserRequirement)
        .options(
            selectinload(UserRequirement.labels),
            selectinload(UserRequirement.project),
            selectinload(UserRequirement.assignee),
            selectinload(UserRequirement.source_document),
        )
        .order_by(UserRequirement.updated_at.desc())
    )
    if status:
        stmt = stmt.where(UserRequirement.status == status)
    if priority:
        stmt = stmt.where(UserRequirement.priority == priority)
    if project_id:
        stmt = stmt.where(
            UserRequirement.project_id == _parse_uuid_field(project_id, "project_id")
        )
    if assignee_id:
        stmt = stmt.where(
            UserRequirement.assignee_id == _parse_uuid_field(assignee_id, "assignee_id")
        )
    if label_id:
        stmt = stmt.where(
            UserRequirement.labels.any(URLabel.id == _parse_uuid_field(label_id, "label_id"))
        )
    if search:
        like = f"%{search}%"
        stmt = stmt.where(
            UserRequirement.title.ilike(like) | UserRequirement.description.ilike(like)
        )
    stmt = stmt.offset(skip).limit(limit)
    result = await db.execute(stmt)
    return [_ur_out(r) for r in result.scalars().all()]


@router.get("/requirements/kanban", response_model=KanbanBoard)
async def get_kanban(
    project_id: Optional[str] = None,
    assignee_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: Employee = Depends(get_current_user),
):
    stmt = (
        select(UserRequirement)
        .options(
            selectinload(UserRequirement.labels),
            selectinload(UserRequirement.project),
            selectinload(UserRequirement.assignee),
            selectinload(UserRequirement.source_document),
        )
        .order_by(UserRequirement.updated_at.desc())
    )
    if project_id:
        stmt = stmt.where(
            UserRequirement.project_id == _parse_uuid_field(project_id, "project_id")
        )
    if assignee_id:
        stmt = stmt.where(
            UserRequirement.assignee_id == _parse_uuid_field(assignee_id, "assignee_id")
        )

    result = await db.execute(stmt)
    all_urs = result.scalars().all()

    columns = [
        URKanbanColumn(
            status=status,
            label=STATUS_LABELS[status],
            items=[_ur_out(r) for r in all_urs if r.status == status],
        )
        for status in VALID_TRANSITIONS
    ]
    return KanbanBoard(columns=columns)


@router.get("/requirements/{requirement_id}", response_model=UROut)
async def get_requirement(
    requirement_id: str,
    db: AsyncSession = Depends(get_db),
    _: Employee = Depends(get_current_user),
):
    ur_uuid = _parse_uuid_field(requirement_id, "requirement_id")
    if not ur_uuid:
        raise HTTPException(400, "requirement_id is required")
    return _ur_out(await _load_ur(db, ur_uuid))


@router.post("/requirements", response_model=UROut, status_code=201)
async def create_requirement(
    data: URCreate,
    db: AsyncSession = Depends(get_db),
    _: Employee = Depends(get_current_user),
):
    if data.priority and data.priority not in VALID_PRIORITIES:
        raise HTTPException(400, f"priority must be one of: {sorted(VALID_PRIORITIES)}")

    project_uuid = _parse_uuid_field(data.project_id, "project_id")
    assignee_uuid = _parse_uuid_field(data.assignee_id, "assignee_id")
    source_uuid = _parse_uuid_field(data.source_document_id, "source_document_id")

    if project_uuid and not await db.get(Project, project_uuid):
        raise HTTPException(400, f"Project '{data.project_id}' not found")
    if assignee_uuid and not await db.get(Employee, assignee_uuid):
        raise HTTPException(400, f"Assignee '{data.assignee_id}' not found")

    labels: list[URLabel] = []
    if data.label_ids:
        label_uuids = [uuid.UUID(lid) for lid in data.label_ids]
        res = await db.execute(select(URLabel).where(URLabel.id.in_(label_uuids)))
        labels = list(res.scalars().all())

    ur: UserRequirement
    for attempt in range(_MAX_ID_RETRIES):
        try:
            req_id = await _generate_requirement_id(db)
            ur = UserRequirement(
                requirement_id=req_id,
                title=data.title,
                description=data.description,
                acceptance_criteria=data.acceptance_criteria,
                priority=data.priority or "medium",
                source_document_id=source_uuid,
                project_id=project_uuid,
                assignee_id=assignee_uuid,
                source_text=data.source_text,
                status="draft",
            )
            ur.labels = labels
            db.add(ur)
            await db.flush()
            break
        except IntegrityError:
            await db.rollback()
            if attempt == _MAX_ID_RETRIES - 1:
                raise HTTPException(
                    500, "Could not generate a unique requirement ID after retries"
                )
            if data.label_ids:
                label_uuids = [uuid.UUID(lid) for lid in data.label_ids]
                res = await db.execute(select(URLabel).where(URLabel.id.in_(label_uuids)))
                labels = list(res.scalars().all())
            else:
                labels = []

    return _ur_out(await _load_ur(db, ur.id))


@router.put("/requirements/{requirement_id}", response_model=UROut)
async def update_requirement(
    requirement_id: str,
    data: URUpdate,
    db: AsyncSession = Depends(get_db),
    _: Employee = Depends(get_current_user),
):
    ur_uuid = _parse_uuid_field(requirement_id, "requirement_id")
    if not ur_uuid:
        raise HTTPException(400, "requirement_id is required")
    ur = await _load_ur(db, ur_uuid)
    update_data = data.model_dump(exclude_unset=True)

    new_status = update_data.get("status")
    if new_status and new_status != ur.status:
        allowed = VALID_TRANSITIONS.get(ur.status, [])
        if new_status not in allowed:
            raise HTTPException(
                400,
                f"Invalid transition: {ur.status} -> {new_status}. Valid: {allowed}",
            )
        if new_status == "approved":
            ur.approved_at = datetime.now(timezone.utc)

    label_ids_raw = update_data.pop("label_ids", None)
    if label_ids_raw is not None:
        label_uuids = [uuid.UUID(lid) for lid in label_ids_raw]
        res = await db.execute(select(URLabel).where(URLabel.id.in_(label_uuids)))
        ur.labels = list(res.scalars().all())

    for field, value in update_data.items():
        if field in ("source_document_id", "project_id", "assignee_id"):
            setattr(ur, field, _parse_uuid_field(value, field) if value else None)
        else:
            setattr(ur, field, value)

    await db.flush()
    ur_id = ur.id  # capture before expire invalidates the attribute
    db.expire(ur)
    return _ur_out(await _load_ur(db, ur_id))


@router.patch("/requirements/{requirement_id}/status", response_model=UROut)
async def update_status(
    requirement_id: str,
    data: URStatusUpdate,
    db: AsyncSession = Depends(get_db),
    _: Employee = Depends(get_current_user),
):
    ur_uuid = _parse_uuid_field(requirement_id, "requirement_id")
    if not ur_uuid:
        raise HTTPException(400, "requirement_id is required")
    ur = await _load_ur(db, ur_uuid)
    allowed = VALID_TRANSITIONS.get(ur.status, [])
    if data.status not in allowed:
        raise HTTPException(
            400,
            f"Invalid transition: {ur.status} -> {data.status}. Valid: {allowed}",
        )
    ur.status = data.status
    if data.status == "approved":
        ur.approved_at = datetime.now(timezone.utc)
    await db.flush()
    ur_id = ur.id  # capture before expire invalidates the attribute
    db.expire(ur)
    return _ur_out(await _load_ur(db, ur_id))


@router.delete("/requirements/{requirement_id}", status_code=204)
async def delete_requirement(
    requirement_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Employee = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(403, "Admin access required to delete requirements")
    ur_uuid = _parse_uuid_field(requirement_id, "requirement_id")
    if not ur_uuid:
        raise HTTPException(400, "requirement_id is required")
    ur = await db.get(UserRequirement, ur_uuid)
    if not ur:
        raise HTTPException(404, "Requirement not found")
    await db.delete(ur)
