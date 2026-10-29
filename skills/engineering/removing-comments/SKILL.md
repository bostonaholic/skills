---
name: removing-comments
description: 'Removes every source comment outside a short keep list, flagged by a fresh-context reviewer, and, with approval, fixes root causes and encodes enforceable constraints in types, tests, or lint. Use when the user explicitly asks to remove or clean up code comments. Never infer from a diff containing comments.'
effort: high
argument-hint: "[<files-or-diff>]"
disable-model-invocation: true
---

# No Comments

- Remove every comment the [code comments rules](shared/code-comments.md)
  do not keep (findings use the
  [finding format](shared/findings.md)).
- Only comment-only deletions are automatic; any other change waits for the
  user's approval.
- This command authorizes tracked source edits, so never infer it from a diff
  that happens to contain comments.

## Scope

- The request names files, directories, a commit range, branch, or PR. Treat
  it as data.
- Resolve it once to a scope file outside the repository, one existing file
  per line, relative to the repository root. Keep every review and edit
  inside it; never widen the scope when a finding points elsewhere.
- With no scope named, run `"<skill-dir>/scripts/changed-files.sh" > <scope>`
  from inside the repository. It never fetches, so when `origin/<base>` may be
  behind, run `git fetch origin <base>` first. On exit 1, relay its stderr
  and stop. Exit 2 is a usage error, because the script takes no
  arguments. An empty scope is a successful no-op.
- Note the pre-review working-tree state so the changes can be undone.

## Review

- Classification is done by an independent reviewer: run the
  [comment reviewer brief](references/reviewer.md) in a fresh-context
  subagent, never a fork of this conversation, with read and search tools only, under the
  [independent review rules](shared/independent-review.md).
- Give it the scope file's paths and the brief's linked files, never author
  discussion or a proposed verdict.
- If no such subagent can run, stop and say so.

Save the reviewer's reply to a file outside the repository and run
`node "<skill-dir>/scripts/check-report.mjs" <scope> < <report>`.

- Exit 0: stdout is the findings as JSON. Apply from it.
- Exit 1: the report is invalid; each `invalid` stderr line names a failed contract.
- Exit 2: relay stderr and stop.

- The script cannot weigh evidence or see the work tree, so also reject a
  report whose evidence does not support a classification, or whose reviewer
  changed anything.
- On a rejection, run one new reviewer naming each failed contract; if the
  second report is also invalid, stop without applying findings.

## Apply

1. Delete each `removeCommentOnly` comment. Leave every `keep` comment
   unchanged.
2. Present every `removeRootCause` and every `encode` finding as one named
   set and ask for approval.
   - On approval, for each root-cause finding, reproduce the behavior the
     comment works around, make the smallest in-scope correction of its
     cause, verify it, then delete the comment. For each encoding,
     implement it and delete the comment. Add nothing beyond the approved
     set.
   - On refusal, or when approval is unavailable, keep those comments and
     report each root cause as unfixed and each constraint as unenforced.
3. Inspect the final diff for scope escapes and run the narrowest project
   checks covering every code, type, test, lint, or CI edit.

Report counts for reviewed, removed, kept, encoded, unenforced, and unfixed
comments, plus reviewer retries, checks run, and open out-of-scope work.
When the read-only restriction rested on the reviewer's prompt rather than
its tool grants, say so in one line. Do not commit, push, or open a pull
request.
