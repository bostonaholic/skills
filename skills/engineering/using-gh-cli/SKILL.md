---
name: using-gh-cli
description: Runs GitHub work through the gh CLI and verifies each result, opening PRs only after reviewing every branch commit. Use when opening a PR, checking CI or failed logs, or handling GitHub issues from a terminal. Merges, closes, reviews, comments, and force operations need an explicit request. Not for landing a PR; use landing-prs.
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

## Opening a pull request

Before opening a PR, fetch the base and review every commit in
`origin/<base>..HEAD`. Stop and tell the user when the branch has wip or debug
commits, mixes unrelated purposes, or adds behavior without tests. Never open
a PR from the base branch itself.

The ticket reference (`Closes #<n>`, `Fixes #<n>`, `Part of <ref>`) is the
body's first line, above `## Summary`; omit it when there is no ticket. Then
`## Summary` (bullets: change and why) and `## Test plan` (checkboxes). Pass
the body with `--body-file`.

`gh pr checks` exits 8 while any check is pending, which is expected right
after creation; 1 means a failure.

## Landing

To merge on request, call the Skill tool with `landing-prs`. If it is not
installed, run `gh pr merge <n> --squash` only after `gh pr checks <n>` exits
0 and `mergeStateStatus` is `CLEAN`.
