---
name: rebasing-dependabot-prs
argument-hint: "[PR numbers] [--dry-run]"
description: Comments @dependabot rebase on open Dependabot pull requests, all or the given numbers, after the user confirms the list, and reports PRs that need @dependabot recreate instead. Use when the user explicitly asks to rebase or refresh Dependabot PRs. Never infer from stale or conflicting Dependabot PRs.
disable-model-invocation: true
---

# Rebase Dependabots

Ask Dependabot to rebase its open PRs by commenting `@dependabot rebase`. Each
comment is public, and every rebase re-runs that PR's CI.

## Arguments

- **PR numbers** (optional): space-separated. Without them, use every open
  Dependabot PR.
- **--dry-run** (optional): show the plan and stop without commenting.

## Procedure

1. **Preflight.**

   ```bash
   command -v gh >/dev/null && gh auth status
   ```

   If gh is missing or not authenticated, stop and tell the user to install it
   or run `gh auth login`.

2. **Collect PRs.** With PR numbers, refuse any argument that is not all
   digits and use them. Without PR numbers, list them:

   ```bash
   gh pr list --author app/dependabot --state open --limit 200 --json number --jq '.[].number'
   ```

   200 covers any realistic Dependabot backlog in one call. If exactly 200
   come back, warn the user that the list may be truncated. Then read each PR
   (the list query cannot include commits; GitHub rejects that many nodes):

   ```bash
   gh pr view <n> --json number,title,state,author,commits \
     --jq '{number, title, state, author: .author.login, others: [.commits[].authors[].login | select(. != "dependabot[bot]")] | unique}'
   ```

3. **Classify each PR.**
   - `author` is not `app/dependabot`, or `state` is not `OPEN`: **skip**, and
     name the author or state.
   - `others` is non-empty: someone else pushed commits, so Dependabot ignores
     `@dependabot rebase`. **Needs recreate:** report it; `@dependabot recreate`
     discards those commits, so only the user decides to post it.
   - Otherwise: **rebase**.

4. **Confirm.** Show one table (PR, title, action, reason) and say that each
   rebase posts a public comment and re-runs CI. With `--dry-run`, stop here.
   Otherwise wait for a clear go-ahead; it covers only the listed **rebase**
   rows.

5. **Comment** on each approved PR:

   ```bash
   gh pr comment <n> --body "@dependabot rebase"
   ```

   Success prints the comment URL. Record any failure with gh's message and
   continue with the next PR.

6. **Report** every PR from step 3 with its outcome: commented (with URL),
   needs recreate, skipped (with reason), or failed (with gh's message).
