"""
Jira integration router — push approved URs to Jira and sync status back.
"""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.database.models import Employee, UserRequirement
from app.services.auth_service import get_current_user
from app.services.jira_service import jira_service

logger = logging.getLogger(__name__)
router = APIRouter()

JIRA_STATUS_MAP: dict[str, str] = {
    "done": "done",
    "closed": "done",
    "in progress": "dev_ready",
    "in development": "dev_ready",
    "to do": "approved",
    "open": "approved",
    "rejected": "rejected",
}


class JiraPushRequest(BaseModel):
    requirement_ids: list[str]
    issue_type: str = "Story"


class JiraPushResult(BaseModel):
    requirement_id: str
    jira_key: str | None = None
    jira_url: str | None = None
    success: bool
    error: str | None = None


class JiraPushResponse(BaseModel):
    results: list[JiraPushResult]
    total_pushed: int
    total_failed: int


@router.get("/jira/config")
async def get_jira_config(
    _: Employee = Depends(get_current_user),
):
    return jira_service.get_config_status()


@router.post("/jira/push", response_model=JiraPushResponse)
async def push_to_jira(
    data: JiraPushRequest,
    db: AsyncSession = Depends(get_db),
    _: Employee = Depends(get_current_user),
):
    if not jira_service.is_configured:
        raise HTTPException(
            400,
            "Jira is not configured. Set JIRA_BASE_URL, JIRA_EMAIL, "
            "JIRA_API_TOKEN, and JIRA_PROJECT_KEY.",
        )

    results: list[JiraPushResult] = []
    total_pushed = 0
    total_failed = 0

    for req_id_str in data.requirement_ids:
        import uuid
        try:
            rid = uuid.UUID(req_id_str)
        except ValueError:
            results.append(JiraPushResult(
                requirement_id=req_id_str, success=False, error="Invalid UUID"
            ))
            total_failed += 1
            continue

        ur = await db.get(UserRequirement, rid)
        if not ur:
            results.append(JiraPushResult(
                requirement_id=req_id_str, success=False, error="Requirement not found"
            ))
            total_failed += 1
            continue

        if ur.status not in ("approved", "dev_ready"):
            results.append(JiraPushResult(
                requirement_id=req_id_str,
                success=False,
                error=f"Must be Approved or Dev-Ready (current: {ur.status})",
            ))
            total_failed += 1
            continue

        if ur.jira_key:
            results.append(JiraPushResult(
                requirement_id=req_id_str,
                jira_key=ur.jira_key,
                jira_url=ur.jira_url,
                success=True,
                error="Already pushed to Jira",
            ))
            continue

        try:
            description = f"[{ur.requirement_id}] {ur.title}\n\n"
            if ur.description:
                description += f"Description:\n{ur.description}\n\n"
            if ur.acceptance_criteria:
                description += f"Acceptance Criteria:\n{ur.acceptance_criteria}\n\n"
            if ur.source_text:
                description += f"Source Text:\n{ur.source_text}"

            jira_result = await jira_service.create_issue(
                title=f"[{ur.requirement_id}] {ur.title}",
                description=description,
                issue_type=data.issue_type,
                priority=ur.priority,
            )
            ur.jira_key = jira_result["key"]
            ur.jira_url = jira_result["url"]
            await db.flush()

            results.append(JiraPushResult(
                requirement_id=req_id_str,
                jira_key=jira_result["key"],
                jira_url=jira_result["url"],
                success=True,
            ))
            total_pushed += 1
        except Exception as e:
            logger.error(f"Jira push failed for {ur.requirement_id}: {e}")
            results.append(JiraPushResult(
                requirement_id=req_id_str, success=False, error=str(e)
            ))
            total_failed += 1

    return JiraPushResponse(
        results=results, total_pushed=total_pushed, total_failed=total_failed
    )


@router.post("/jira/sync-status")
async def sync_jira_status(
    db: AsyncSession = Depends(get_db),
    _: Employee = Depends(get_current_user),
):
    if not jira_service.is_configured:
        raise HTTPException(400, "Jira is not configured")

    result = await db.execute(
        select(UserRequirement).where(UserRequirement.jira_key.isnot(None))
    )
    reqs = result.scalars().all()

    updated = []
    for ur in reqs:
        jira_status = await jira_service.get_issue_status(ur.jira_key)
        if not jira_status:
            continue
        new_local = JIRA_STATUS_MAP.get(jira_status.lower())
        old_status = ur.status
        if new_local and new_local != ur.status:
            ur.status = new_local
            ur.updated_at = datetime.now(timezone.utc)
        updated.append({
            "requirement_id": ur.requirement_id,
            "jira_key": ur.jira_key,
            "jira_status": jira_status,
            "old_local_status": old_status,
            "new_local_status": ur.status,
        })

    return {"synced": len(updated), "details": updated}
