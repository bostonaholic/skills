# Stop conditions

The [watch loop](shared/watch-loop.md) owns three stops: user interrupt, the
3-cycle soft cap, and 3 consecutive poll failures. This skill adds the stops
below. Each is reported by name, and this is the complete list.

| Stop                      | Fires when                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------ |
| `Approval`                | The PR is approved. Run the hand-off below.                                          |
| `Merge or close`          | The PR reached a terminal state.                                                     |
| `Third-party participant` | The poll's third-party check fired.                                                  |
| `Awaiting decision`       | Under `present-then-stop`, a batch left items below the auto-apply bar.              |
| `Feedback exclusion`      | A feedback item hit an exclusion, under either grant.                                |
| `Push failure`            | A feedback or CI fix push failed. Report the actual error output.                    |
| `CI fix bound`            | A check failed after its second fix attempt. Name the check, head SHA, and fix SHAs. |
| `CI exclusion`            | A candidate CI fix hit a CI exclusion. Report the candidate diff and restored paths. |

Green CI is not a stop. The loop keeps watching feedback until a condition
above ends it.

## On approval: hand off, never land

Never run `/landing-prs`; the merge decision belongs to the user. When the PR
is approved:

1. Report the approval.
2. Run one final triage pass over the fully paginated retrieval result: every
   unresolved thread and every PR-level item whose node id is not in the
   triaged-id set. Do not fetch again.
3. Print the CI state for the head: its SHA, the CI counts, and the failing
   and pending names. No CI fix pushes after approval.
4. End with `Next: run /landing-prs when you want to land it.`

## Final report

At every stop, report:

- the stop reason, by its name above or the watch loop's
- both grants: `feedback <present-then-stop|authorized>, CI <report|fix>`
- the head SHA and its failing and pending check names
- each fix commit SHA and each check's attempt count
- the number of cycles consumed
- the hand-off: on `Approval`, the line above; on the soft cap, the baseline
  state and the command that re-arms the watch; on `Awaiting decision` or
  `Feedback exclusion`, an offer to re-arm after the user's choices run
