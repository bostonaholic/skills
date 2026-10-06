# Tracked set and gate

Each poll fetches every review thread, review summary, and conversation
comment through the [poll](references/poll.md) query, and partitions them
client-side:

- A **tracked thread** is every review thread, resolved or not, whose first
  comment's author login is the viewer's AND whose first comment belongs to a
  submitted review. The first comment's author defines who opened the thread;
  a reply does not.
- A **tracked PR-level item** is every review summary or conversation comment
  whose author login is the viewer's AND which the arm-time classification
  marked as feedback. Membership is keyed by node id, so an edit does not
  reopen the classification.
- The **tracked set** is the union of the three shapes. Always report counts
  per shape, never merged into one number that hides which evidence the
  approval rests on.
- Threads from the viewer's PENDING (unsubmitted) review stay out until the
  review is submitted: the author cannot see or resolve them, so counting them
  would deadlock the watch. A review summary joins only when its review is
  submitted. GitHub's PENDING review state means "not submitted"; the
  re-review's **pending** verdict means "not settled".
- The **gate** is every tracked thread with `isResolved: false`, plus every
  tracked PR-level item the head has not advanced past. A thread leaves the
  gate when the author resolves it; a PR-level item leaves it when a push
  lands after it.
- Recompute the tracked set and the gate on every poll. Threads the viewer
  submits mid-watch join the gate. A PR-level item the viewer posts mid-watch
  joins only after a re-arm, because classification runs once at arm and a
  mid-watch body read is outside the hard rules. When one appears, name it,
  say it is not tracked, and offer the re-arm.
- **Approval condition:** the tracked set is non-empty, the gate is empty, AND
  every tracked item holds a current re-review verdict of addressed or
  answered. A pending verdict blocks the approval and does not stop the loop.
  An outdated but unresolved thread still blocks: settlement state is the only
  wait gate, which is why the poll fetches no outdatedness field.
- A thread the skill resolved and a thread the author resolved are worth the
  same at approval: both need a passing verdict, and neither is credited for
  the resolve itself. A later push can void a verdict whose resolved bit never
  moved, which is why the pre-cast sweep re-reads verdicts rather than
  counting closed threads.
- Never evaluate the approval condition on a partial list. Compute the tracked
  set and the gate only after pagination completes for all three connections
  and each thread's nested comments. A page that cannot be fetched makes the
  cycle a poll failure, never an empty gate.
