#!/usr/bin/env bash
# Finds or creates the isolated worktree one per-PR agent rebases in.
#
# Usage: prepare-worktree.sh <branch>
#   Run from the target repo's main checkout after `git fetch --prune origin`. This script does not
#   fetch: concurrent agents fetching one repository race on ref locks, and origin/<branch> must stay
#   at the manifest baseline the orchestrator recorded.
#
# Reuse: an existing worktree or local branch for <branch> is reused only when it contains every
# commit on origin/<branch>; a reused worktree must also have no changes and must not be the
# caller's own checkout. Otherwise the script refuses, because rebasing a stale or dirty copy and
# force-pushing it would overwrite the remote's commits or the user's work.
#
# Environment: PR_WORKTREE_ROOT overrides the parent directory for new worktrees
#   (default: <parent of the checkout>/.rebasing-open-prs-worktrees).
#
# Stdout: exactly four KEY=VALUE lines, values unquoted:
#   WORKTREE_PATH=<absolute path>
#   CREATED=true|false         this run added the worktree
#   BRANCH_CREATED=true|false  this run created the local branch
#   BRANCH=<branch>
# Stderr: progress and the reason for any refusal.
#
# Exit: 0 ready; 2 usage; 3 origin/<branch> missing; 4 unsafe to reuse or target path taken;
#   any other non-zero: a git command failed, with git's message on stderr.
set -euo pipefail

die() {
  local code=$1
  shift
  echo "prepare-worktree.sh: $*" >&2
  exit "$code"
}

emit() {
  printf 'WORKTREE_PATH=%s\nCREATED=%s\nBRANCH_CREATED=%s\nBRANCH=%s\n' "$1" "$2" "$3" "$branch"
}

[ $# -eq 1 ] && [ -n "$1" ] || die 2 "usage: prepare-worktree.sh <branch>"
branch=$1
remote_ref="refs/remotes/origin/$branch"

git rev-parse --verify --quiet "$remote_ref^{commit}" >/dev/null ||
  die 3 "origin/$branch not found; run git fetch --prune origin first"

contains_remote() {
  git merge-base --is-ancestor "$remote_ref" "refs/heads/$branch" ||
    die 4 "local $branch lacks commits on origin/$branch; pull it or delete it, then re-run"
}

here=$(git rev-parse --show-toplevel)
existing=$(git worktree list --porcelain | awk -v b="refs/heads/$branch" '
  $1 == "worktree" { p = substr($0, index($0, $2)) }
  $1 == "branch" && $2 == b { print p }
')

if [ -n "$existing" ]; then
  [ -d "$existing" ] || die 4 "worktree $existing is missing; run git worktree prune, then re-run"
  [ "$existing" != "$here" ] ||
    die 4 "$branch is checked out in this checkout ($here); switch it away or rebase it separately"
  [ -z "$(git -C "$existing" status --porcelain)" ] ||
    die 4 "worktree $existing has uncommitted or untracked changes"
  contains_remote
  echo "Reusing worktree for $branch at $existing" >&2
  emit "$existing" false false
  exit 0
fi

# Percent-encode % and / so distinct branch names (a/b, a-b, a%2Fb) never share a directory.
encoded=${branch//[%]/%25}
encoded=${encoded//\//%2F}
worktree_root=${PR_WORKTREE_ROOT:-$(dirname "$here")/.rebasing-open-prs-worktrees}
target="$worktree_root/$encoded"
[ ! -e "$target" ] || die 4 "$target already exists; remove it or set PR_WORKTREE_ROOT"
mkdir -p "$worktree_root"

if git show-ref --verify --quiet "refs/heads/$branch"; then
  contains_remote
  git worktree add "$target" "$branch" >&2
  emit "$target" true false
else
  git worktree add -b "$branch" "$target" "$remote_ref" >&2
  emit "$target" true true
fi
