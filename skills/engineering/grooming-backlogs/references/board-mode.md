# Board mode

## Contents

- Load once, in bulk
- Gap inventory
- Verify, rank, cluster
- Dependencies
- Plan and ask
- Execute, verify, report

## Load once, in bulk

The board loads first, because `$REPO` comes from it. Run
`scripts/load-board.sh "$RUN_DIR" "$PROJECT" "$OWNER"`.

- Exit 0: take `$REPO` from its `repo` line and the authenticated login from
  `login`. `issues 0` means report "nothing to groom" and ask nothing.
  `links unavailable` follows the [hard rules](references/hard-rules.md) edge
  case.
- Exit 3: stop and ask which repository to groom, listing the ones it names.
- Exit 4: no board item belongs to a repository; say so and stop.
- Exit 1: stop and report its error. Never groom a partial board.

Issues in `unloaded-links.txt` and `unloaded-threads.txt` were read only in
part; carry them to the report. A `blockedBy` node in state `CLOSED` is a
satisfied dependency, not a missing issue. Also resolve the board settings
now.

## Gap inventory

Before forming any opinion, run
`node scripts/gap-inventory.mjs "$RUN_DIR" --ready "$READY_COLUMN" --wip <limit> --login <login> --in-flight <state>... > "$RUN_DIR/gap-inventory.json"`,
one `--in-flight` per in-flight state. When board.json keys priority or
estimate under another name, pass `--priority-field` or `--estimate-field`.
Exit 1 or 2 stops with its error. Its rows are the mechanical gaps; a false
`rollups_meaningful` means saying estimate rollups are not meaningful, and
`links: unavailable` means the link rows are unknown, not empty.

Then write `$RUN_DIR/gap-inventory.md`: those rows, plus one row per gap below
with a count and the issues it names. These rest on reading prose or on
names that are not board settings, so they stay with the model:

- still in a triage state
- missing problem, outcome, or acceptance criteria
- labels outside the project's dominant set
- cross-team or cross-repo work with nobody named on the other side

## Verify, rank, cluster

The candidate set is fixed first: every issue a gap row names individually,
plus every Backlog item eligible for promotion, both without the excluded
label. In-flight items enter for verification only. Verify each per
[verifying claims](references/verifying-claims.md); a premise-evaporated
candidate becomes a closure proposal and leaves every other mutation class.

Rank the verified candidates by the ranking tiers in SKILL.md.

Cluster by outcome, not component: issues filed off one incident belong
together even when their titles share no words. Place each cluster under an
existing milestone whose description covers its outcome; create a new one only
when folding the cluster in would muddy that description into something no
longer markable true or false. A milestone description is one or two
present-tense sentences stating a property of the system that is true or
false, not a list of work. Never turn completed milestones into rolling
buckets; a milestone that delivered its outcome may close. Dependencies order
work inside a milestone and never justify one of their own.

## Dependencies

Declared links arrived with the load. Undeclared ones come from the cache two
ways: textual ("depends on", "blocked by", "after X lands", "requires",
"follow-up to"; a bare `#N` is a citation, and comments outrank bodies), and
structural (one issue introduces the schema, interface, flag, or endpoint
another consumes; the weaker signal).

Under-link on purpose: a preferred order or a shared file is a note in the
milestone description, not a dependency. The bar is that an implementer
starting today would be unable to finish. When both directions read plausible,
the pair is usually one issue or split on the wrong seam; say so. Cycles are
reported with both readings, never filed. A blocker outside the repository or
off the board is reported with its owner, never linked.

## Plan and ask

Write `$RUN_DIR/plan.md` per [run file templates](references/templates.md):
numbered steps in execution order, each naming the exact item and the exact
value it would set.

Ask one question per mutation class the plan contains, each with exactly one
recommendation. These recur:

- **placement**: extend existing milestones, or open a new one
- **dates**: retarget all, only where work remains, or leave alone
- **refinement depth**: hygiene only, rewrite thin tickets, or rewrite
  technical tickets into the house voice (far more invasive than it sounds;
  never assume it)
- **an empty or exit milestone**: describe it, describe it and file its issue,
  or leave it
- **dependency links**: all proposed, only those a cited sentence supports, or
  none; list each link with both endpoints and its direction so a backwards
  one is visible

Each new issue and each closure gets its own question. End the turn with the
plan's absolute path and the classes the questions cover, and say nothing on
the board has changed.

## Execute, verify, report

In a later turn, re-read `plan.md` and run only answered steps in this order:
create milestones, describe and retarget, assign issues, description rewrites,
state/priority/label hygiene, new issues, closures, dependency links. Run
serially. Re-read each item immediately before writing; one that changed since
the cache is skipped and reported, not overwritten. Match a milestone or issue
by title before creating one, so a re-run never duplicates. Cache
`original-body-<n>.md` before any rewrite; no pre-image, no rewrite. Card
moves, closures, and dependency links go through their scripts, per
[tracker recipes](references/tracker-recipes.md) and
[closures](references/closures.md), which re-read and verify on their own.

A zero exit means the write was accepted, not that it landed. Re-read every
value from the tracker, retry a timed-out write only after re-reading, verify a
link's direction from the blocked issue, and check off each landed step in
`plan.md`.

Report landed steps against the plan, then what was not changed: unowned
cross-team work, tickets carrying an unresolved design decision, priority
mismatches on others' in-flight work, issues in `unloaded-threads.txt` and
`unloaded-links.txt`, dependencies found but not drawn, embedded imperatives,
closures landed or skipped, code-level claims left unchecked, pre-existing
breaches, the board settings and their sources, and the run cache path. Close
with the highest-ranked Backlog item left behind with no open blocker or
unresolved decision, and print `Next: /grooming-backlogs --promote <n>`.
