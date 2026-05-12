# UR Lifecycle Module — Bug Report

**Branch:** `claude/integrate-ur-lifecycle-6cnSN`  
**Last updated:** 2026-04-30 (re-test against commit `5b075ed`)

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

---

## BUG-4 — Regression in first fix attempt

**Root cause of regression:** `db.expire(ur)` marks **all** attributes of `ur` as expired,
including `ur.id`. Accessing `ur.id` after expire triggers SQLAlchemy's lazy-load mechanism,
which cannot run in an async context outside a greenlet, causing:

```
MissingGreenlet: greenlet_spawn has not been called; can't call await_only() here.
```

**Fix (2nd attempt):** Save `ur_id = ur.id` to a local variable **before** calling
`db.expire(ur)`, then pass the local variable to `_load_ur`:

```python
await db.flush()
ur_id = ur.id          # capture before expire invalidates it
db.expire(ur)
return _ur_out(await _load_ur(db, ur_id))
```

Applied in both `update_requirement` (PUT) and `update_status` (PATCH /status).

---

## FE-BUG-3 — Regression in first fix attempt

**Root cause:** Consolidating 6 `setState` calls into one `setForm({...})` still calls
`setState` synchronously inside the `useEffect` body, which `react-hooks/set-state-in-effect`
still flags.

**Fix (2nd attempt):** Use the **key-prop + lazy initializer** pattern:
- Dialog initializes `form` via lazy `useState(() => ...)` from `requirement` prop on first render.
- Parent (`requirements/page.tsx`) increments a `dialogKey` counter each time the dialog opens.
- React remounts `RequirementDialog` on each open (new key), so the lazy init runs fresh
  with the latest `requirement` prop.
- The `useEffect` now only handles the async `Promise.all` fetch (state set in `.then()`,
  not synchronously in the effect body — allowed by the rule).

---

## FE-BUG-4 — New issue: `asChild` on Base UI DropdownMenuTrigger

**Location:** `frontend/src/components/requirements/requirement-list.tsx:151`

```
Type error: Property 'asChild' does not exist on type '...'
```

**Root cause:** The project's `DropdownMenuTrigger` wraps Base UI's `Menu.Trigger`,
which uses the `render` prop for slot composition, **not** Radix UI's `asChild`.

**Fix:** Remove `asChild` and the nested `<button>` wrapper; apply styling directly
to `DropdownMenuTrigger` (Base UI renders a button by default):

```tsx
<DropdownMenuTrigger
  className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors", statusCfg.className)}
>
  {statusCfg.label}
</DropdownMenuTrigger>
```

---

## MCP-BUG-2 — Missing retry loop in MCP create_requirement

**File:** `app/mcp/ur_tools.py`

The HTTP router's `create_requirement` had a 5-attempt retry loop added for BUG-2,
but the MCP tool equivalent did not receive the same treatment, leaving it vulnerable
to the same race condition.

**Fix:** Added the same MAX-based ID generation + 5-attempt IntegrityError retry loop.
