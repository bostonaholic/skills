# Make loop

Run these steps for one finding at a time, in rank order. `<id>` is the
finding's `id`. Make steps run one at a time, because they share a working
tree.

1. **Save.** Run `node <skill-dir>/scripts/checkpoint.mjs save <run> <id>`.
   On exit 1, stop the loop before any edit.
2. **Make.** Start one fresh-context subagent with write tools, never a fork
   of this conversation, because its reads and edits must stay out of the
   main context. Without subagents, do this step inline. It runs the brief's
   `## Make` section.
   - Give it the [lane contract](references/lane-contract.md), the whole
     brief, the finding, `scope.paths`, `gaps`, the path of each script the
     brief names under `<skill-dir>/scripts/`, and `<run>`.
   - Save the JSON block of a `complete` return to `<run>/make/<id>.json`.
   - On a crash, a malformed return, or any other status, save nothing, run
     `checkpoint.mjs restore <run> <id>`, and record `deferred` with the
     reason. With no saved return, `restore` keeps no files.
3. **Verify.** Run `node <skill-dir>/scripts/checkpoint.mjs verify <run> <id>`.
   `verify.json`, never the make return, decides what happens next.
   - On exit 3 with a moved HEAD or a changed ref, stop the loop and report
     what moved. The skill never undoes it.
   - On exit 3 with `escaped` paths, run `restore`, and record `proposed`
     with `reason` copied from `problem` in `verify.json`.
   - On exit 1, run `restore`, record `proposed`, and stop the loop.
4. **Record.** For a saved return, copy `artifacts`, `proposedChange`, and
   `checks` into the finding, and record `proposed` with the return's
   `reason`. Set `review` to `not-run` with the reason. Then start the next
   finding.

## Failure paths

- Exit 1 from `restore` stops the loop and names `<run>`. The run never
  continues on an unknown tree.
- `restore` tests HEAD and the refs first, so a moved HEAD or a changed ref
  stops the loop there too. The renderer rejects a moved HEAD, so the reply
  gives the findings inline and names what moved. A changed ref alone still
  renders.
- Each stop marks the later findings `deferred`, and the current finding too
  when it has no outcome. `reason` names the cause and any path left in the
  tree.
