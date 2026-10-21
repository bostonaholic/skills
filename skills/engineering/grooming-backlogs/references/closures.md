# Closures

A close is public and hard to undo, so each closure travels its own path from
proposal to verified close.

## Propose

Write the exact evidence comment to `$RUN_DIR/closure-evidence-<n>.md` per
[run file templates](references/templates.md), so the approval covers the exact
text. Enter one plan line per closure citing its verification block. Ask one
question per closure under a sub-heading naming its repository and number:
show the comment body and its absolute path, and name the load-bearing fact.

## Execute

Only against its own answer. Run
`scripts/close-issue.sh "$RUN_DIR" "$OWNER/$REPO" <n> "$RESOLUTION_LABEL"`.

- Exit 0: closed and verified. Check off the plan step.
- Exit 10: skipped, and the reason goes in the report: `closed` (already
  resolved), `body-edited` (the verdict is stale), `status-changed` (it moved
  since the load; hard rule 6), `new-comment` (someone is still talking about
  it, whatever they said).
- Exit 1: stop with the steps it printed as the verified prefix (hard rule
  12). A re-run is safe. On a public repository a user without write access
  can comment but not close, so this is expected there.
- Exit 4 or 64: a missing cache file or an issue off the board; stop and
  report it.
- Exit 69: gh or jq is missing; stop and report it.

Never move the card by hand; board automation lands it in its done column.
