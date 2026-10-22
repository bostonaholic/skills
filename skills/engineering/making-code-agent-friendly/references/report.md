# Audit report

The default Audit form. Adapt headings to the scope; keep the scorecard rows
and the finding form.

```markdown
# Agent-friendliness audit: <scope> @ <short sha>

| Dimension         | Rating | Evidence                                      |
| ----------------- | ------ | --------------------------------------------- |
| C Contention      | Weak   | `src/registry.ts` in 61% of 480 commits (AF1) |
| B Boundaries      | Mixed  | ...                                           |
| K Contracts       | Strong | ...                                           |
| D Discoverability | Mixed  | ...                                           |
| V Verification    | Weak   | ...                                           |

## Findings

1. **AF1 Conflict magnet (high)** `src/registry.ts:12`: every new handler
   edits this array, so parallel feature branches conflict here. Fix (P1):
   one file per handler under `src/handlers/`, loaded by directory
   convention.

## Refactor plan

1. Add the directory loader beside the array (expand; fixes AF1; touches
   `src/registry.ts`, `src/handlers/load.ts`). Parallel-safe with 3.
2. Move handlers to their own files, a few per change (migrate).
3. Delete the array once empty (contract).

## Strengths

## Not checked
```

## Rules

- **Ratings:** `Weak` when the dimension has a `high` finding; `Strong` when
  it has none and at most one `medium`; else `Mixed`; or `not measured`.
- **Findings:** rank by severity, then by how many changes they touch. Each
  cites `file:line`, its red flag ID, its severity, the consequence, and the
  fixing principle.
- **Refactor plan:** each step is one mergeable change that names the files
  it touches. Mark steps with disjoint files parallel-safe.
- **Not checked:** list what was skipped and why, such as a dimension with
  too little history or a module no subagent read.
