# Reconcile status rules

Derive each dispatched PR's status from its `reconcile.sh` line and its result
file `<run>/<n>.json`. Two precedence rules keep failures loud:

- **The result file owns the agent's action; git owns remote truth.** A failure
  status in the file (`conflicts-flagged`, `push-rejected`, `error`, `skipped`)
  stands even when git shows the branch contains its base, since the branch may
  have contained it before the run.
- **Disagreement is surfaced, never resolved silently.** When git contradicts
  the file, report `needs-review` with both signals.

Result file present:

| File `status`                                         | Expected reconcile            | Derived status                                                |
| ----------------------------------------------------- | ----------------------------- | ------------------------------------------------------------- |
| `pushed`                                              | `REBASED=yes OID_CHANGED=yes` | `pushed`                                                      |
| `pushed`                                              | anything else                 | `needs-review` (claimed push not on the remote)               |
| `already-up-to-date`                                  | `REBASED=yes OID_CHANGED=no`  | `already-up-to-date`                                          |
| `conflicts-flagged`/`push-rejected`/`error`/`skipped` | any                           | the file's status, plus `needs-review` when `OID_CHANGED=yes` |

Result file missing (the agent stopped before persisting; use git alone):

| Reconcile signal              | Derived status                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| `REBASED=yes OID_CHANGED=yes` | `pushed` (the push is real; the agent stopped after it)                                                 |
| `REBASED=yes OID_CHANGED=no`  | `already-up-to-date`                                                                                    |
| `REBASED=no OID_CHANGED=yes`  | `needs-review` (pushed without containing the base: a stale base, or the base advanced after the fetch) |
| `REBASED=no OID_CHANGED=no`   | still running or stopped: run the [bounded wait](SKILL.md#6-reconcile-and-report)                       |

Regardless of the result file: `CURRENT_OID=missing` means `branch-gone`
(merged or closed during the run), and `REBASED=base-missing` means
`needs-review` (the PR's base branch no longer exists, an orphaned stacked PR).

Report statuses: `pushed`, `already-up-to-date`, `conflicts-flagged`,
`push-rejected`, `skipped`, `needs-review`, `branch-gone`, `error`.
