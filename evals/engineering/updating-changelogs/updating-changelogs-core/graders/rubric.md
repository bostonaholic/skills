---
type: llm
---

PASS if the reply reports that `## [Unreleased]` already covers both included commits, the cache expiry under Added and the monotonic clock under Fixed, so it adds no bullet. It skips the excluded `chore:` commit.
PASS only if the reply edits no file, creates no file, and makes no commit.
FAIL if the reply adds a bullet, rewrites an existing bullet, cuts a version section, creates a file, commits, or tells the user to commit a changelog change that did not happen.
FAIL if the reply stops or refuses because a shell command is unavailable.
