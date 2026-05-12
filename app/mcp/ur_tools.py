"""MCP tools for the UR Lifecycle module."""

from typing import Optional

from fastmcp import FastMCP

_MCP_ID_RETRIES = 5


def register_ur_tools(mcp: FastMCP) -> None:
    """Register UR Lifecycle tools on the MCP server."""

    @mcp.tool()
    async def list_requirements(
        status: Optional[str] = None,
        priority: Optional[str] = None,
        search: Optional[str] = None,
        limit: int = 20,
    ) -> list[dict]:
        """
        List user requirements with optional filters.

        Args:
            status: Filter by status (draft, analysis, approved, dev_ready, done, rejected).
            priority: Filter by priority (critical, high, medium, low).
            search: Search in title or description.
            limit: Maximum number of results (default 20, max 100).
        """
        from sqlalchemy import select
        from sqlalchemy.orm import selectinload

        from app.database import async_session_factory
        from app.database.models import UserRequirement

        limit = min(limit, 100)
        async with async_session_factory() as session:
            stmt = (
                select(UserRequirement)
                .options(
                    selectinload(UserRequirement.labels),
                    selectinload(UserRequirement.project),
                    selectinload(UserRequirement.assignee),
                    selectinload(UserRequirement.source_document),
                )
                .order_by(UserRequirement.created_at.desc())
                .limit(limit)
            )
            if status:
                stmt = stmt.where(UserRequirement.status == status)
            if priority:
                stmt = stmt.where(UserRequirement.priority == priority)
            if search:
                stmt = stmt.where(
                    UserRequirement.title.ilike(f"%{search}%")
                    | UserRequirement.description.ilike(f"%{search}%")
                )
            result = await session.execute(stmt)
            urs = result.scalars().all()
            return [
                {
                    "id": str(ur.id),
                    "requirement_id": ur.requirement_id,
                    "title": ur.title,
                    "status": ur.status,
                    "priority": ur.priority,
                    "assignee": ur.assignee.name if ur.assignee else None,
                    "project": ur.project.name if ur.project else None,
                    "source_document": ur.source_document.title if ur.source_document else None,
                    "labels": [label.name for label in ur.labels],
                    "jira_key": ur.jira_key,
                    "created_at": ur.created_at.isoformat() if ur.created_at else None,
                }
                for ur in urs
            ]

    @mcp.tool()
    async def read_requirement(requirement_id: str) -> dict:
        """
        Get full details of a user requirement.

        Args:
            requirement_id: The requirement_id string (e.g. UR-2025-001) or UUID.
        """
        import uuid as _uuid

        from sqlalchemy import select
        from sqlalchemy.orm import selectinload

        from app.database import async_session_factory
        from app.database.models import UserRequirement

        async with async_session_factory() as session:
            stmt = (
                select(UserRequirement)
                .options(
                    selectinload(UserRequirement.labels),
                    selectinload(UserRequirement.project),
                    selectinload(UserRequirement.assignee),
                    selectinload(UserRequirement.source_document),
                )
                .where(UserRequirement.requirement_id == requirement_id)
            )
            result = await session.execute(stmt)
            ur = result.scalar_one_or_none()

            if not ur:
                try:
                    uid = _uuid.UUID(requirement_id)
                    stmt2 = (
                        select(UserRequirement)
                        .options(
                            selectinload(UserRequirement.labels),
                            selectinload(UserRequirement.project),
                            selectinload(UserRequirement.assignee),
                            selectinload(UserRequirement.source_document),
                        )
                        .where(UserRequirement.id == uid)
                    )
                    result2 = await session.execute(stmt2)
                    ur = result2.scalar_one_or_none()
                except ValueError:
                    pass

            if not ur:
                return {"error": f"Requirement '{requirement_id}' not found"}

            return {
                "id": str(ur.id),
                "requirement_id": ur.requirement_id,
                "title": ur.title,
                "description": ur.description,
                "acceptance_criteria": ur.acceptance_criteria,
                "status": ur.status,
                "priority": ur.priority,
                "source_text": ur.source_text,
                "assignee": ur.assignee.name if ur.assignee else None,
                "project": ur.project.name if ur.project else None,
                "source_document": ur.source_document.title if ur.source_document else None,
                "labels": [{"name": label.name, "color": label.color} for label in ur.labels],
                "jira_key": ur.jira_key,
                "jira_url": ur.jira_url,
                "created_at": ur.created_at.isoformat() if ur.created_at else None,
                "updated_at": ur.updated_at.isoformat() if ur.updated_at else None,
                "approved_at": ur.approved_at.isoformat() if ur.approved_at else None,
            }

    @mcp.tool()
    async def create_requirement(
        title: str,
        description: Optional[str] = None,
        acceptance_criteria: Optional[str] = None,
        priority: str = "medium",
        source_text: Optional[str] = None,
    ) -> dict:
        """
        Create a new user requirement in draft status.

        Args:
            title: Requirement title (required).
            description: Detailed description.
            acceptance_criteria: Acceptance criteria.
            priority: Priority level (critical, high, medium, low) — default medium.
            source_text: Original text from source document.
        """
        from datetime import datetime, timezone

        from sqlalchemy import func, select
        from sqlalchemy.exc import IntegrityError

        from app.database import async_session_factory
        from app.database.models import UserRequirement

        async with async_session_factory() as session:
            ur: UserRequirement | None = None
            for attempt in range(_MCP_ID_RETRIES):
                try:
                    year = datetime.now(timezone.utc).year
                    prefix = f"UR-{year}-"
                    max_stmt = (
                        select(func.max(UserRequirement.requirement_id))
                        .where(UserRequirement.requirement_id.like(f"{prefix}%"))
                    )
                    max_result = await session.execute(max_stmt)
                    max_id = max_result.scalar()
                    if max_id:
                        try:
                            num = int(max_id.split("-")[-1]) + 1
                        except (ValueError, IndexError):
                            num = 1
                    else:
                        num = 1
                    req_id = f"{prefix}{num:03d}"

                    ur = UserRequirement(
                        requirement_id=req_id,
                        title=title,
                        description=description,
                        acceptance_criteria=acceptance_criteria,
                        priority=priority,
                        source_text=source_text,
                        status="draft",
                    )
                    session.add(ur)
                    await session.flush()
                    await session.commit()
                    break
                except IntegrityError:
                    await session.rollback()
                    if attempt == _MCP_ID_RETRIES - 1:
                        return {"error": "Could not generate a unique requirement ID after retries"}

            if ur is None:
                return {"error": "Could not create requirement"}

            return {
                "id": str(ur.id),
                "requirement_id": ur.requirement_id,
                "title": ur.title,
                "status": ur.status,
                "priority": ur.priority,
                "created": True,
            }

    @mcp.tool()
    async def update_requirement_status(requirement_id: str, new_status: str) -> dict:
        """
        Transition a requirement to a new status.

        Valid transitions:
          draft -> analysis, rejected
          analysis -> approved, draft, rejected
          approved -> dev_ready, analysis, rejected
          dev_ready -> done, approved, rejected
          done -> dev_ready
          rejected -> draft

        Args:
            requirement_id: The requirement_id (e.g. UR-2025-001) or UUID.
            new_status: Target status.
        """
        import uuid as _uuid
        from datetime import datetime, timezone

        from sqlalchemy import select

        from app.database import async_session_factory
        from app.database.models import UserRequirement

        VALID_TRANSITIONS = {
            "draft": ["analysis", "rejected"],
            "analysis": ["approved", "draft", "rejected"],
            "approved": ["dev_ready", "analysis", "rejected"],
            "dev_ready": ["done", "approved", "rejected"],
            "done": ["dev_ready"],
            "rejected": ["draft"],
        }

        async with async_session_factory() as session:
            stmt = select(UserRequirement).where(
                UserRequirement.requirement_id == requirement_id
            )
            result = await session.execute(stmt)
            ur = result.scalar_one_or_none()

            if not ur:
                try:
                    uid = _uuid.UUID(requirement_id)
                    stmt2 = select(UserRequirement).where(UserRequirement.id == uid)
                    result2 = await session.execute(stmt2)
                    ur = result2.scalar_one_or_none()
                except ValueError:
                    pass

            if not ur:
                return {"error": f"Requirement '{requirement_id}' not found"}

            allowed = VALID_TRANSITIONS.get(ur.status, [])
            if new_status not in allowed:
                return {
                    "error": f"Cannot transition from '{ur.status}' to '{new_status}'",
                    "allowed": allowed,
                }

            previous_status = ur.status
            ur.status = new_status
            ur.updated_at = datetime.now(timezone.utc)
            if new_status == "approved":
                ur.approved_at = datetime.now(timezone.utc)

            await session.commit()
            return {
                "requirement_id": ur.requirement_id,
                "previous_status": previous_status,
                "new_status": new_status,
                "updated": True,
            }

    @mcp.tool()
    async def assign_requirement(
        requirement_id: str,
        assignee_name: Optional[str] = None,
    ) -> dict:
        """
        Assign or unassign a requirement to an employee by name.

        Args:
            requirement_id: The requirement_id (e.g. UR-2025-001) or UUID.
            assignee_name: Employee name, or omit/None to unassign.
        """
        import uuid as _uuid
        from datetime import datetime, timezone

        from sqlalchemy import select

        from app.database import async_session_factory
        from app.database.models import Employee, UserRequirement

        async with async_session_factory() as session:
            stmt = select(UserRequirement).where(
                UserRequirement.requirement_id == requirement_id
            )
            result = await session.execute(stmt)
            ur = result.scalar_one_or_none()

            if not ur:
                try:
                    uid = _uuid.UUID(requirement_id)
                    stmt2 = select(UserRequirement).where(UserRequirement.id == uid)
                    result2 = await session.execute(stmt2)
                    ur = result2.scalar_one_or_none()
                except ValueError:
                    pass

            if not ur:
                return {"error": f"Requirement '{requirement_id}' not found"}

            if assignee_name is None:
                ur.assignee_id = None
                ur.updated_at = datetime.now(timezone.utc)
                await session.commit()
                return {"requirement_id": ur.requirement_id, "assignee": None, "updated": True}

            emp_stmt = select(Employee).where(Employee.name.ilike(f"%{assignee_name}%"))
            emp_result = await session.execute(emp_stmt)
            employee = emp_result.scalar_one_or_none()
            if not employee:
                return {"error": f"Employee '{assignee_name}' not found"}

            ur.assignee_id = employee.id
            ur.updated_at = datetime.now(timezone.utc)
            await session.commit()
            return {
                "requirement_id": ur.requirement_id,
                "assignee": employee.name,
                "updated": True,
            }
