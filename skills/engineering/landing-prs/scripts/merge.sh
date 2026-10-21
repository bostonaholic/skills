#!/usr/bin/env bash
# Squash-merges a PR only if its head is still the commit the CI gate passed,
# with the current title plus " (#<n>)" as the commit subject, then confirms
# the merge.
#
# Usage: merge.sh <pr-url> <head-oid>
#   <pr-url>    https://<host>/<owner>/<repo>/pull/<n>
#   <head-oid>  the HEAD the CI gate printed, 40 hex characters
#
# Never passes --admin or any other bypass. A PR already merged is reported
# as merged without a second merge call, so a rerun is safe.
#
# Requires gh (authenticated).
#
# Stdout, on exit 0 only: MERGED=<merge commit oid>
#
# Exit codes, each with its reason on stderr:
#   0    merged and confirmed
#   1    a gh read failed; its message is on stderr
#   2    usage: wrong argument count, a malformed URL, or a malformed oid
#   3    the head moved after the gate; nothing was merged
#   4    GitHub rejected the merge, for example branch protection or a
#        closed PR; gh's message is on stderr
#   5    the merge call succeeded but the PR is not MERGED with a merge
#        commit, for example it joined a merge queue or got auto-merge
#   127  gh is missing
set -euo pipefail

# The skill file that explains each exit code, relative to the skill directory.
doc_file=SKILL.md

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
  echo "merge.sh: $2" >&2
  see_doc
  exit "$1"
}

url_pattern='^https://[^/]+/[^/]+/[^/]+/pull/([0-9]+)$'
oid_pattern='^[0-9a-f]{40}$'
if [ $# -ne 2 ] || [[ ! $1 =~ $url_pattern ]] || [[ ! $2 =~ $oid_pattern ]]; then
  die 2 "usage: merge.sh https://<host>/<owner>/<repo>/pull/<n> <head-oid>"
fi
url=$1 head_oid=$2
[[ $url =~ $url_pattern ]] && pr=${BASH_REMATCH[1]}

command -v gh >/dev/null 2>&1 || die 127 "missing required tool: gh"

# Prints "<state> <merge commit oid or empty>".
merge_state() {
  gh pr view "$url" --json state,mergeCommit --jq '.state + " " + (.mergeCommit.oid // "")'
}

state=$(merge_state) || die 1 "could not read PR #$pr"
if [ "${state%% *}" = MERGED ] && [ -n "${state#* }" ]; then
  echo "MERGED=${state#* }"
  exit 0
fi

# Re-read the title: a pre-merge step may have changed it. An explicit
# --subject gets no automatic (#<n>) suffix, so add it here.
title=$(gh pr view "$url" --json title --jq .title) || die 1 "could not read PR #$pr's title"

if ! gh pr merge "$url" --squash --match-head-commit "$head_oid" --subject "$title (#$pr)"; then
  # Compare the head itself rather than match gh's error wording.
  now=$(gh pr view "$url" --json headRefOid --jq .headRefOid) || die 1 "could not read PR #$pr's head"
  if [ "$now" != "$head_oid" ]; then
    die 3 "PR #$pr's head moved after the CI gate ($head_oid -> $now); nothing was merged"
  fi
  die 4 "GitHub rejected the merge of PR #$pr"
fi

state=$(merge_state) || die 1 "could not read PR #$pr after the merge"
if [ "${state%% *}" != MERGED ] || [ -z "${state#* }" ]; then
  die 5 "PR #$pr is ${state%% *}, not merged yet; a merge queue or auto-merge may hold it"
fi
echo "MERGED=${state#* }"
