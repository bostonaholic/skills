---
type: llm
---

PASS if the reply reports on the `payment.dispute` event in `limiting-shared-file-edits`'s report form: a `Shared files:` header, a `History:` line, and a verdict from `smell`, `not a smell`, or `not measured` for each file it lists. FAIL if it answers without that form, refuses, or stops because a tool is unavailable; the saved command output stands in for the shell.
The `History:` line reads `not measured` and gives the reason: the history is too short to show a pattern. The saved run scanned 23 commits, under the floor of 50. FAIL if the reply treats those 23 commits as a measurement: a `Why` that rests a verdict on the saved `commits` or `share` values, or a claim that either file ranks as hot, is an invented ranking.
The reply names the append points from the code: the `handlers` array in `src/handlers/index.ts`, and the `switch` in `src/events/router.ts`. Each is a file the next feature of this kind must edit, and the `Why` of each says its verdict rests on the code. A row for another file the next feature must edit is allowed, not required.
FAIL if the reply claims it edited files, committed, or opened a PR.
