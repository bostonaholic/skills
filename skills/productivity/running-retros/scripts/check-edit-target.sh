#!/usr/bin/env bash
#
# Decide whether one approved write may land, so its undo stays true: an edit
# only to a tracked, clean file still at its planned pre-image (undone by
# `git restore`), a creation only at a path that does not exist (undone by
# deleting it).
#
#   usage: check-edit-target.sh <repo-root> <path> <blob-id | absent>
#
#   repo-root   `git rev-parse --show-toplevel`
#   path        the target write-target.mjs printed, absolute or repo-relative
#   blob-id     the plan's pre-image from `git hash-object`, for an edit
#   absent      the plan's pre-image for a creation
#
# Requires `git` on PATH.
#
# Prints exactly one line on stdout:
#
#   apply                 every precondition holds
#   skip: untracked       an edit target git does not track
#   skip: dirty           an edit target with uncommitted changes
#   skip: changed         an edit target whose blob differs from the pre-image,
#                         including one that already carries the edit
#   skip: exists          a creation target that already exists
#
# Exit codes:
#
#   0   apply
#   1   usage error, a missing tool, or a git failure, named on stderr
#   3   skip

set -euo pipefail
# In a UTF-8 locale a bracket range such as [a-f] is collation-dependent.
export LC_ALL=C

usage() {
  echo "usage: check-edit-target.sh <repo-root> <path> <blob-id | absent>" >&2
  exit 1
}

[[ $# -eq 3 ]] || usage
repo_root=$1
target=$2
pre_image=$3
[[ -n "$repo_root" && -n "$target" && -n "$pre_image" ]] || usage

# A git blob id is 40 hex characters (SHA-1) or 64 (SHA-256 repositories).
if [[ "$pre_image" != absent && ! "$pre_image" =~ ^([0-9a-f]{40}|[0-9a-f]{64})$ ]]; then
  echo "error: pre-image must be a blob id or 'absent', got '$pre_image'" >&2
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "error: missing required tool: git" >&2
  exit 1
fi

if [[ ! -d "$repo_root" ]]; then
  echo "error: repo root is not a directory: $repo_root" >&2
  exit 1
fi
cd "$repo_root"
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "error: not a git repository: $repo_root" >&2
  exit 1
fi

skip() {
  echo "skip: $1"
  exit 3
}

if [[ "$pre_image" == absent ]]; then
  # -L as well as -e: a dangling symlink still occupies the path.
  if [[ -e "$target" || -L "$target" ]]; then skip exists; fi
  echo apply
  exit 0
fi

git ls-files --error-unmatch -- "$target" >/dev/null 2>&1 || skip untracked
status=$(git status --porcelain -- "$target") || {
  echo "error: git status failed for $target" >&2
  exit 1
}
[[ -z "$status" ]] || skip dirty
blob=$(git hash-object -- "$target") || {
  echo "error: git hash-object failed for $target" >&2
  exit 1
}
[[ "$blob" == "$pre_image" ]] || skip changed
echo apply
