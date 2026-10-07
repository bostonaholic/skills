# Batch promotion mode

Batch promotion mode readies the top `<count>` candidates in one run. It puts
a selection in front of promotion mode's
[standard](references/promotion-mode.md#the-standard) and relaxes none of its
gates: each selected issue goes through the standard's four moves and gets its
own plan section and its own answer. The
[hard rules](references/hard-rules.md) hold unchanged.

## Contents

- Checklist
- Load and pool
- Selection
- Each selected issue
- The stopping point
- Execute
- Report

## Checklist

Copy this checklist and check off each step:

```text
Read-and-plan turn:
- [ ] 1. Load once, in bulk (board-mode step 1)
- [ ] 2. Build the pool
- [ ] 3. Verify the pool's claims (board-mode step 3)
- [ ] 4. Rank the verified candidates (board-mode step 4)
- [ ] 5. Select up to the count and the free Ready slots
- [ ] 6. Plan each selected issue by the standard
- [ ] 7. Write the plan, present it, then end the turn
Execute turn, after the user answers:
- [ ] 8. Execute each answered issue in rank order
- [ ] 9. Re-read each value to verify it landed
- [ ] 10. Report, including what was left alone
```

## Load and pool

Run step 1 of [board mode](references/board-mode.md) unchanged: it creates
and prints the run cache, loads the board, and resolves the
[board settings](SKILL.md#board-settings). Step 2 does not run.

The pool is every open item in the Backlog column without the excluded label,
narrowed to the focus area when one was passed. Judge the focus match from
each item's cached title, labels, and body, and record the issue numbers kept
and dropped, numbers only, in `$RUN_DIR/pool.md`. With a focus area, run
this judgment in one `sonnet` subagent given the focus area, `$RUN_DIR`, and
`references/hard-rules.md` and this file to read; it may write only
`$RUN_DIR/pool.md` and returns the kept issue numbers. Board-mode step 3 then
runs with this pool as both its candidate set and its closure pool, and step 4
ranks the verified candidates. An empty pool reports that nothing matched,
proposes nothing, and asks nothing.

## Selection

Take the top `<count>` of the step 4 ranking in rank order, or the whole
ranking when it is shorter. Read the Ready column's free slots from the board
load: its work-in-progress limit minus the cards already in it. A column
already above its limit is a pre-existing breach under the
[column rules](references/promotion-mode.md#column-rules): report it, propose
demotions, and select nothing.

## Each selected issue

Plan each selected issue in its own subagent, launched together with at most 4
in flight, given the issue number, `$RUN_DIR`, the board settings, and
`SKILL.md`, `references/hard-rules.md`, `references/promotion-mode.md`, and
this file to read; it may write only `plan-<n>.md`, `original-body-<n>.md`,
and `body-<n>.md` in the run cache. It returns those paths, whether move 4
drops and why, and each proposed link, and this session applies the limit
below in rank order before joining the sections into `plan.md`.

Apply the standard's four moves in rank order. The board load already holds
promotion mode's narrow load, and the issue's block in
`$RUN_DIR/verification.md` from step 3 is move 1's verification record. Read the thread for an undeclared blocker as move 1
says, and cache `original-body-<n>.md` before composing that issue's rewrite.
A blocked or undecided issue keeps the standard's outcome for that case: it
drops move 4 and takes no slot. The batch does not backfill it with the
next-ranked candidate.

**The limit stops the batch.** Each card move takes one free slot. The batch
stops at the first selected issue whose card move would exceed the limit.
That issue and every selected issue after it get no plan section, and the
plan names the free-slot count and each issue the limit left out. The batch
never displaces a card to make room: that swap stays a single-issue
`--promote` decision.

## The stopping point

Write every issue's section into one `$RUN_DIR/plan.md` in rank order, in the
shape of [run file templates](references/templates.md), with any proposed
demotions, closures, and links after them. The plan's header also names the
focus area, the pool file, and the Ready column's free slots. Present one
question per selected issue and one per proposed demotion, closure, and link,
each with exactly one recommendation, then end the turn. A single yes
never promotes or closes more than the one issue it answers.

> "The plan is at `<path>/plan.md`: promote #12, #7, and #30, and close #19.
> The Ready column had 3 free slots, so #25 was left out. Each issue and the
> closure need their own answer. Nothing on the board has changed."

## Execute

In a later turn, re-read `$RUN_DIR/plan.md` and re-validate each step against
its own answer, per [hard rule 1](references/hard-rules.md). Execute each
answered issue in rank order, in the standard's order: rewrite, priority,
then the card move last. Skip an unanswered issue and report it. Re-read the
issue and the Ready column immediately before each card move. A move that
would exceed the limit at that moment is skipped, and so is every later move;
report each one. Demotions, closures, then links run after the issues, each
only against its own answer. The re-read, pre-image, and closure rules of board-mode
step 9 and the re-query of step 10 bind every write.

## Report

Report what landed, verified by re-query, and what was left alone. Name the
focus area and the pool it produced, each selected issue that dropped move 4
and why, each issue the limit left out with the free-slot count, and each
closure landed or skipped. Then name the highest-ranked candidate the batch
did not select, with no open blocker and no unresolved design decision, and
print `Next: /grooming-backlogs --promote <n>` ready to paste, or say that
none is left. Include every item of board-mode step 11's list that applies.
