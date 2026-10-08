# Batch promotion mode

Ready the top `<count>` candidates in one run. It applies
[promotion mode](references/promotion-mode.md)'s four moves to each selected
issue and relaxes none of its gates.

## Pool and selection

Load as [board mode](references/board-mode.md) does (its one-repository rule
binds here); skip the gap inventory. The pool is every open Backlog item
without the excluded label, narrowed to the focus area by judgment over each
item's cached title, labels, and body. Record kept and dropped issue numbers,
numbers only, in `$RUN_DIR/pool.md`. Verify the pool, which is also the closure
pool, then rank it. An empty pool proposes nothing and asks nothing.

Take the top `<count>` in rank order. Free Ready slots are the WIP limit minus
the cards already there; a column already over its limit is a pre-existing
breach, so propose demotions and select nothing.

**The limit stops the batch.** Each card move takes one slot. A blocked or
undecided issue drops move 4, takes no slot, and is not backfilled. The batch
stops at the first issue whose move would exceed the limit; it and every later
issue get no plan section, and the plan names them with the free-slot count.
The batch never displaces a card; that swap is a single `--promote` decision.

## Plan, ask, execute

One `plan.md` with each issue's section in rank order, then any demotions,
closures, and links; its header names the focus area, the pool file, and the
free slots. Ask one question per issue, demotion, closure, and link. A single
yes never promotes or closes more than the one issue it answers.

In a later turn, run each answered issue in rank order (rewrite, priority, card
move last). Re-read the issue and the Ready column right before each card move;
a move that would now exceed the limit is skipped, and so is every later one.
Board mode's re-read, pre-image, and verification rules bind every write.
Report as board mode does, plus the focus area and pool, each issue that dropped
move 4 and why, and each issue the limit left out. End with
`Next: /grooming-backlogs --promote <n>` for the best unselected candidate, or
say none is left.
