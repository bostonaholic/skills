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

# The skill file that explains each exit code, relative to the skill directory.
doc_file=references/per-pr-procedure.md

# Prints `see <absolute path of doc_file>`. It resolves the physical path with
# builtins only, so a symlinked scripts directory or a PATH without dirname
# still names the real file, and a failed resolution never changes the exit.
see_doc() {
  local dir=. real
  if [[ ${BASH_SOURCE[0]} == */* ]]; then dir=${BASH_SOURCE[0]%/*}; fi
  real=$(CDPATH='' cd -P -- "$dir" && pwd -P) || real=$dir
  echo "see ${real%/*}/$doc_file" >&2
}

fail() {
  echo "cleanup-worktree.sh: $2" >&2
  see_doc
  exit "$1"
}

usage() {
  echo "usage: cleanup-worktree.sh <worktree-path> <branch> <created> <branch-created>" >&2
  see_doc
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
  fail 2 "run from the main checkout, not from inside $worktree_path"
fi

git worktree remove --force "$worktree_path" || fail 1 "could not remove worktree $worktree_path"
echo "Removed worktree $worktree_path." >&2

if [ "$branch_created" = true ]; then
  git branch -D "$branch" >/dev/null || fail 1 "could not delete local branch $branch"
  echo "Deleted local branch $branch." >&2
fi
