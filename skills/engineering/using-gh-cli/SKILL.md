---
name: using-gh-cli
description: Runs GitHub work through the gh CLI and verifies each result, opening PRs only after reviewing every branch commit. Use when opening a PR, checking CI or failed logs, or handling GitHub issues from a terminal. Merges, closes, reviews, comments, and force operations need an explicit request. Not for landing a PR; use landing-prs.
---

# GitHub CLI

## Iron Law

- No PR creation without reviewing every commit on the branch.
- No operation from the explicit-request list without an explicit user request
  for that operation on that target.
- Verify every gh operation succeeded with its exit status and a read-back.
  Never assume a command worked.

## Preflight

```bash
command -v gh >/dev/null && gh auth status
gh repo view --json nameWithOwner --jq .nameWithOwner
```

If gh is missing or not authenticated, stop and tell the user to install it or
run `gh auth login`. Confirm the printed repository is the intended target
before any write.

## Explicit request only

Run these only when the user asked for that operation on that target. An
approved, green, stale, or finished-looking PR or issue is not a request.

- `gh pr merge`, and never `--admin`, which bypasses branch protection
- `gh pr close`, `gh issue close`
- `gh pr review` with `--approve`, `--request-changes`, or `--comment`
- `gh pr comment`, `gh issue comment`
- `gh issue create`
- any delete (`gh repo delete`, `gh release delete`, and similar)
- any force operation (`git push --force`, `--force-with-lease`)
- any write to a repository the user does not own

## Creating a pull request

Step 3 and failing-log digests run in subagents under the
[step delegation rules](shared/step-delegation.md); the other steps stay
inline.

1. **Resolve the base.** Use the base the user names, else the default branch,
   and refuse to open a PR from the base itself:

   ```bash
   gh repo view --json defaultBranchRef --jq .defaultBranchRef.name
   git branch --show-current
   ```

2. **Gather context.** Fetch first, since the reads compare against
   `origin/<base>`:

   ```bash
   git fetch origin <base>
   ```

   Once it succeeds, step 3 runs the read-only commands in one parallel batch:

   ```bash
   git status
   git log --oneline origin/<base>..HEAD
   git diff origin/<base>...HEAD
   ```

3. **Review every commit.** Understand each change in the diff. Stop and tell
   the user when the branch has "wip" or debug commits, mixes unrelated
   purposes, or adds behavior without tests. Run this step and step 2's reads
   in one read-only `sonnet` subagent given the repository path and
   `origin/<base>`; it returns one line per commit (short SHA, subject,
   purpose) and each of those conditions it finds with `file:line`, or `none`.

4. **Push and create.** Write the body to a file with the file-writing tool
   from the template below (default to adapt: drop `Closes` when there is no
   issue), then pass it by path:

   ```bash
   git push -u origin HEAD
   gh pr create --base <base> --title '<title>' --body-file <body-file>
   ```

   Keep single quotes out of the title.

   ```markdown
   ## Summary

   - <main change and why>
   - <secondary change>

   ## Test plan

   - [ ] <command or check that proves the change>

   Closes #<issue>
   ```

5. **Verify.**

   ```bash
   gh pr view --json url,state,baseRefName,headRefName
   gh pr checks
   ```

   `gh pr checks` exits 0 when all pass, 1 when any fail, and 8 while any are
   pending, which is expected right after creation.

## CI and status

- Failing job logs: `gh run view <run-id> --log-failed`, read by one read-only
  `sonnet` subagent per run that returns each failing job and step with its
  first error lines.
- Mergeability: `gh pr view <n> --json mergeable,mergeStateStatus`.
- To merge on request, call the Skill tool with `landing-prs`. If it is not
  installed, run `gh pr merge <n> --squash` only after `gh pr checks <n>` exits
  0 and `mergeStateStatus` is `CLEAN`.
