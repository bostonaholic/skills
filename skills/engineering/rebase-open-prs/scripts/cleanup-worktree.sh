#!/usr/bin/env bash
set -euo pipefail

worktree_path="${1:?usage: cleanup-worktree.sh <path> <branch> <created>}"
branch="${2:?missing branch}"
created="${3:?missing created flag}"

if [ "$created" != "true" ]; then
  echo "Reused pre-existing worktree at $worktree_path — leaving it in place." >&2
  exit 0
fi

if [ "$(git rev-parse --show-toplevel)" = "$(git -C "$worktree_path" rev-parse --show-toplevel 2>/dev/null)" ]; then
  echo "Run cleanup from the main checkout, not from inside $worktree_path." >&2
  exit 2
fi

git worktree remove --force "$worktree_path" 2>/dev/null || true
git worktree prune >/dev/null 2>&1 || true
git branch -D "$branch" >/dev/null 2>&1 || true

echo "Cleaned up worktree $worktree_path and local branch $branch." >&2
