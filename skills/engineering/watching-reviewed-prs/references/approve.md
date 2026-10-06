# Approve

## Contents

- Pre-cast re-review sweep
- Merge-safety checks
- Re-poll after a confirmation
- Cast
- Approval body
- Verify the approval

## Pre-cast re-review sweep

The approval covers every tracked item, so before any merge-safety check every
tracked thread and PR-level item must hold a current verdict of addressed or
answered. Re-review any item that lacks one: a thread that resolved during a
confirmation wait, an item engaged during that wait, a verdict voided by a
reopen, or verdicts lost to a compaction.

- When the head moved after a verdict was recorded, re-check the threads whose
  `path` the new commits touch. PR-level items have no `path`, so re-check
  every one whenever the head moved after its verdict; failing closed on the
  whole set is the only sound option when an item does not say which files it
  covers.
- Render every verdict, across all three shapes, before any write. Test every
  thread with a rejected verdict for a viewer reply already below its first
  comment. When any one has it, stop as `Dispute stands` on either path, and
  rebut nothing.
- Otherwise rebut every rejected verdict of any shape (a PR-level rejected
  verdict always rebuts here, since `Dispute stands` tests threads only). Then
  resume polling on the loop path, or stop as `Gate reopened` on the immediate
  path.
- A pending verdict means the approval condition does not hold: never cast.
  Resume polling on the loop path, or stop as `Gate reopened` on the immediate
  path.

## Merge-safety checks

When the approval condition holds, on either path, run these against the
**final poll**, the most recent run of the poll query. Each triggered check
needs an explicit confirmation before the cast. A "no" or no answer is the
`Confirmation declined` stop; report which check was declined. On the
immediate path, an auto-merge confirmation from arm already counts.

- **Head drift.** When the final poll's `headRefOid` differs from the arm-time
  head, with auto-merge on or off, confirm. Name both SHAs in the approval body
  and the final report.
- **Auto-merge without an arm-time confirmation.** When the final poll shows
  auto-merge enabled and no auto-merge confirmation exists from arm, confirm,
  even when the head never moved: it flipped on mid-watch, or the arm-time
  record is lost.
- **Unrecoverable drift baseline.** The drift baseline is the arm-time head SHA
  in the arm report and every snapshot line. When a compaction left no copy,
  never re-derive it from the current head, because a baseline read from the
  value under test proves nothing. Never approve unconfirmed: ask for a
  confirmation that names the missing baseline, or stop.

## Re-poll after a confirmation

A granted confirmation is itself a stale read. After any granted confirmation,
from these checks or from the immediate path, re-run the poll, which becomes
the final poll. Re-evaluate the approval condition and every check above
against it before the cast.

- A check the fresh poll newly triggers needs its own confirmation. A check
  that re-triggers with different values counts as new: a drift confirmed at
  head B never covers a cast at head C. A re-trigger on the same values stays
  covered.
- When the fresh poll fails the approval condition (a thread reopened during
  the wait), never cast. Resume polling on the loop path. On the immediate
  path, stop as `Gate reopened`. Neither consumes a confirmation round.
- The confirm-then-re-poll loop is bounded per the
  [execution rules](shared/execution.md): at three consecutive re-polls that
  each trigger a new confirmation, stop as `Confirmation churn` without
  approving.

## Cast

Write the approval body to a temporary file with the file-writing tool, then
cast one approval against `$PR_URL`, the canonical URL bound at arm:

```bash
gh pr review --approve "$PR_URL" --body-file <approval-body-file>
```

The approve call runs with no pre-flight check. Map its errors:

- A 422 self-approval rejection: report it verbatim and never retry.
- A rejection because the viewer holds a pending review: tell the user to
  submit or delete the pending review, then re-arm. Never show only the raw
  API error.
- Any other failure (permissions, organization policy, archived repository):
  report it verbatim.

Each is the `Approval failed` stop.

## Approval body

Use this template, filling every placeholder:

```text
Approved automatically: all <T> review threads, <S> review summaries, and <C> conversation comments from @<viewer> are settled, and each settlement was re-reviewed against the diff and accepted. <R> of those threads were resolved by this review after the reply was checked against the branch; the rest the author resolved. Review summaries and conversation comments carry no resolve state, so their settlement was judged from the change and the replies rather than read from a resolved flag. Head commit at approval time: <approval-head-SHA>. Armed at head commit: <arm-head-SHA>.
```

Adapt it only as follows:

- When `<R>` is zero, drop the resolved-by-this-review sentence.
- When `<S>` and `<C>` are zero, drop both PR-level counts and the
  judged-how sentence, and say "all `<T>` review threads opened by
  @`<viewer>` are resolved".
- When the two SHAs are equal, collapse them into "Head commit at arm and
  approval time: `<head-SHA>`."
- When `<T>`, `<S>`, or `<C>` differs from its arm-time tracked count, items
  were deleted or added mid-watch: name both counts for that shape, so a gate
  cleared by deletion never reads as one cleared by settlement.
- When the arm-time SHA was unrecoverable and the user confirmed anyway, say
  so in place of that SHA. Never invent one.
- Add any disclosure marker the user or project convention prescribes (an
  emoji prefix, a footer) on top.

"Approved automatically" is the automated-attribution disclosure. The body
never names this skill, a slash command, or an agent. The approval head SHA is
the final poll's `headRefOid`, and the re-poll rule guarantees no wait
separates that poll from the cast.

## Verify the approval

An exit code proves only that the call was accepted. Re-read the viewer's
latest review, selecting structural fields only:

```bash
gh api --hostname "$HOST" graphql -f owner="$OWNER" -f repo="$REPO" -F number="$NUMBER" -f query='
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      latestReviews(first: 100) {
        pageInfo { hasNextPage endCursor }
        nodes { author { login } state url commit { oid } }
      }
    }
  }
}'
```

Report `Approval cast`, with the review `url`, only when the node whose login
equals `$VIEWER` reads `APPROVED` at the approval head SHA. Otherwise stop as
`Approval failed` and report what the read showed.
