# Promotion mode

Bring one issue (`$N`) to the ready-to-work standard and move its card into the
Ready column. It runs no board-mode step and creates no milestone.

## Load narrowly

```bash
gh project item-list "$PROJECT" --owner "$OWNER" --format json --limit 10000 \
  > "$RUN_DIR/board.json"
jq -e '.totalCount == (.items | length)' "$RUN_DIR/board.json"
# The repositories holding an issue numbered $N on this board.
jq -r --argjson n "$N" '.items[] | select(.content.type == "Issue"
  and .content.number == $n) | .content.repository' "$RUN_DIR/board.json"
```

The last query must print exactly one `<owner>/<name>`. None means the issue is
not on the board (stop non-zero); several means ask which; an owner other than
`$OWNER` stops. Then load the issue with its body, every comment, its declared
links, and its milestone, and cache `original-body-<n>.md`.

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

- The Ready column holds at most its WIP limit. Promoting into a full column
  means proposing which card goes back to the Backlog column.
- A column already over its limit is a pre-existing breach: report it, propose
  demotions, and add nothing.
- An issue with the excluded label is never promoted; its own column is its
  ready state.
- Never add a status-like label; the Status field owns progress.

## Plan and ask

Write `plan.md` before presenting it: the rewrite, the priority, the card move,
and any displaced card, or the proposed closure with its exact comment. One
question per choice, one recommendation each, then end the turn. After the
answer, execute in move order, re-read each value to verify it landed, and
report what landed and what was left alone.
