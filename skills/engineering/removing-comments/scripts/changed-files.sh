#!/usr/bin/env bash
# Prints every file the current branch changed, one top-level-relative path per line, sorted:
# commits since the merge base with origin/<base>, staged and unstaged edits, and untracked files
# that git does not ignore. Deleted files are left out, because no comment remains in them: a path
# missing from the work tree is dropped, even when a commit or the index still lists it. Non-ASCII
# paths print as-is, not octal-quoted.
# The base is the current PR's base branch (through gh, when installed), then origin/HEAD, then
# main. The script never fetches: when origin/<base> is behind the remote, the committed changes
# can include commits the base already has, so run `git fetch origin <base>` first.
#   changed-files.sh   exit 0 with the list, which is empty when nothing changed
# Exit 1 names the failure on stderr: no git work tree, no temporary file for gh's stderr, an
# invalid base name, a missing origin/<base>, or a failed git command. Exit 2 on any argument.

set -euo pipefail

# The skill file that explains each exit code, relative to the skill directory.
doc_file=SKILL.md

# The physical scripts directory, resolved with builtins only, so a symlinked
# scripts directory or a PATH without dirname still names the real file, and a
# failed resolution never changes the exit. It is resolved here, before the
# script changes directory, because a relative call path names a different
# directory once the working directory changes.
called_dir=.
if [[ ${BASH_SOURCE[0]} == */* ]]; then called_dir=${BASH_SOURCE[0]%/*}; fi
real_dir=$(CDPATH='' cd -P -- "$called_dir" && pwd -P) || real_dir=$called_dir

# Prints `see <absolute path of doc_file>`.
see_doc() {
  echo "see ${real_dir%/*}/$doc_file" >&2
}

fail() {
  printf 'changed-files.sh: %s\n' "$1" >&2
  see_doc
  exit 1
}

usage() {
  printf 'usage: %s\n' "$0" >&2
  see_doc
  exit 2
}

if [ "$#" -ne 0 ]; then
  usage
fi

TOP="$(git rev-parse --show-toplevel)" || fail "not inside a git work tree"
cd "$TOP"

BASE=""
if command -v gh >/dev/null 2>&1; then
  # gh's stderr goes to a file, apart from stdout, because gh can write to stderr
  # on success (GH_DEBUG, for example), and that text must not become the base.
  gh_err="$(mktemp)" || fail "cannot create a temporary file for gh's stderr"
  trap 'rm -f "$gh_err"' EXIT
  # gh reports a branch with no PR as an error, which is the normal case here;
  # any other gh error reaches stderr, and both fall back to the next base.
  if BASE="$(gh pr view --json baseRefName --jq .baseRefName 2>"$gh_err")"; then
    cat "$gh_err" >&2
  else
    if [[ $(<"$gh_err") != *"no pull requests found"* ]]; then
      cat "$gh_err" >&2
    fi
    BASE=""
  fi
fi
if [ -z "$BASE" ]; then
  BASE="$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null || true)"
  BASE="${BASE#origin/}"
fi
if [ -z "$BASE" ]; then
  BASE=main
fi

git check-ref-format --branch "$BASE" >/dev/null ||
  fail "base branch name '$BASE' is not a valid branch name"
git rev-parse --verify --quiet "refs/remotes/origin/${BASE}" >/dev/null ||
  fail "origin/$BASE does not exist; run 'git fetch origin $BASE' or name the files to review"

COMMITTED="$(git -c core.quotePath=false diff --name-only --diff-filter=d "origin/${BASE}...HEAD")" ||
  fail "cannot diff origin/$BASE...HEAD"
UNSTAGED="$(git -c core.quotePath=false diff --name-only --diff-filter=d)" ||
  fail "cannot list unstaged changes"
STAGED="$(git -c core.quotePath=false diff --cached --name-only --diff-filter=d)" ||
  fail "cannot list staged changes"
UNTRACKED="$(git -c core.quotePath=false ls-files --others --exclude-standard)" ||
  fail "cannot list untracked files"

# A path one source lists can be gone from the work tree, such as a committed or staged file
# deleted since, so print only paths that still exist.
printf '%s\n' "$COMMITTED" "$UNSTAGED" "$STAGED" "$UNTRACKED" | sed '/^$/d' | LC_ALL=C sort -u |
  while IFS= read -r path; do
    if [ -e "$path" ]; then
      printf '%s\n' "$path"
    fi
  done
