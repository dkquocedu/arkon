# UR Lifecycle Module — Bug Report

**Date:** 2026-05-11  
**Module:** UR Lifecycle (User Requirements)  
**Branch:** claude/integrate-ur-lifecycle-6cnSN  
**Status:** Fixed in commit `fix: all bugs from test report`

---

## Critical Bugs

### BUG-1 — ID collision on delete + re-insert (COUNT-based ID generation)

**Files:** `app/routers/requirements.py`, `app/mcp/ur_tools.py`  
**Severity:** High  
**HTTP symptom:** 500 Internal Server Error on `POST /requirements` after any row was deleted

`_generate_requirement_id` used `COUNT(*)` to determine the next sequence number. If any requirement was deleted, `COUNT` returned a lower value than the current max, causing a duplicate `UR-YYYY-NNN` that hit the unique constraint.

**Fix:** Use `MAX(requirement_id)` and parse the trailing numeric suffix, then increment. Falls back to `001` when the table is empty.

---

### BUG-2 — Race condition on concurrent requirement creation

**File:** `app/routers/requirements.py`  
**Severity:** High  
**HTTP symptom:** 500 on second of two simultaneous `POST /requirements` calls

Two requests could read the same `MAX` value and attempt to insert identical `requirement_id` strings.

**Fix:** Wrap generate + insert in a retry loop (up to 5 attempts) catching `IntegrityError`. On conflict, re-generate the ID and re-fetch labels after rollback, then retry.

---

### BUG-3 — Duplicate label name returns 500 instead of 409

**File:** `app/routers/ur_labels.py`  
**Severity:** Medium  
**HTTP symptom:** 500 on `POST /ur-labels` with a name that already exists

`URLabel.name` has a `UNIQUE` constraint. An unhandled `IntegrityError` from the flush bubbled up as HTTP 500. Same issue was present in `PUT /ur-labels/{id}` when renaming to an existing name.

**Fix:** Wrap `await db.flush()` in `try/except IntegrityError` in both `create_label` and `update_label`; raise `HTTP 409 Conflict` with a descriptive message.

---

### BUG-4 — PUT /requirements/{id} returns null for assignee_name and project_name

**File:** `app/routers/requirements.py`  
**Severity:** Medium  
**HTTP symptom:** Response shows `"assignee_name": null` even after a successful update

After `db.flush()`, SQLAlchemy's identity map cached the `UserRequirement` row. Calling `_load_ur()` hit the cache and returned the old (or un-loaded) relationship objects instead of issuing a fresh SELECT with `selectinload`.

**Fix:** Call `db.expire(ur)` before `_load_ur()` in both `update_requirement` (PUT) and `update_status` (PATCH) to evict the cached instance and force a reload.

---

### BUG-5 — Invalid UUID in path/query parameter returns 500 instead of 400

**File:** `app/routers/requirements.py`  
**Severity:** Medium  
**HTTP symptom:** 500 on any endpoint when a UUID parameter is malformed (e.g. `?project_id=not-a-uuid`)

Raw `uuid.UUID(value)` calls raised `ValueError` which propagated as HTTP 500.

**Fix:** Added `_parse_uuid_field(value, field_name) -> Optional[uuid.UUID]` helper that raises `HTTP 400` with a descriptive message on `ValueError`. Applied to all UUID query params and path params.

---

### BUG-6 — Non-existent FK (project_id / assignee_id) returns 500 instead of 400

**File:** `app/routers/requirements.py`  
**Severity:** Medium  
**HTTP symptom:** 500 on `POST /requirements` when providing a valid UUID that references a missing row

Providing a syntactically valid UUID for a non-existent `Project` or `Employee` caused a FK constraint violation on flush, resulting in HTTP 500.

**Fix:** Before inserting, validate with `await db.get(Project, uuid)` and `await db.get(Employee, uuid)`; raise `HTTP 400` if the referenced row does not exist.

---

### BUG-7 — Whitespace-only title returns 500 instead of 422

**File:** `app/routers/requirements.py`  
**Severity:** Low  
**HTTP symptom:** 500 on `POST /requirements` with `{"title": "   "}`

A whitespace-only string is truthy, so Pydantic's `required` check passed. After stripping, the empty string hit the DB `NOT NULL` / length constraint and caused a 500.

**Fix:** Added `Field(..., min_length=1, max_length=500)` and a `@field_validator("title", mode="before")` that strips whitespace before the length check. Pydantic now returns HTTP 422 with a clear validation error.

---

## Frontend Bugs

### FE-1 — TypeScript build failure: Select.onValueChange may receive null

**Files:** `frontend/src/app/(portal)/requirements/page.tsx`, `frontend/src/components/requirements/requirement-dialog.tsx`  
**Severity:** High (build-breaking)  
**Symptom:** TypeScript strict-mode error — `string | null` not assignable to `string` setter

Passing a `setState` function directly to shadcn `Select.onValueChange` is unsafe because the component can emit `null` in some edge cases.

**Fix:** Wrap all `onValueChange` handlers: `onValueChange={(v) => setState(v ?? "")}`.

---

### FE-2 — ESLint error: multiple setState calls inside async effect

**Files:** `frontend/src/components/requirements/requirement-dialog.tsx`, `frontend/src/app/(portal)/requirements/kanban/page.tsx`  
**Severity:** Medium (lint-breaking)

- **Dialog:** `useEffect` contained 6 sequential `setState` calls triggering `react-hooks/exhaustive-deps` lint errors.  
  **Fix:** Consolidated into a single `setForm({...})` call using a typed `FormState` object.

- **Kanban:** `useCallback` wrapped an `async` function with multiple setState calls (`setLoading`, `setRequirements`).  
  **Fix:** Replaced with `useTransition` — the async work runs inside `startTransition`, eliminating the separate `loading` state and using `isPending` from `useTransition` for the spinner.

---

## Design / Code Quality Issues

### DESIGN-3 — `import uuid` placed inside a for-loop

**File:** `app/routers/jira_integration.py`  
**Severity:** Low

`import uuid` appeared inside `for req_id_str in data.requirement_ids:`. Python caches imports after the first call so there is no runtime cost, but it is unconventional and triggers linting warnings.

**Fix:** Moved `import uuid` to the top of the file with other standard-library imports.

---

### DESIGN-4 — MCP tools missing `source_document` selectinload

**File:** `app/mcp/ur_tools.py`  
**Severity:** Low  
**Symptom:** `MissingGreenlet` / lazy-load error if `source_document` is accessed outside an async context

`list_requirements` and `read_requirement` did not eagerly load the `source_document` relationship.

**Fix:** Added `selectinload(UserRequirement.source_document)` to all SELECT statements in both tools. Also fixed the same COUNT→MAX bug in MCP `create_requirement`.

---

## Out of Scope (Not Fixed)

| ID | Description | Reason |
|----|-------------|--------|
| DESIGN-1 | RBAC permissions for UR module | Requires product decision on permission model |
| DESIGN-2 | Drag-and-drop Kanban board | Requires dnd-kit or @hello-pangea/dnd dependency |
