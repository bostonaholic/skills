# Tracker recipes

## Contents

- Issues, milestones, and closures
- Dependency links
- Board column
- Other trackers

## Issues, milestones, and closures

Every prose value travels by file, per [hard rule 2](references/hard-rules.md).
Labels and columns come from the board settings variables. Milestones live on
the repository, not the project:

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
# A new issue: only against a question the user answered explicitly.
gh issue create --repo "$OWNER/$REPO" --title "$NEW_ISSUE_TITLE" \
  --body-file "$RUN_DIR/new-issue-1.md" --label "$NEW_ISSUE_LABEL"
# A comment. `-F body=@<path>` reads the file and `-F body=@-` the same flag's stdin.
gh api --method POST "repos/$OWNER/$REPO/issues/$N/comments" \
  -F body=@"$RUN_DIR/comment-$N.md"
gh issue edit "$N" --repo "$OWNER/$REPO" --add-label "$LABEL"  # additive only
```

An approved closure runs through `scripts/close-issue.sh`, per
[closures](references/closures.md).

## Dependency links

Run `scripts/link-blocked-by.sh "$RUN_DIR" "$OWNER/$REPO" <blocked> <blocker>`
for each approved link, in plan order.

- Exit 0: linked and verified from the blocked issue, or already linked.
- Exit 10: skipped (`closed`, `changed-since-load`, or `would-cycle`); report
  it and draw nothing in its place.
- Exit 4: an endpoint is not on the loaded board; report the blocker with its
  owner, never linked.
- Exit 1: stop (hard rule 12). Exit 64: a self link or a bad number; stop.

Removing a link this run drew takes the blocker's database id (`gh api
"repos/$OWNER/$REPO/issues/$BLOCKER" --jq .id`), never its number:
`gh api --method DELETE "repos/$OWNER/$REPO/issues/$N/dependencies/blocked_by/$BLOCKER_ID"`.
Decomposition is a separate endpoint:
`POST ".../issues/$PARENT/sub_issues" -F sub_issue_id="$CHILD_ID"`.

## Board column

Run
`scripts/set-status.sh "$RUN_DIR" "$PROJECT" "$OWNER" "$OWNER/$REPO" <n> "$COLUMN" [--wip-limit <limit>]`,
with `$READY_COLUMN` and `--wip-limit` for a promotion, and `$BACKLOG_COLUMN`
without it for a displaced card.

- Exit 0: moved and verified, or already there.
- Exit 10: skipped (`changed-since-load`, `left-board`, or `wip-limit`);
  report it.
- Exit 4: the issue is off the board or the column is not a Status option;
  stop and report it.
- Exit 1: stop (hard rule 12).

## Other trackers

Unverified. Before the first mutation, check the CLI's `--help` for the
expected flag and a file or stdin route for prose; stop and report a gap. On
Linear, priority `0` means unset, and the source of a `blocks` relation carries
its direction. On Jira, status changes through a transition, and an issue
link's `inwardIssue`/`outwardIssue` pair carries the direction.
