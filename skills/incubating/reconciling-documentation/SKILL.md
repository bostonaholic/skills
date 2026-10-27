---
name: reconciling-documentation
description: Sweeps a repository's documentation for claims that disagree with its code and tests, decides which side is wrong for each, and fixes it after approval. Use when the user asks to reconcile, audit, or fix documentation that has drifted from the code.
disable-model-invocation: true
metadata:
  internal: true
---

# Reconciling documentation

Tests check the code against what its authors meant. Nothing checks the code against what the docs say. This skill closes that gap for the scope the user names; with none named, the scope is the README, `AGENTS.md`, `CLAUDE.md`, and `docs/`.

Every verdict follows the [docs and code rules](shared/docs-vs-code.md).

1. **List claims.** In each document in scope, record every claim a reader could check: a command, a path, a default, an option, a function's behavior. Skip opinions and plans. Keep each claim's `file:line`.
2. **Check each claim** against the code and the tests. Record the code's `file:line` and the test that pins the behavior, or "no test". Run a documented command only when it is read-only.
3. **Classify each mismatch** as a code bug, a stale doc, or unsettled. For an unsettled one, gather intent evidence before asking: callers that depend on one behavior, the history of both sides (`git log -L`, `git blame`), and any spec or issue. A side someone changed later on purpose usually states the intent.
4. **Present the plan, then stop.** One row per mismatch: claim, doc line, code line, pinning test, verdict, planned fix. Ask the user to approve the plan and to settle each unsettled item. Change nothing before the answer.
5. **Fix the approved rows.**
   - Code bug: write a test that fails on the current code, run it to see it fail, change the code, and run it to see it pass.
   - Stale doc: edit the document only; leave the code and tests as they are.
6. **Verify.** Run the project's full test command once after the last fix. Report each row as fixed, skipped, or still open, with the test command's result.
