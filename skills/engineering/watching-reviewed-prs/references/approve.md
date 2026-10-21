# Approve

## Pre-cast sweep

The approval covers every tracked item, so each must hold a current addressed
or answered verdict before any merge-safety check: re-review every entry in
the latest poll's `triggers`. When the head moved after a thread's verdict,
also re-check the threads whose `path` the new commits touch; a PR-level item
re-triggers on a push by itself, since it does not say which files it covers.

Render every verdict before any write. A rejected thread verdict on an item
with `viewerReplied: true` stops as `Dispute stands`, rebutting nothing.
Otherwise rebut every rejected verdict. Any rejected or pending verdict means
no cast: resume polling on the loop path, or stop as `Gate reopened` on the
immediate path.

## Merge-safety confirmations

Run these against the final poll's `safety`. Each `true` check needs an
explicit confirmation before the cast; a "no" or no answer is
`Confirmation declined`, naming the check.

- **`headDrift`:** the head moved since arm, with auto-merge on or off. Name
  `armHead` and `pr.head`.
- **`autoMergeUnconfirmed`:** auto-merge flipped on mid-watch, or the
  arm-time record was lost. A granted confirmation sets `autoMergeConfirmed`
  in the state file.
- **`baselineMissing`:** a compaction left no copy of the arm-time head.
  Confirm with the user, naming the missing baseline, or stop.

A granted confirmation is itself a stale read: re-run the poll, which becomes
the final poll, and re-evaluate `approvalReady` and every check. A check that
re-triggers with different values is new (drift confirmed at head B never
covers a cast at head C). If `approvalReady` is false, never cast. Three
consecutive re-polls that each trigger a new confirmation stop as
`Confirmation churn`.

## Cast

Run `node <skill-dir>/scripts/render-approval.mjs <state-file> <final-poll-file>`
and write its stdout to the body file; exit 2 means the poll is not
approval-ready or a file is malformed, so never cast. Append any disclosure
marker the user or project prescribes; the body never names this skill, a
slash command, or an agent.

Cast once against the canonical URL bound at arm:
`gh pr review --approve "$PR_URL" --body-file <file>`. Map failures to
`Approval failed`: report a 422 self-approval rejection verbatim and never
retry; for a pending-review rejection, tell the user to submit or delete the
pending review, then re-arm; report anything else verbatim.

## Verify

An exit code proves only that the call was accepted. Run
`node <skill-dir>/scripts/verify-approval.mjs "$PR_URL" <viewer> <pr.head>`
with the final poll's values. Exit 0 reports `Approval cast` with the
printed `url`. Any other exit stops as `Approval failed` with what the
script printed.
