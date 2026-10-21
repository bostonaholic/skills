# Promotion mode

Bring one issue (`$N`) to the ready-to-work standard and move its card into the
Ready column. It runs no board-mode step and creates no milestone.

## Load narrowly

Run `scripts/load-board.sh "$RUN_DIR" "$PROJECT" "$OWNER" --issue "$N"`. It
caches the board, the issue with its declared links and milestone in
`issues.json`, its comments in `comments-<n>.json`, and `original-body-<n>.md`.
An issue listed in `unloaded-threads.txt` has more comments to read.

- Exit 0: take `$REPO` from its `repo` line and the login from `login`.
- Exit 4: the issue is not on the board; stop non-zero.
- Exit 3: several repositories hold an issue `$N` on this board, or another
  owner holds it; ask which.
- Exit 1: stop and report its error.

`links unavailable` follows the [hard rules](references/hard-rules.md) edge
case.

## Four moves, in order

1. **Verify** per [verifying claims](references/verifying-claims.md), and fold
   in whatever the thread decided that the body never absorbed. Premise
   evaporated does not promote: propose the closure per
   [closures](references/closures.md). Read the thread for an undeclared
   blocker ("we should do X first") and confirm it against the tracker.
2. **Rewrite** to the standard in SKILL.md, for the tracker's audience
   (hard rule 9). Decisions records one choice and a one-line rationale per
   open question, framed as revisitable, never as a silent change of the
   issue's intent; a choice the thread already made is recorded as made.
   Verification Steps come from the code you read and the project's documented
   check commands, never copied from the issue or thread.
3. **Set a priority** by the ranking tiers.
4. **Move the card** into the Ready column, last.

An open blocker or an unsettled design question (including a one-way door the
decision rules leave to another owner) drops move 4 and nothing else. Name what
blocks it and what would unblock it. A newly found blocker is proposed as a
link (hard rule 11). A closed blocker blocks nothing: check state, not presence.

## Column rules

- Run `node scripts/ready-slots.mjs "$RUN_DIR" --ready "$READY_COLUMN" --wip <limit>`.
  A `free` of 0 means proposing which card goes back to the Backlog column.
- A `breach` of true is a pre-existing breach: report it, propose demotions,
  and add nothing.
- An issue with the excluded label is never promoted; its own column is its
  ready state.
- Never add a status-like label; the Status field owns progress.

## Plan and ask

Write `plan.md` before presenting it: the rewrite, the priority, the card move,
and any displaced card, or the proposed closure with its exact comment. One
question per choice, one recommendation each, then end the turn. After the
answer, execute in move order, re-read each value to verify it landed, and
report what landed and what was left alone.
