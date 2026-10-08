# Board mode

## Contents

- Load once, in bulk
- Gap inventory
- Verify, rank, cluster
- Dependencies
- Plan and ask
- Execute, verify, report

## Load once, in bulk

The board loads first, because `$REPO` comes from it. Every paginated call
gets an explicit limit. A board or issue shortfall stops the run: never groom a
partial board. The comment and link caps can be hit on an ordinary board, so
those record the affected issues instead.

```bash
# The board, then its milestones. No default: a missing key must fail.
gh project item-list "$PROJECT" --owner "$OWNER" --format json --limit 10000 \
  > "$RUN_DIR/board.json"
jq -e '.totalCount == (.items | length)' "$RUN_DIR/board.json"
gh api --paginate "repos/$OWNER/$REPO/milestones?state=all&per_page=100" \
  > "$RUN_DIR/milestones.json"
# Every open issue with its declared links, in one query, never per issue.
ISSUE_FIELDS=number,title,body,labels,milestone,assignees,createdAt,updatedAt
LINK_FIELDS=blockedBy,blocking,parent,subIssues
gh issue list --repo "$OWNER/$REPO" --state open --limit 1000 \
  --json "$ISSUE_FIELDS,$LINK_FIELDS" > "$RUN_DIR/issues.json"
jq -e --argjson limit 1000 'length < $limit' "$RUN_DIR/issues.json"
jq -r '.[] | select(any(.blockedBy, .blocking, .subIssues;
  (.nodes | length) < .totalCount)) | .number' \
  "$RUN_DIR/issues.json" > "$RUN_DIR/unloaded-links.txt"
# Comment threads. A full page of 100 means the thread was read only in part.
for n in $(jq -r '.[].number' "$RUN_DIR/issues.json"); do
  gh api "repos/$OWNER/$REPO/issues/$n/comments?per_page=100" \
    > "$RUN_DIR/comments-$n.json"
  jq -e 'length < 100' "$RUN_DIR/comments-$n.json" > /dev/null \
    || echo "$n" >> "$RUN_DIR/unloaded-threads.txt"
done
```

Comments are not optional. A `blockedBy` node in state `CLOSED` is a satisfied
dependency, not a missing issue. A link node's `id` is a GraphQL node id, not
the database id REST writes need. Also resolve the board settings and the
authenticated login now.

## Gap inventory

Before forming any opinion, write `$RUN_DIR/gap-inventory.md`: one row per gap
with a count and the issues it names.

- no milestone, or still in a triage state; no priority set
- milestones past due, complete, undescribed, or empty
- missing problem, outcome, or acceptance criteria
- labels outside the project's dominant set
- estimate coverage; under a third, say rollups are not meaningful
- cross-team or cross-repo work with nobody named on the other side
- Ready or in-flight items with an open declared blocker
- links that cycle, self-point, or point at a closed or deleted issue
- blockers outside this repository or off the board

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
`original-body-<n>.md` before any rewrite; no pre-image, no rewrite. Each link
write re-reads both endpoints first and goes out from the blocked issue.

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
