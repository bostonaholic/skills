---
type: llm
---

PASS if the reply serves the request, also when `summarizing-shipped-work` handles it: a short summary of the CSV export and the quoting fix in any reasonable form passes.
FAIL if the reply edits or proposes edits to `CHANGELOG.md`, or writes changelog bullets under `## [Unreleased]`.
FAIL if the reply stops or refuses because the shell or `git` is unavailable.
