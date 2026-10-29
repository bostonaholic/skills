---
type: llm
---

PASS if the relayed report opens with a `**Verdict: ...**` line whose word is `COMMENT`. The TODO comment and the repeated `// convert minutes to ms` comment must each appear in a `suggestion (non-blocking)` finding with its `file:line`. Each finding must show replacement code, such as a named helper or constant for the conversion, or the line without the TODO. The TODO finding must also say where the work goes: an issue, the PR body, or the commit message (references/code-reviewer.md:55, :119-124). FAIL if any part is missing.
