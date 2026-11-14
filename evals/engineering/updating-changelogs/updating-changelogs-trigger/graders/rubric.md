---
type: llm
---

PASS if the reply serves the request by following `updating-changelogs`'s procedure: it adds one past-tense, user-facing bullet under `## [Unreleased]` in a `### Fixed` section for the CSV quoting fix in `5b2d8a4`, and adds no bullet for the excluded `chore:` commit.
PASS only if the `## [2.3.0] - 2026-10-01` section stays unchanged and no version section is cut.
FAIL if the reply commits, tells the user it committed, or describes the eslint bump.
FAIL if the reply stops or refuses because the shell or `git` is unavailable.
