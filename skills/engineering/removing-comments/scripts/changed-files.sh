#!/usr/bin/env bash
# Prints every file the current branch changed, one top-level-relative path per line, sorted:
# commits since the merge base with origin/<base>, staged and unstaged edits, and untracked files
# that git does not ignore. Deleted files are left out, because no comment remains in them.
# The base is the current PR's base branch (through gh, when installed), then origin/HEAD, then
# main. The script never fetches: when origin/<base> is behind the remote, the committed changes
# can include commits the base already has, so run `git fetch origin <base>` first.
#   changed-files.sh   exit 0 with the list, which is empty when nothing changed
# Exit 1 names the failure on stderr: no git work tree, an invalid base name, a missing
# origin/<base>, or a failed git command. Exit 2 on any argument.

set -euo pipefail

fail() {
  printf 'changed-files.sh: %s\n' "$1" >&2
  exit 1
}

if [ "$#" -ne 0 ]; then
  printf 'usage: %s\n' "$0" >&2
  exit 2
fi

TOP="$(git rev-parse --show-toplevel 2>/dev/null)" || fail "not inside a git work tree"
cd "$TOP"

BASE=""
if command -v gh >/dev/null 2>&1; then
  BASE="$(gh pr view --json baseRefName --jq .baseRefName 2>/dev/null || true)"
fi
if [ -z "$BASE" ]; then
  BASE="$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null || true)"
  BASE="${BASE#origin/}"
fi
if [ -z "$BASE" ]; then
  BASE=main
fi

git check-ref-format --branch "$BASE" >/dev/null 2>&1 ||
  fail "base branch name '$BASE' is not a valid branch name"
git rev-parse --verify --quiet "refs/remotes/origin/${BASE}" >/dev/null ||
  fail "origin/$BASE does not exist; run 'git fetch origin $BASE' or name the files to review"

COMMITTED="$(git diff --name-only --diff-filter=d "origin/${BASE}...HEAD")" ||
  fail "cannot diff origin/$BASE...HEAD"
UNSTAGED="$(git diff --name-only --diff-filter=d)" || fail "cannot list unstaged changes"
STAGED="$(git diff --cached --name-only --diff-filter=d)" || fail "cannot list staged changes"
UNTRACKED="$(git ls-files --others --exclude-standard)" || fail "cannot list untracked files"

printf '%s\n' "$COMMITTED" "$UNSTAGED" "$STAGED" "$UNTRACKED" | sed '/^$/d' | LC_ALL=C sort -u
