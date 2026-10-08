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

Only against its own answer. Re-read the issue before the comment posts and
cache it as `$RUN_DIR/pre-close-<n>.json`; no pre-image, no close. Skip and
report when, since the load:

- it closed (already resolved);
- its body was edited (the verdict is stale);
- it moved to an in-flight state (hard rule 6);
- any comment landed, whatever it says (someone is still talking about it).

Then post the evidence comment by file, add the resolution label additively,
and close with `--reason "not planned"`, per
[tracker recipes](references/tracker-recipes.md). If the comment landed but the
close failed, stop with the verified prefix (hard rule 12); a re-run matches
the comment by content before re-posting. On a public repository a user
without write access can comment but not close, so this is expected there.

## Verify

Re-query the state, the resolution label, and the evidence comment. Never move
the card by hand; board automation lands it in its done column.
