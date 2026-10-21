#!/usr/bin/env bash
#
# Push the rebased branch under its recorded lease, then confirm the remote
# branch is the local branch tip. Run from inside the repository. Takes its
# arguments from prepare-rebase.sh's output.
#
#   usage: publish.sh <branch> <push-remote> <push-branch> <lease>
#
#   <branch>       BRANCH, the local branch to push
#   <push-remote>  PUSH_REMOTE
#   <push-branch>  PUSH_BRANCH, the branch name on <push-remote>
#   <lease>        LEASE: the remote OID recorded before the fetch, or `none`
#
# With an OID, pushes with --force-with-lease=<push-branch>:<lease>, which
# overwrites the remote only while it still holds that OID. With `none`, pushes
# with -u and no force, which git rejects unless it fast-forwards. Never a bare
# --force.
#
# Requires `git` on PATH. Prints `PUSHED=<oid>` on success; git's own push
# output goes to stderr.
#
# Exit codes, each with a reason on stderr:
#
#   0  pushed, and the remote branch is the local branch tip
#   1  git is missing, <branch> does not exist, or ls-remote failed
#   2  wrong argument count, or <lease> is neither an OID nor `none`
#   3  the push failed: the lease was rejected because the remote moved, the
#      push was not a fast-forward, or another push error. git's stderr is
#      passed through. Nothing changed on the remote; do not retry
#   4  the push reported success but the remote branch is not the local tip

set -euo pipefail

die() {
  local code=$1
  shift
  echo "publish: $*" >&2
  exit "$code"
}

if [[ $# -ne 4 ]]; then
  echo "usage: publish.sh <branch> <push-remote> <push-branch> <lease>" >&2
  exit 2
fi
branch=$1 push_remote=$2 push_branch=$3 lease=$4

# 40 hex digits for SHA-1 repositories, 64 for SHA-256.
if [[ $lease != none && ! $lease =~ ^([0-9a-f]{40}|[0-9a-f]{64})$ ]]; then
  die 2 "lease is neither an OID nor none: $lease"
fi

command -v git >/dev/null 2>&1 || die 1 "missing required tool: git"
local_oid=$(git rev-parse --verify --quiet "refs/heads/$branch^{commit}") ||
  die 1 "no local branch: $branch"

if [[ $lease == none ]]; then
  git push -u "$push_remote" "$branch:$push_branch" >&2 ||
    die 3 "push to $push_remote $push_branch failed; stop and report, do not retry"
else
  git push --force-with-lease="$push_branch:$lease" "$push_remote" "$branch:$push_branch" >&2 ||
    die 3 "push to $push_remote $push_branch failed; the remote may have moved since $lease. Stop and report, do not retry"
fi

remote_oid=$(git ls-remote "$push_remote" "refs/heads/$push_branch") ||
  die 1 "git ls-remote $push_remote failed"
remote_oid=${remote_oid%%[[:space:]]*}
[[ $remote_oid == "$local_oid" ]] ||
  die 4 "$push_remote $push_branch is ${remote_oid:-absent}, not the local tip $local_oid"

echo "PUSHED=$local_oid"
