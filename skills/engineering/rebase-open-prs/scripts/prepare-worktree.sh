#!/usr/bin/env bash
set -euo pipefail

branch="${1:?usage: prepare-worktree.sh <branch>}"

repo_root=$(git rev-parse --show-toplevel)
worktree_root="${PR_WORKTREE_ROOT:-$(dirname "$repo_root")/.pr-rebase-worktrees}"
sanitized=${branch//\//-}
target="$worktree_root/$sanitized"

git fetch --quiet origin || true

existing_worktree=$(git worktree list --porcelain | awk -v b="refs/heads/$branch" '
  $1=="worktree"{p=substr($0, index($0,$2))}
  $1=="branch" && $2==b {print p}
')

if [ -n "$existing_worktree" ]; then
  echo "Reusing existing worktree for '$branch' at $existing_worktree" >&2
  echo "WORKTREE_PATH=$existing_worktree"
  echo "CREATED=false"
  echo "BRANCH=$branch"
  exit 0
fi

mkdir -p "$worktree_root"

if git show-ref --verify --quiet "refs/heads/$branch"; then
  git worktree add "$target" "$branch" >&2
else
  git worktree add -b "$branch" "$target" "origin/$branch" >&2
fi

git -C "$target" branch --set-upstream-to="origin/$branch" "$branch" >/dev/null 2>&1 || true

echo "WORKTREE_PATH=$target"
echo "CREATED=true"
echo "BRANCH=$branch"
