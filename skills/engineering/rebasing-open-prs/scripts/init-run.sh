#!/usr/bin/env bash
# Creates a fresh run directory and its manifest for the PRs the user confirmed.
#
# Usage: list-prs.sh [flags] | init-run.sh <pr>...
#   Stdin: the JSON array list-prs.sh prints. <pr>: a confirmed PR number, each given once.
#   Run from the target repo's main checkout after `git fetch --prune origin`. This script does not
#   fetch: pre_oid must be the remote state the run started from.
#   The directory lives under the git common dir, which every worktree shares and none contains, so
#   worktree cleanup never deletes it.
#
# Stdout: RUN=<absolute run directory>. It holds manifest.tsv, one TAB-separated line per kept PR:
#   pr, branch, base, pre_oid (the OID of origin/<branch> now), in argument order.
# Stderr: one "skip PR #<n>: <reason>" line per PR left out: not in the list, not rebaseable, or its
#   branch not on origin.
#
# Requires git and jq.
# Exit: 0 created; 2 usage, a repeated PR, or stdin not a JSON array; 3 every PR was skipped (no
#   directory is left behind); 127 git or jq missing; any other non-zero: git failed, with its
#   message on stderr.
set -euo pipefail

die() {
  local code=$1
  shift
  echo "init-run.sh: $*" >&2
  exit "$code"
}

command -v git >/dev/null && command -v jq >/dev/null || die 127 "requires git and jq"

[ $# -ge 1 ] || die 2 "usage: list-prs.sh | init-run.sh <pr>..."
for n in "$@"; do
  [[ $n =~ ^[1-9][0-9]*$ ]] || die 2 "not a PR number: $n"
done
repeated=$(printf '%s\n' "$@" | sort | uniq -d | tr '\n' ' ')
[ -z "$repeated" ] || die 2 "PR given more than once: $repeated"

prs=$(cat)
printf '%s\n' "$prs" | jq -e 'type == "array"' >/dev/null 2>&1 ||
  die 2 "stdin is not the JSON array list-prs.sh prints"

runs="$(git rev-parse --path-format=absolute --git-common-dir)/rebasing-open-prs"
mkdir -p "$runs"
# A UTC timestamp sorts runs by start time; mktemp's suffix keeps two runs in one second apart.
run=$(mktemp -d "$runs/$(date -u +%Y%m%dT%H%M%SZ).XXXXXX")
trap 'rm -rf "$run"' EXIT
manifest="$run/manifest.tsv"
: >"$manifest"

for n in "$@"; do
  # list-prs.sh marks a PR rebaseable only when its branch names are shell-safe.
  line=$(printf '%s\n' "$prs" | jq -r --argjson n "$n" \
    '.[] | select(.number == $n and .rebaseable == true) | [.headRefName, .baseRefName] | @tsv')
  if [ -z "$line" ]; then
    echo "skip PR #$n: not a rebaseable PR in the list" >&2
    continue
  fi
  IFS=$'\t' read -r branch base <<<"$line"
  # --verify --quiet: a bare rev-parse of a missing ref prints the name back, a non-OID baseline.
  if oid=$(git rev-parse --verify --quiet "refs/remotes/origin/$branch^{commit}"); then
    printf '%s\t%s\t%s\t%s\n' "$n" "$branch" "$base" "$oid" >>"$manifest"
  else
    echo "skip PR #$n: $branch not on origin" >&2
  fi
done

[ -s "$manifest" ] || die 3 "every PR was skipped; no run created"
trap - EXIT
echo "RUN=$run"
