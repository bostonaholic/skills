# Make loop

Run these steps for one finding at a time, in rank order. `<id>` is the
finding's `id`. Make steps run one at a time, because they share a working
tree.

1. **Make.** Start one fresh-context subagent with write tools, never a fork
   of this conversation, because its reads and edits must stay out of the
   main context. Without subagents, do this step inline. It runs the brief's
   `## Make` section.
   - Give it the [lane contract](references/lane-contract.md), the whole
     brief, the finding, `scope.paths`, `gaps`, the path of each script the
     brief names under `<skill-dir>/scripts/`, and `<run>`.
   - Save the JSON block of a `complete` return to `<run>/make/<id>.json`.
   - On a crash, a malformed return, or any other status, save nothing and
     record `deferred` with the reason.
2. **Record.** For a saved return, copy `artifacts`, `proposedChange`, and
   `checks` into the finding, and record `proposed` with the return's
   `reason`. Set `review` to `not-run` with the reason. Then start the next
   finding.
