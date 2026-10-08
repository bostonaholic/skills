# Approve

## Pre-cast sweep

The approval covers every tracked item, so each must hold a current addressed
or answered verdict before any merge-safety check. Re-review any item without
one: a thread resolved or an item engaged during a confirmation wait, a
verdict voided by a reopen, or verdicts lost to a compaction. When the head
moved after a verdict, re-check the threads whose `path` the new commits touch
and every PR-level item, since a PR-level item does not say which files it
covers.

Render every verdict before any write. A rejected thread verdict on a thread
that already carries a viewer reply stops as `Dispute stands`, rebutting
nothing. Otherwise rebut every rejected verdict. Any rejected or pending
verdict means no cast: resume polling on the loop path, or stop as
`Gate reopened` on the immediate path.

## Merge-safety confirmations

Run these against the **final poll**. Each triggered check needs an explicit
confirmation before the cast; a "no" or no answer is `Confirmation declined`,
naming the check.

- **Head drift:** the final head differs from the arm-time head, with
  auto-merge on or off. Name both SHAs.
- **Auto-merge without an arm-time confirmation:** it flipped on mid-watch, or
  the arm-time record was lost.
- **Unrecoverable drift baseline:** a compaction left no copy of the arm-time
  head. Never re-derive it from the current head, because a baseline read
  from the value under test proves nothing. Confirm with the user, naming the
  missing baseline, or stop.

A granted confirmation is itself a stale read: re-run the poll, which becomes
the final poll, and re-evaluate the approval condition and every check. A
check that re-triggers with different values is new (drift confirmed at head B
never covers a cast at head C). If the approval condition no longer holds,
never cast. Three consecutive re-polls that each trigger a new confirmation
stop as `Confirmation churn`.

## Cast

Write the body to a file and cast once against the canonical URL bound at arm:
`gh pr review --approve "$PR_URL" --body-file <file>`. Map failures to
`Approval failed`: report a 422 self-approval rejection verbatim and never
retry; for a pending-review rejection, tell the user to submit or delete the
pending review, then re-arm; report anything else verbatim.

The body, filling every placeholder:

```text
Approved automatically: all <T> review threads, <S> review summaries, and <C> conversation comments from @<viewer> are settled, and each settlement was re-reviewed against the diff and accepted. <R> of those threads were resolved by this review after the reply was checked against the branch; the rest the author resolved. Review summaries and conversation comments carry no resolve state, so their settlement was judged from the change and the replies rather than read from a resolved flag. Head commit at approval time: <approval-head-SHA>. Armed at head commit: <arm-head-SHA>.
```

- Drop the resolved-by-this-review sentence when `<R>` is zero.
- With no PR-level items, drop their counts and the judged-how sentence, and
  say "all `<T>` review threads opened by @`<viewer>` are resolved".
- Collapse equal SHAs into "Head commit at arm and approval time: `<SHA>`."
- When a count differs from its arm-time count, name both, so a gate cleared
  by deletion never reads as one cleared by settlement.
- When the arm-time SHA was unrecoverable and the user confirmed, say so;
  never invent one.
- Add any disclosure marker the user or project prescribes. The body never
  names this skill, a slash command, or an agent.

## Verify

An exit code proves only that the call was accepted. Re-read `latestReviews`
(author login, `state`, `url`, `commit.oid` only) and report `Approval cast`
with its URL only when the viewer's node reads `APPROVED` at the approval head
SHA. Otherwise stop as `Approval failed` with what the read showed.
