#!/usr/bin/env bash
set -euo pipefail

script="$(cd "$(dirname "$0")/.." && pwd)/skills/rebase-open-prs/scripts/prepare-worktree.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

git init -q --bare "$tmp/origin.git"
git init -q -b main "$tmp/repo"
cd "$tmp/repo"
git -c user.name=test -c user.email=test@example.com commit -q --allow-empty -m init
git remote add origin "$tmp/origin.git"
git push -q origin main:main main:feature/x

assert_stdout() {
  local label=$1 created=$2 out
  out=$("$script" feature/x 2>/dev/null)
  if ! printf '%s\n' "$out" | grep -qvE '^(WORKTREE_PATH|CREATED|BRANCH)=' &&
    [ "$(printf '%s\n' "$out" | wc -l | tr -d ' ')" = 3 ] &&
    printf '%s\n' "$out" | grep -qx "CREATED=$created" &&
    printf '%s\n' "$out" | grep -qx "BRANCH=feature/x"; then
    echo "ok - $label"
  else
    printf 'not ok - %s; stdout was:\n%s\n' "$label" "$out" >&2
    exit 1
  fi
}

assert_stdout "creates worktree; stdout is only KEY=VALUE lines" true
assert_stdout "reuses worktree; stdout is only KEY=VALUE lines" false
