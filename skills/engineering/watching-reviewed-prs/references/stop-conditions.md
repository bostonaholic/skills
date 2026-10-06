# Stop conditions

## Stop list

The loop stops on exactly one condition, reported by name. The
[watch loop](shared/watch-loop.md) owns three: user interrupt, the 3-cycle
soft cap, and 3 consecutive poll failures. This skill adds the rest, and this
is the complete list:

- **`Approval cast`**: the gate cleared, every verdict passed, and the
  approval landed and read back.
- **`Merge or close`**: the PR reached a terminal state. Say "merged without
  your approval" when that is what happened.
- **`Empty tracked set`**: a mid-watch poll returns an empty tracked set. Stop
  without approving, and suggest approving by hand or re-arming after posting
  new comments. When only some tracked items vanish, the rest drive the gate:
  a withdrawn or deleted item neither blocks the approval nor is needed for it.
- **`Confirmation declined`**: the user said "no", or gave no answer, to a
  confirmation on the immediate path or before the cast. Report which
  confirmation was declined and that approving by hand remains available. (A
  "no" to the loop-path confirmation at arm refuses to arm; that loop never
  started.)
- **`Confirmation churn`**: three consecutive re-polls each triggered a new
  confirmation. Report it; re-arming remains available.
- **`Gate reopened`**: on the immediate path, the approval condition stopped
  holding before the cast (a thread reopened, or the sweep found a pending or
  rejected verdict). There is no loop to resume, and none starts silently.
  Report what changed, any rebuttal posted, and offer to re-arm.
- **`Third-party participant`**: the poll's third-party check fired. No
  resolve, reaction, rebuttal, or approval that cycle.
- **`Dispute stands`**: a rejected verdict repeats on a thread that already
  carries the viewer's reply below its first comment. No resolve, reaction,
  rebuttal, or approval that cycle.
- **`Approval failed`**: the approve call failed or did not read back. Map
  the error per [approve](references/approve.md).
- **`Tracked list lost`**: after a compaction, the tracked PR-level item list
  cannot be recovered. Offer to re-arm.

Never cast after a confirmation stop, and never turn one into a silent skip.

## Soft-cap notes

When the soft cap fires, add two notes. When a PR-level item is still pending,
name it and say this is the expected outcome for feedback the author never
engaged, not a malfunction. A rejected verdict that never draws a second reply
never reaches the Dispute-stands check, so it rebuts once and then waits on
the author: name each thread still holding one, what the last rebuttal argued,
and how the author answered.

## Final report

At every stop, report:

- the stop reason, by its name above or the watch loop's
- the number of cycles consumed
- when an approval was cast: its URL, the cited head SHA, and the per-item
  verdict summary (each thread's path or each PR-level item's URL, its shape,
  addressed or answered, the reaction placed, and who resolved it); both SHAs
  and a drift note when the head moved between arm and approval; and both
  counts for any shape whose tracked count changed
- the write ledger, on every path: threads resolved, rebuttals posted and
  where, and reactions placed
- on the soft cap: which tracked items were still gated, split by shape; for
  PR-level feedback, whether it was never engaged or engaged but pending; any
  thread still holding a rejected verdict, with the last rebuttal and the
  author's answer; and the by-hand options (make the argument yourself, take
  the author's position and resolve, approve manually, or re-arm)
- the hand-off: none after an approval; on the soft cap, the tracked-set state
  and the command that re-arms the watch; on an interrupt or a confirmation
  stop, an offer to re-arm
