#!/usr/bin/env bash
# Removes what prepare-worktree.sh created for one PR, and nothing else. Never touches the remote.
#
# Usage: cleanup-worktree.sh <worktree-path> <branch> <created> <branch-created>
#   <created> and <branch-created> are the CREATED and BRANCH_CREATED values prepare-worktree.sh
#   printed: true/true, true/false, or false/false. Run from the main checkout, not from inside
#   <worktree-path>.
#   CREATED=false: the worktree was reused; nothing is removed.
#   CREATED=true: the worktree is removed (with --force, since it holds only this run's files).
#   BRANCH_CREATED=true: the local branch is deleted too; a pre-existing local branch is kept.
#
# Exit: 0 removed, or nothing to remove; 1 a removal failed (git's message on stderr);
#   2 usage, or run from inside <worktree-path>.
set -euo pipefail

usage() {
  echo "usage: cleanup-worktree.sh <worktree-path> <branch> <created> <branch-created>" >&2
  exit 2
}

[ $# -eq 4 ] || usage
worktree_path=$1
branch=$2
created=$3
branch_created=$4
case "$created/$branch_created" in
  true/true | true/false | false/false) ;;
  *) usage ;;
esac

if [ "$created" = false ]; then
  echo "Reused worktree at $worktree_path; leaving it in place." >&2
  exit 0
fi

inside=$(git -C "$worktree_path" rev-parse --show-toplevel 2>/dev/null || echo "")
if [ "$(git rev-parse --show-toplevel)" = "$inside" ]; then
  echo "cleanup-worktree.sh: run from the main checkout, not from inside $worktree_path" >&2
  exit 2
fi

git worktree remove --force "$worktree_path" || {
  echo "cleanup-worktree.sh: could not remove worktree $worktree_path" >&2
  exit 1
}
echo "Removed worktree $worktree_path." >&2

if [ "$branch_created" = true ]; then
  git branch -D "$branch" >/dev/null || {
    echo "cleanup-worktree.sh: could not delete local branch $branch" >&2
    exit 1
  }
  echo "Deleted local branch $branch." >&2
fi
