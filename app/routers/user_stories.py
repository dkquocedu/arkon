"""User Stories router — AI-generated and manual user stories linked to URs."""

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.database.models import Employee, UserRequirement, UserStory
from app.services.auth_service import get_current_user

router = APIRouter()

GENERATE_ALLOWED_STATUSES = {"approved", "dev_ready", "done"}
_MAX_ID_RETRIES = 5


# ---------------------------------------------------------------------------
# DTOs
# ---------------------------------------------------------------------------

class UserStoryOut(BaseModel):
    id: str
    story_id: str
    ur_id: str
    title: str
    persona: str
    goal: str
    business_value: str
    priority: str
    estimate: Optional[str] = None
    acceptance_criteria: str
    invest_notes: Optional[str] = None
    split_recommendation: Optional[str] = None
    generated_by: str
    created_at: str
    updated_at: str


class UserStoryCreate(BaseModel):
    title: str
    persona: str
    goal: str
    business_value: str
    priority: str = "must"
    estimate: Optional[str] = None
    acceptance_criteria: str


class UserStoryUpdate(BaseModel):
    title: Optional[str] = None
    persona: Optional[str] = None
    goal: Optional[str] = None
    business_value: Optional[str] = None
    priority: Optional[str] = None
    estimate: Optional[str] = None
    acceptance_criteria: Optional[str] = None
    invest_notes: Optional[str] = None
    split_recommendation: Optional[str] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _story_out(s: UserStory) -> UserStoryOut:
    return UserStoryOut(
        id=str(s.id),
        story_id=s.story_id,
        ur_id=str(s.ur_id),
        title=s.title,
        persona=s.persona,
        goal=s.goal,
        business_value=s.business_value,
        priority=s.priority,
        estimate=s.estimate,
        acceptance_criteria=s.acceptance_criteria,
        invest_notes=s.invest_notes,
        split_recommendation=s.split_recommendation,
        generated_by=s.generated_by,
        created_at=s.created_at.isoformat(),
        updated_at=s.updated_at.isoformat(),
    )


async def _load_ur(db: AsyncSession, ur_id: uuid.UUID) -> UserRequirement:
    result = await db.execute(
        select(UserRequirement)
        .where(UserRequirement.id == ur_id)
        .options(selectinload(UserRequirement.project))
    )
    ur = result.scalar_one_or_none()
    if not ur:
        raise HTTPException(404, "Requirement not found")
    return ur


async def _next_story_id(db: AsyncSession) -> str:
    year = datetime.now(timezone.utc).year
    prefix = f"US-{year}-"
    result = await db.execute(
        select(func.max(UserStory.story_id)).where(
            UserStory.story_id.like(f"{prefix}%")
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

@router.get("/requirements/{ur_id}/user-stories", response_model=list[UserStoryOut])
async def list_user_stories(
    ur_id: str,
    db: AsyncSession = Depends(get_db),
    _: Employee = Depends(get_current_user),
):
    try:
        ur_uuid = uuid.UUID(ur_id)
    except ValueError:
        raise HTTPException(400, f"Invalid UUID: {ur_id!r}")
    result = await db.execute(
        select(UserStory).where(UserStory.ur_id == ur_uuid).order_by(UserStory.created_at.asc())
    )
    return [_story_out(s) for s in result.scalars().all()]


@router.post(
    "/requirements/{ur_id}/user-stories/generate",
    response_model=list[UserStoryOut],
    status_code=201,
)
async def generate_user_stories(
    ur_id: str,
    db: AsyncSession = Depends(get_db),
    _: Employee = Depends(get_current_user),
):
    try:
        ur_uuid = uuid.UUID(ur_id)
    except ValueError:
        raise HTTPException(400, f"Invalid UUID: {ur_id!r}")

    ur = await _load_ur(db, ur_uuid)
    if ur.status not in GENERATE_ALLOWED_STATUSES:
        raise HTTPException(
            400,
            f"Cannot generate stories for a '{ur.status}' requirement. "
            f"Must be one of: {sorted(GENERATE_ALLOWED_STATUSES)}",
        )

    from app.services.user_story_service import generate_user_stories as _ai_generate

    story_dicts = await _ai_generate(ur, db)
    if not story_dicts:
        raise HTTPException(500, "AI returned no valid user stories")

    created: list[UserStory] = []
    for story_data in story_dicts:
        story_id = await _next_story_id(db)
        story = UserStory(story_id=story_id, ur_id=ur_uuid, generated_by="ai", **story_data)
        db.add(story)
        await db.flush()
        created.append(story)

    return [_story_out(s) for s in created]


@router.post("/requirements/{ur_id}/user-stories", response_model=UserStoryOut, status_code=201)
async def create_user_story(
    ur_id: str,
    data: UserStoryCreate,
    db: AsyncSession = Depends(get_db),
    _: Employee = Depends(get_current_user),
):
    try:
        ur_uuid = uuid.UUID(ur_id)
    except ValueError:
        raise HTTPException(400, f"Invalid UUID: {ur_id!r}")

    await _load_ur(db, ur_uuid)

    for attempt in range(_MAX_ID_RETRIES):
        try:
            story_id = await _next_story_id(db)
            story = UserStory(
                story_id=story_id,
                ur_id=ur_uuid,
                title=data.title,
                persona=data.persona,
                goal=data.goal,
                business_value=data.business_value,
                priority=data.priority,
                estimate=data.estimate,
                acceptance_criteria=data.acceptance_criteria,
                generated_by="manual",
            )
            db.add(story)
            await db.flush()
            return _story_out(story)
        except IntegrityError:
            await db.rollback()
            if attempt == _MAX_ID_RETRIES - 1:
                raise HTTPException(500, "Could not generate a unique story ID")

    raise HTTPException(500, "Could not create user story")


@router.put("/user-stories/{story_id}", response_model=UserStoryOut)
async def update_user_story(
    story_id: str,
    data: UserStoryUpdate,
    db: AsyncSession = Depends(get_db),
    _: Employee = Depends(get_current_user),
):
    try:
        story_uuid = uuid.UUID(story_id)
    except ValueError:
        raise HTTPException(400, f"Invalid UUID: {story_id!r}")

    story = await db.get(UserStory, story_uuid)
    if not story:
        raise HTTPException(404, "User story not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(story, field, value)
    await db.flush()
    return _story_out(story)


@router.delete("/user-stories/{story_id}", status_code=204)
async def delete_user_story(
    story_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Employee = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(403, "Admin access required to delete user stories")
    try:
        story_uuid = uuid.UUID(story_id)
    except ValueError:
        raise HTTPException(400, f"Invalid UUID: {story_id!r}")

    story = await db.get(UserStory, story_uuid)
    if not story:
        raise HTTPException(404, "User story not found")
    await db.delete(story)
