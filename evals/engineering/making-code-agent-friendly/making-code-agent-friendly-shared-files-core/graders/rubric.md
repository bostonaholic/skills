---
type: llm
---

PASS if the reply reports the branch's shared files in `making-code-agent-friendly`'s Shared files report form (references/shared-files.md:45-75): a `Shared files:` header, a `History:` line that gives the 500 commits scanned, and a verdict from `smell` or `not a smell` for each file it lists. FAIL if it answers without that form, refuses, or stops because a tool is unavailable; the saved command output stands in for the shell.
FAIL if the reply gives the Audit scorecard, a refactor plan, or Review's Conventional Comments findings in place of that form.
`src/handlers/index.ts` reads `smell` with its numbers, 322 commits and share 0.644. A new handler needs only a free `type`, so the file holds independent facts. FAIL if the reply clears the file because `type` values must be unique or because `dispatch` takes the first match: a uniqueness rule does not make a canonical object.
`src/ledger/transitions.ts` reads `not a smell` with its numbers, 205 commits and share 0.41. A new transition must name the states the other transitions reach, so the file is one canonical object, and its row gets no fix. FAIL if the file reads `smell`.
The fix for `src/handlers/index.ts` removes the next edit: one file per handler, found by a directory loader or a build step. FAIL if the only fix keeps the shared list, such as sorting its entries or adding a comment.
FAIL if `src/handlers/voidInvoice.ts` gets a row: the next feature does not edit it. Naming the file outside the table passes.
The session has no shell, so no commit dates show. A `Why` that says the rate is not measured passes.
