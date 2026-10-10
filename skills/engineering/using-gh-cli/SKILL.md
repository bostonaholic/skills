---
name: using-gh-cli
description: Runs GitHub work through the gh CLI and verifies each result. Use when opening a PR, checking CI or failed logs, or handling GitHub issues from a terminal. Merges, closes, reviews, comments, and force operations need an explicit request. Not for landing a PR; use landing-prs.
---

# GitHub CLI

Confirm `gh repo view` names the intended repository before any write, and
verify every write with its exit status and a read-back.

## Explicit request only

Run these only when the user asked for that operation on that target. An
approved, green, stale, or finished-looking PR or issue is not a request.

- `gh pr merge` (never `--admin`), `gh pr close`, `gh issue close`
- `gh pr review` in any mode, `gh pr comment`, `gh issue comment`, `gh issue create`
- any delete, any force push, any write to a repository the user does not own

## Gotchas

- `gh pr create --body` and `--body-file` skip the repository's PR template
  (`.github/pull_request_template.md` or similar). When the repository has
  one, fill in its sections and checkboxes in the body you pass.
- `gh pr checks` exits 8 while any check is pending, which is expected right
  after creation; 1 means a failure.
