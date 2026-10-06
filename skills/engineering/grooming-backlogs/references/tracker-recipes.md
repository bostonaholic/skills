# Tracker recipes

## Contents

- Issues, milestones, and closures
- Dependency links
- Board column
- Other trackers: check `--help` first

## Issues, milestones, and closures

GitHub Projects, the worked example. Every prose value travels by file, per
[hard rule 2](references/hard-rules.md). Labels come from the
[board settings](SKILL.md#board-settings). Milestones live on the repository,
not the project:

```bash
# Create one. Re-describing an existing one is the same shape: build a JSON body
# carrying only the changed keys, then PATCH ".../milestones/$M" with --input.
jq -n --arg title "$MILESTONE_TITLE" --arg description "$DESCRIPTION" \
  --arg due_on "$DUE_ON" '{title: $title, description: $description,
  due_on: $due_on}' > "$RUN_DIR/milestone-new.json"
gh api "repos/$OWNER/$REPO/milestones" --method POST \
  --input "$RUN_DIR/milestone-new.json"
# Attach an issue. The title reaches the command only as an expanded variable.
MILESTONE_TITLE=$(jq -r --argjson m "$M" '.[] | select(.number == $m) | .title' \
  "$RUN_DIR/milestones.json")
gh issue edit "$N" --repo "$OWNER/$REPO" --milestone "$MILESTONE_TITLE"
# Rewrite a description: pre-image first, replacement by path (`--body-file -` reads
# stdin instead).
gh issue view "$N" --repo "$OWNER/$REPO" --json body --jq .body \
  > "$RUN_DIR/original-body-$N.md"
gh issue edit "$N" --repo "$OWNER/$REPO" --body-file "$RUN_DIR/body-$N.md"
# A new issue — only against a question the user answered explicitly.
gh issue create --repo "$OWNER/$REPO" --title "$NEW_ISSUE_TITLE" \
  --body-file "$RUN_DIR/new-issue-1.md" --label "$NEW_ISSUE_LABEL"
# A comment. `-F body=@<path>` reads the file and `-F body=@-` the same flag's stdin.
gh api --method POST "repos/$OWNER/$REPO/issues/$N/comments" \
  -F body=@"$RUN_DIR/comment-$N.md"
gh issue edit "$N" --repo "$OWNER/$REPO" --add-label "$LABEL"  # additive only
# An approved closure. Pre-close re-read first — no pre-image, no close.
gh issue view "$N" --repo "$OWNER/$REPO" --json state,body,labels,updatedAt \
  > "$RUN_DIR/pre-close-$N.json"
# The evidence comment travels whole by file. A re-run matches it by content
# before re-posting.
gh api --method POST "repos/$OWNER/$REPO/issues/$N/comments" \
  -F body=@"$RUN_DIR/closure-evidence-$N.md"
# The fitting resolution label from the board settings, added additively.
gh issue edit "$N" --repo "$OWNER/$REPO" --add-label "$RESOLUTION_LABEL"
# "not planned", never "completed": the premise died, no work was delivered.
gh issue close "$N" --repo "$OWNER/$REPO" --reason "not planned"
```

## Dependency links

Dependency links are REST, keyed by **database id, not issue number**. Both are integers,
so a number passed as an id resolves to some unrelated issue rather than fail:

```bash
# $N is blocked by $BLOCKER. An undeclared blocker's number comes out of tracker
# text, so match it against the loaded board before it reaches a path: a value
# like `7/../../..` would re-target the request.
jq -e --argjson b "$BLOCKER" 'any(.[].number; . == $b)' "$RUN_DIR/issues.json" \
  || { echo "blocker #$BLOCKER is not on the loaded board — stopping" >&2; exit 1; }
# Resolve the blocker's database id — not its number, and not the `id` on the
# cached link nodes, which is a GraphQL node id.
BLOCKER_ID=$(gh api "repos/$OWNER/$REPO/issues/$BLOCKER" --jq .id)
# `-F` types its value, so issue_id lands as a JSON integer; `-f` sends the
# string "123" and the endpoint rejects it 422 — the inverse of the GraphQL
# rule below, where ids must travel over `-f` to stay strings.
gh api --method POST "repos/$OWNER/$REPO/issues/$N/dependencies/blocked_by" \
  -F issue_id="$BLOCKER_ID"
# Verify from the blocked issue: make sure of the direction, not just the edge.
gh issue view "$N" --repo "$OWNER/$REPO" --json blockedBy \
  --jq '.blockedBy.nodes[].number'
# Removal takes the same database id, in the path. Decomposition is a separate
# endpoint — POST ".../issues/$PARENT/sub_issues" -F sub_issue_id="$CHILD_ID".
gh api --method DELETE \
  "repos/$OWNER/$REPO/issues/$N/dependencies/blocked_by/$BLOCKER_ID"
```

## Board column

The board column is a single-select field, so it needs GraphQL. Resolve the item, field, and
option ids, write, then re-read. Every id goes over `-f`, which sends a string. `-F` types
its value, so an all-digit id would fail the `String!` variable.

```bash
# Ids: the project from `gh project view`, the Status field and its option from
# `gh project field-list`, and the item from the cached board.
PROJECT_ID=$(gh project view "$PROJECT" --owner "$OWNER" --format json --jq .id)
gh project field-list "$PROJECT" --owner "$OWNER" --format json --limit 100 \
  > "$RUN_DIR/fields.json"
FIELD_ID=$(jq -r '.fields[] | select(.name == "Status") | .id' "$RUN_DIR/fields.json")
OPTION_ID=$(jq -r --arg column "$READY_COLUMN" '.fields[] | select(.name == "Status")
  | .options[] | select(.name == $column) | .id' "$RUN_DIR/fields.json")
ITEM_ID=$(jq -r --argjson n "$N" '.items[] | select(.content.number == $n) | .id' \
  "$RUN_DIR/board.json")
gh api graphql -f query='mutation($project: ID!, $item: ID!, $field: ID!,
  $option: String!) { updateProjectV2ItemFieldValue(input: { projectId: $project,
  itemId: $item, fieldId: $field, value: { singleSelectOptionId: $option } })
  { projectV2Item { id } } }' \
  -f project="$PROJECT_ID" -f item="$ITEM_ID" -f field="$FIELD_ID" \
  -f option="$OPTION_ID"
```

## Other trackers: check `--help` first

Every non-GitHub tracker runs a `--help` preflight before its first mutation. One that does
not show the expected flag stops before the mutation and reports the gap. The preflight must
also find the CLI's file-or-stdin route for prose, such as a `--body-file`,
`--description-file`, or `--input` equivalent. A CLI that offers none takes its bodies
through a file that the API accepts, never an interpolated argument.

On **Linear**, use the team's Linear CLI or the GraphQL API. Milestones are
`projectMilestone`. Priority `0` means unset rather than urgent. Dependencies are typed issue
relations (`issueRelationCreate`, type `blocks`), and which issue is the relation's source
carries the direction. On **Jira**, set status through a transition rather than by a write
to the field. The REST API (`/rest/api/3/issue/{key}`) is the escape hatch. Jira dependency
links are `/rest/api/3/issueLink`, whose `inwardIssue`/`outwardIssue` pair encodes the
direction.
