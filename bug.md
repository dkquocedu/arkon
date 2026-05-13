# UR Lifecycle & User Story Module — Bug Report

**Branch:** `claude/ur-user-story-generation`  
**Last updated:** 2026-05-13

---

## Summary

| ID | Description | Status |
|----|-------------|--------|
| BUG-1 | ID collision after delete (COUNT → MAX) | ✅ Fixed |
| BUG-2 | Race condition on concurrent creation | ✅ Fixed |
| BUG-3 | Duplicate label name → 500 | ✅ Fixed |
| BUG-4 | PUT/PATCH returns stale null for relations | ✅ Fixed (2nd attempt) |
| BUG-5 | Invalid UUID → 500 instead of 400 | ✅ Fixed |
| BUG-6 | Non-existent FK → 500 instead of 400 | ✅ Fixed |
| BUG-7 | Empty/whitespace title → 500 instead of 422 | ✅ Fixed |
| FE-BUG-1 | TypeScript Select `onValueChange` null | ✅ Fixed |
| FE-BUG-2 | ESLint setState in useEffect (Kanban) | ✅ Fixed |
| FE-BUG-3 | ESLint setState in useEffect (Dialog) | ✅ Fixed (2nd attempt) |
| FE-BUG-4 | `asChild` on DropdownMenuTrigger build failure | ✅ Fixed |
| DESIGN-3 | `import uuid` inside for-loop | ✅ Fixed |
| DESIGN-4 | MCP tools missing source_document selectinload | ✅ Fixed |
| MCP-BUG-2 | MCP create_requirement missing retry loop | ✅ Fixed |
| BUG-US-1 | PUT `/user-stories/{id}` → 500 MissingGreenlet | ✅ Fixed |
| BUG-US-2 | Generate endpoint 500 when AI provider not configured | ✅ Fixed |
| FE-BUG-US-1 | PageHeader `description` type mismatch (string vs ReactNode) | ✅ Fixed |
| FE-BUG-US-2 | ESLint unescaped quotes in user-story-panel.tsx | ✅ Fixed |
| LINT-1 | Ruff import ordering in health functions | ✅ Fixed |
| DESIGN-US-1 | Empty title accepted in UserStoryCreate | ✅ Fixed |
| DESIGN-US-2 | Generate endpoint missing retry loop for story_id collision | ✅ Fixed |
| DESIGN-US-3 | MCP generate_user_stories missing retry loop | ✅ Fixed |

---

## BUG-US-1 — PUT `/user-stories/{id}` → 500 MissingGreenlet

**File:** `app/routers/user_stories.py`  
**Root cause:** Same pattern as BUG-4. After `db.flush()`, SQLAlchemy expires `updated_at`
(column has `onupdate=func.now()`). When `_story_out(story)` accesses `s.updated_at.isoformat()`,
it triggers lazy-load in async context → crash:
```
MissingGreenlet: greenlet_spawn has not been called; can't call await_only() here.
```
**Fix:** Add `await db.refresh(story)` after `flush()` to reload server-computed columns:
```python
await db.flush()
await db.refresh(story)  # reload updated_at from DB
return _story_out(story)
```

---

## BUG-US-2 — Generate endpoint 500 when AI provider not configured

**File:** `app/routers/user_stories.py`  
**Root cause:** `generate_user_stories()` raises `ValueError("No llm provider configured")`
but the router endpoint did not catch it, resulting in an unhandled 500.  
**Fix:** Wrap `_ai_generate()` in try/except and return 502:
```python
try:
    story_dicts = await _ai_generate(ur, db)
except ValueError as e:
    raise HTTPException(502, f"AI provider not configured: {e}")
except Exception as e:
    raise HTTPException(502, f"AI generation failed: {e}")
```

---

## FE-BUG-US-1 — PageHeader `description` type mismatch

**File:** `frontend/src/components/shared/page-header.tsx`  
**Root cause:** `description?: string` but UR detail page passes a `<Link>` ReactNode.  
**Fix:** Change type to `React.ReactNode` and wrap render element in `<div>` instead of `<p>`:
```tsx
description?: React.ReactNode;
```

---

## FE-BUG-US-2 — ESLint unescaped quotes in JSX

**File:** `frontend/src/components/requirements/user-story-panel.tsx`  
**Root cause:** Raw `"` characters inside JSX text content.  
**Fix:** Use template literal or `&quot;` escape.

---

## DESIGN-US-1 — Empty title accepted in UserStoryCreate

**File:** `app/routers/user_stories.py`  
**Fix:** Added `Field(..., min_length=1, max_length=500)` + `@field_validator` strip.

---

## DESIGN-US-2/3 — Generate endpoints missing retry loop for story_id collision

**Files:** `app/routers/user_stories.py`, `app/mcp/ur_tools.py`  
**Fix:** Added `_MAX_ID_RETRIES` retry loop with `IntegrityError` handling, same pattern
as `create_user_story` and MCP `create_requirement`.

---

## BUG-4 — Regression in first fix attempt

**Root cause:** `db.expire(ur)` marks **all** attributes of `ur` as expired,
including `ur.id`. Accessing `ur.id` after expire triggers lazy-load in async context.

**Fix (2nd attempt):** Save `ur_id = ur.id` **before** calling `db.expire(ur)`.

---

## FE-BUG-3 — Regression in first fix attempt

**Fix (2nd attempt):** Use **key-prop + lazy initializer** pattern:
- Dialog initializes `form` via lazy `useState(() => ...)` from `requirement` prop.
- Parent increments `dialogKey` counter on each open → React remounts dialog → lazy init re-runs.

---

## FE-BUG-4 — `asChild` on Base UI DropdownMenuTrigger

**Root cause:** Project uses Base UI `Menu.Trigger` which uses `render` prop, not Radix `asChild`.  
**Fix:** Remove `asChild` + inner `<button>`, apply className directly to `DropdownMenuTrigger`.
