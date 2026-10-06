# Promotion mode

Promotion mode brings one named issue to the ready-to-work standard and moves
its card into the Ready column. It runs none of the board-mode steps.

## Contents

- Checklist
- Inputs
- The standard
- Column rules
- The stopping point

## Checklist

Copy this checklist and check off each step:

```text
Read-and-plan turn:
- [ ] 1. Create the run cache and load narrowly
- [ ] 2. Verify the issue's claims
- [ ] 3. Write the plan (rewrite, priority, card move; or the closure)
- [ ] 4. Present it, then end the turn
Execute turn, after the user answers:
- [ ] 5. Execute the answered steps in order
- [ ] 6. Re-read each value to verify it landed
- [ ] 7. Report, including what was left alone
```

## Inputs

One issue identified by number, on a named board; `$N` is the `--promote`
value. Create the [run cache](SKILL.md#run-cache), then load narrowly into it,
and nothing else. The board loads first: it holds the issue's repository, the
item id the card move needs, and the current contents of the Ready column,
which that column's work-in-progress limit needs.

```bash
# No default: a missing key must fail.
gh project item-list "$PROJECT" --owner "$OWNER" --format json --limit 10000 \
  > "$RUN_DIR/board.json"
jq -e '.totalCount == (.items | length)' "$RUN_DIR/board.json"
# The repositories holding an issue numbered $N on this board.
jq -r --argjson n "$N" '.items[] | select(.content.type == "Issue"
  and .content.number == $n) | .content.repository' "$RUN_DIR/board.json"
```

A board shortfall stops the run, as in board mode. The last query must print
exactly one `<owner>/<name>`. None means the issue is not on the board, which
stops non-zero. More than one means the number exists in several repositories:
stop, name them, and ask which. An owner that differs from `$OWNER` stops the
same way board mode does. Otherwise `$REPO` is the name, and every repository
call is scoped to `"$OWNER/$REPO"`.

Then load the issue with its body and every comment on it, its declared
dependency and decomposition links, and the milestone it belongs to. Resolve
the [board settings](SKILL.md#board-settings) the issue touches. Cache the
issue's current body to `original-body-<n>.md` before any rewrite is
composed, so the pre-image of the most destructive write here survives.

Everything loaded falls under [hard rule 1](references/hard-rules.md): every
mutation stays bound to this one issue.

## The standard

An item is ready to work when it states three things: the problem, an outcome
someone can check, and acceptance criteria that need no read of the author's
mind. Four moves bring it there, in order:

1. **Check against the real code and the real tracker** per
   [verifying claims](references/verifying-claims.md), before any rewrite,
   and fold in whatever the comment thread decided that the body never
   absorbed. **Claims hold** proceeds to the rewrite. **Partially stale**
   rewrites with the corrections folded in. **Premise evaporated** does not
   promote: propose the closure instead, per
   [closures](references/closures.md). Read the links here too, and read the
   thread for an undeclared blocker nobody drew: "We should do X first" is a
   blocker if anyone linked it.
2. **Rewrite to the standard** for the audience the tracker serves
   ([hard rule 9](references/hard-rules.md)): problem, verifiable outcome, and
   acceptance criteria. Technical detail moves to an implementation-notes
   section rather than gets deleted. Write the new body to a file in the run
   cache and hand it to the tracker by path.
3. **Set a priority** by the [ranking tiers](SKILL.md#ranking-tiers). Treat a
   priority field of `0` as unset on any tracker where `0` means unset, never
   as urgent.
4. **Move the card** into the Ready column, last, so the item is already
   ready when it lands there.

**A blocked item is not ready.** An open blocker, declared or found in the
thread and confirmed against the tracker, drops move 4 and nothing else: the
rewrite and the priority still stand. Name what blocks it and what would
unblock it. An undeclared blocker found here is proposed as a link on the same
plan under [hard rule 11](references/hard-rules.md), never drawn silently. A
closed blocker blocks nothing: check state, not presence.

## Column rules

- The Ready column holds at most its work-in-progress limit. Promoting into a
  full column means swapping a card back to the Backlog column: pick what is
  genuinely most important and move the displaced card back.
- A column already above its limit before the run is a **pre-existing
  breach**: report it, propose demotions, and add nothing.
- An issue with the excluded label is **never promoted to the Ready column**.
  It stops before any write, explaining that its own column is already its
  ready-to-pull state, and the card never moves.
- Never add a status-like label. The board's status field owns progress.

## The stopping point

Write the plan to `plan.md` in the run cache, in the shape of
[run file templates](references/templates.md), _before_ presenting it. The
plan holds the proposed rewrite, the priority, the card move, and the
displaced card when the Ready column is full; or, on a premise-evaporated
verdict, the proposed closure with its exact comment body. Present the plan
with one recommendation per question, then end the turn:

> "The plan is at `<path>/plan.md`: close #41. The guard it asks for is
> already in `<existing guard path>`, observed today. The exact evidence
> comment is in `<path>/closure-evidence-41.md`. The closure needs its own
> answer. Nothing on the board has changed."

Nothing changes before the user answers. After the answer, execute in the
order of the four moves, re-read each value from the tracker to verify it
landed, and report what landed and what was left alone.
