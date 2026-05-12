"""AI-powered User Story generation using BA Zone methodology."""

import json
import re
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.registry import ProviderRegistry
from app.database.models import UserRequirement, UserStory

SYSTEM_PROMPT = """You are a Senior Business Analyst following the BA Zone User Story methodology.

STORY FORMAT (one entry per story):
- title: brief noun phrase (e.g. "View Project Dashboard")
- persona: specific named role — NEVER "user" (e.g. "Project Manager", "DevOps Engineer")
- goal: concrete measurable action starting with a verb (e.g. "view a real-time project status dashboard")
- business_value: distinct outcome language (e.g. "reduce status meeting time by 50%")
- priority: must | should | could | wont  (MoSCoW)
- estimate: realistic effort (e.g. "1-2 days", "3-5 days", "1 week")

ACCEPTANCE CRITERIA — minimum 3 scenarios per story:
Required types: Happy Path, Edge/Validation, Negative/Error
Format:
  **AC[N]: [Scenario Name]**
  - Given [precondition]
  - When [action]
  - Then [expected result]

INVEST SELF-CHECK:
Rate each: I=Independent N=Negotiable V=Valuable E=Estimable S=Small T=Testable
Note concerns or write "All INVEST criteria pass."

SPLITTING RULES:
- Split by persona if UR covers multiple roles
- Split by operation if UR spans multiple CRUD actions
- Max 3 stories per call, min 1
- Each story must be independently deliverable

ANTI-PATTERNS TO AVOID:
- Generic personas: "user", "admin" — be specific
- Vague goals: "manage data" — be measurable
- UI details in AC — describe behavior not implementation

OUTPUT: Return ONLY valid JSON, no markdown, no code fences:
{
  "stories": [
    {
      "title": "...",
      "persona": "...",
      "goal": "...",
      "business_value": "...",
      "priority": "must",
      "estimate": "1-3 days",
      "acceptance_criteria": "**AC1: Happy Path**\\n- Given...\\n- When...\\n- Then...",
      "invest_notes": "All INVEST criteria pass.",
      "split_recommendation": null
    }
  ]
}"""


async def _generate_story_id(db: AsyncSession) -> str:
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


async def generate_user_stories(ur: UserRequirement, db: AsyncSession) -> list[dict]:
    """Call LLM to generate User Stories for an approved UR using BA Zone methodology."""
    user_prompt = (
        f"Generate user stories for this approved User Requirement:\n\n"
        f"ID: {ur.requirement_id}\n"
        f"Title: {ur.title}\n"
        f"Description: {ur.description or 'N/A'}\n"
        f"Original Acceptance Criteria: {ur.acceptance_criteria or 'N/A'}\n"
        f"Project: {ur.project.name if ur.project else 'N/A'}\n"
        f"Priority: {ur.priority}\n"
        f"Source context: {ur.source_text or 'N/A'}\n\n"
        f"Follow BA Zone methodology. Generate 1-3 user stories as appropriate.\n"
        f"Return only the JSON object."
    )

    registry = ProviderRegistry(db)
    llm = await registry.get_llm()
    raw = await llm.generate(user_prompt, system=SYSTEM_PROMPT, temperature=0.3)

    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    cleaned = cleaned.strip()

    data = json.loads(cleaned)
    stories = data.get("stories", [])

    required = {"title", "persona", "goal", "business_value", "priority", "acceptance_criteria"}
    validated = []
    for story in stories:
        if not required.issubset(story.keys()):
            continue
        validated.append({
            "title": str(story["title"])[:500],
            "persona": str(story["persona"])[:500],
            "goal": str(story["goal"]),
            "business_value": str(story["business_value"]),
            "priority": story.get("priority", "must"),
            "estimate": story.get("estimate"),
            "acceptance_criteria": str(story["acceptance_criteria"]),
            "invest_notes": story.get("invest_notes"),
            "split_recommendation": story.get("split_recommendation"),
        })
    return validated
