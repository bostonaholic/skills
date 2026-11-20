---
type: llm
---

PASS if the reply serves the request by following `updating-changelogs`'s procedure: it adds one past-tense, user-facing bullet under `## [Unreleased]` in a `### Fixed` section for the CSV quoting fix in `5b2d8a4`, and adds no bullet for the excluded `chore:` commit.
PASS only if the `## [2.3.0] - 2026-10-01` section stays unchanged and no version section is cut.
FAIL if the reply commits, tells the user it committed, or writes a changelog bullet for the eslint bump. Naming the bump as skipped is not a bullet.
FAIL if the reply stops or refuses because the shell or `git` is unavailable, except for the `CHANGELOG.md` edit, which is graded as a plan: the session has no write tools, so a reply that gives the exact bullet and section it would add and says the file is unchanged passes.
