#!/usr/bin/env bash
set -euo pipefail

mkdir -p skill
cat >skill/SKILL.md <<'EOF_1'
---
name: nudging-stale-prs
description: Finds stale open pull requests and drafts a nudge or close recommendation for each. Use when the user asks which PRs are stale or to nudge stale PRs.
---

# Nudging Stale PRs

1. Run `gh pr list --state open --limit 200` and read the output. Keep the PRs
   whose last update is more than 14 days ago.
2. For each kept PR, run `gh pr view <number> --comments` and count its review
   comments.
3. Read each kept PR's discussion and decide whether to nudge the author or
   recomend closing it.
4. Render a Markdown table of the kept PRs with number, title, age in days, and
   review-comment count, sorted oldest first.
5. For each PR to nudge, write a two-sentence nudge that names what the PR is
   waiting on.
EOF_1

git init -q
git add -A
