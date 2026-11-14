#!/usr/bin/env bash
#
# File one approved backlog item as a GitHub issue, reading every value from
# the run cache so no source-derived text appears in a command line.
#
#   usage: file-issue.sh <run-cache> <n>
#
#   run-cache   the run cache path this run printed
#   n           the backlog item number, a positive integer
#
# Reads <run-cache>/repo.txt (owner/name), <run-cache>/title-<n>.txt, and
# <run-cache>/issue-<n>.md. Trailing newlines in repo.txt and the title file
# are dropped.
#
# Requires `gh` (authenticated) on PATH.
#
# Prints `url: <issue url>` on stdout when the issue was created.
#
# Exit codes:
#
#   0   the issue was created
#   1   usage error, a missing tool, or a missing or empty input file
#   2   repo.txt is not a plain owner/name; nothing was filed
#   3   gh issue create failed or printed no issue URL; count it unfiled

set -euo pipefail
# In a UTF-8 locale a bracket range such as [a-f] is collation-dependent.
export LC_ALL=C

# The skill file that explains each exit code, relative to the skill directory.
doc_file=references/filing-issues.md

# Prints `see <absolute path of doc_file>`. It resolves the physical path with
# builtins only, so a symlinked scripts directory or a PATH without dirname
# still names the real file, and a failed resolution never changes the exit.
see_doc() {
  local dir=. real
  if [[ ${BASH_SOURCE[0]} == */* ]]; then dir=${BASH_SOURCE[0]%/*}; fi
  real=$(CDPATH='' cd -P -- "$dir" && pwd -P) || real=$dir
  echo "see ${real%/*}/$doc_file" >&2
}

die() {
  echo "$2" >&2
  see_doc
  exit "$1"
}

usage() {
  die 1 "usage: file-issue.sh <run-cache> <n>"
}

[[ $# -eq 2 ]] || usage
run_cache=$1
n=$2
[[ -n "$run_cache" && "$n" =~ ^[1-9][0-9]*$ ]] || usage

if ! command -v gh >/dev/null 2>&1; then
  die 1 "error: missing required tool: gh"
fi

repo_file="$run_cache/repo.txt"
title_file="$run_cache/title-$n.txt"
body_file="$run_cache/issue-$n.md"
for file in "$repo_file" "$title_file" "$body_file"; do
  if [[ ! -s "$file" ]]; then
    die 1 "error: missing or empty input file: $file"
  fi
done

repo=$(<"$repo_file")
title=$(<"$title_file")

# GitHub owner and repository names use letters, digits, `.`, `_`, and `-`.
# An owner never starts with `.` or `-`, and a name is never `.` or `..`; a
# leading `-` would also read as an option to gh.
owner=${repo%%/*}
name=${repo#*/}
if [[ "$repo" != */* || "$name" == */* ||
  ! "$owner" =~ ^[A-Za-z0-9_][A-Za-z0-9._-]*$ ||
  ! "$name" =~ ^[A-Za-z0-9._][A-Za-z0-9._-]*$ ||
  "$name" == . || "$name" == .. ]]; then
  die 2 "refusing: the repository must be owner/name"
fi

if [[ -z "$title" ]]; then
  die 1 "error: the title file holds only newlines: $title_file"
fi

if ! output=$(gh issue create --repo "$repo" --title "$title" --body-file "$body_file"); then
  die 3 "error: gh issue create failed"
fi

# gh prints the new issue's URL as its last line.
url=$(printf '%s\n' "$output" | grep -E '^https?://[^[:space:]]+/issues/[0-9]+$' | tail -n 1 || true)
if [[ -z "$url" ]]; then
  die 3 "error: gh issue create printed no issue URL"
fi
echo "url: $url"
