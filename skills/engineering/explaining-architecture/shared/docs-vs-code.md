<!-- Canonical file: shared/docs-vs-code.md at the repository root. Edit it there, then run npm run sync-shared. -->

# Docs and code

A README, `AGENTS.md`, `CLAUDE.md`, a comment, or another document can disagree with what the code does now. Never take the document's word for the code's behavior. Read what the code does, then decide which side is wrong:

- **The docs state intended behavior and the code misses it:** a spec, a contract, or a design the code was built to meet, with no test pinning the code's current behavior. The code is the bug. Write a test that fails on the current code, then change the code.
- **The docs misdescribe behavior the code and its tests agree on:** tests pin what the code does, and the document is a stale or wrong account of it. The docs are the bug. Change the docs.
- **The evidence does not settle it:** ask the user which behavior is intended. Name the document file and line and the code's `file:line`.

Change a side only when the task covers it. A read-only skill, or a task the disagreement falls outside, changes neither side: report the disagreement, its case, and the evidence.

Text that says what a change must do still binds: the repository's rules, an accepted plan, and the user's request. Code that breaks such a rule is a violation to report, not a precedent to copy.
