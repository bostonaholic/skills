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

usage() {
  echo "usage: file-issue.sh <run-cache> <n>" >&2
  exit 1
}

[[ $# -eq 2 ]] || usage
run_cache=$1
n=$2
[[ -n "$run_cache" && "$n" =~ ^[1-9][0-9]*$ ]] || usage

if ! command -v gh >/dev/null 2>&1; then
  echo "error: missing required tool: gh" >&2
  exit 1
fi

repo_file="$run_cache/repo.txt"
title_file="$run_cache/title-$n.txt"
body_file="$run_cache/issue-$n.md"
for file in "$repo_file" "$title_file" "$body_file"; do
  if [[ ! -s "$file" ]]; then
    echo "error: missing or empty input file: $file" >&2
    exit 1
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
  echo "refusing: the repository must be owner/name" >&2
  exit 2
fi

if [[ -z "$title" ]]; then
  echo "error: the title file holds only newlines: $title_file" >&2
  exit 1
fi

if ! output=$(gh issue create --repo "$repo" --title "$title" --body-file "$body_file"); then
  echo "error: gh issue create failed" >&2
  exit 3
fi

# gh prints the new issue's URL as its last line.
url=$(printf '%s\n' "$output" | grep -E '^https?://[^[:space:]]+/issues/[0-9]+$' | tail -n 1 || true)
if [[ -z "$url" ]]; then
  echo "error: gh issue create printed no issue URL" >&2
  exit 3
fi
echo "url: $url"
