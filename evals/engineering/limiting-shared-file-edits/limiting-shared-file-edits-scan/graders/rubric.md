---
type: llm
---

PASS if the reply runs a repository scan in `limiting-shared-file-edits`'s report form: a `Shared files:` header that names the repository scan, and a `History:` line that reads `not measured` and gives the reason, a history too short to show a pattern. The saved run scanned 23 commits, under the floor of 50. FAIL if it answers without that form, asks for a design or a diff instead of scanning, refuses, or stops because a tool is unavailable; the saved command output stands in for the shell.
The reply prints the `hotFiles` rows as a ranking: `src/handlers/index.ts` with 12 commits and share 0.522, then `src/events/router.ts` with 11 commits and share 0.478. Each row has the verdict `not measured` and no fix.
FAIL if any row reads `smell` or `not a smell`, or if the reply calls either file a smell in prose: a scan on a short history has no evidence of recurrence.
FAIL if the reply ends with the closing line `After these fixes, the next feature edits:`, or names what the next feature edits: a scan omits that line.
