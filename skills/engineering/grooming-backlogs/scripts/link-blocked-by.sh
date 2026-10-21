#!/usr/bin/env bash
#
# Draw one dependency link, BLOCKED is blocked by BLOCKER, from the blocked
# issue, after re-reading both endpoints, and verify its direction.
#
#   usage: link-blocked-by.sh RUN_DIR REPO BLOCKED BLOCKER
#
#   RUN_DIR   the run cache holding board.json and issues.json from load-board.sh
#   REPO      the repository both issues live in, <owner>/<name>
#   BLOCKED   the issue that cannot be finished until BLOCKER lands
#   BLOCKER   the issue it waits on
#
# Requires `gh` (authenticated) and `jq` on PATH.
#
# Both issues must be on the cached board in REPO. The link is skipped when
# either endpoint is closed, either changed since the load (its body differs
# from issues.json, when cached there), or the link would close a
# cycle: BLOCKER is already blocked, directly or through the cached links, by
# BLOCKED. A link already present is left alone, so a re-run is safe.
#
# Stdout, one line:
#
#   linked #BLOCKED blocked-by #BLOCKER
#   already #BLOCKED blocked-by #BLOCKER
#   skipped #BLOCKED blocked-by #BLOCKER closed|changed-since-load|would-cycle
#
# Exit codes:
#
#   0   linked and verified from BLOCKED, or already linked
#   1   a gh call failed or returned something that is not JSON, or the link
#       does not read back from BLOCKED
#   4   BLOCKED or BLOCKER is not on the cached board in REPO
#   10  skipped, per the stdout line
#   64  usage error, including BLOCKED equal to BLOCKER
#   69  a required tool is missing

set -euo pipefail

usage() {
  echo "usage: $0 RUN_DIR REPO BLOCKED BLOCKER" >&2
  exit 64
}

[[ $# -eq 4 ]] || usage
run_dir=$1 repo=$2 blocked=$3 blocker=$4
for file in board.json issues.json; do
  [[ -f $run_dir/$file ]] || {
    echo "error: no $file in $run_dir" >&2
    exit 64
  }
done
[[ $repo =~ ^[A-Za-z0-9-]+/[A-Za-z0-9._-]+$ ]] || usage
[[ $blocked =~ ^[1-9][0-9]*$ && $blocker =~ ^[1-9][0-9]*$ ]] || usage
[[ $blocked != "$blocker" ]] || {
  echo "error: an issue cannot block itself (#$blocked)" >&2
  exit 64
}

for tool in gh jq; do
  command -v "$tool" >/dev/null 2>&1 || {
    echo "error: missing required tool: $tool" >&2
    exit 69
  }
done

fail() {
  echo "error: $*" >&2
  exit 1
}
link="#$blocked blocked-by #$blocker"

# A number taken from tracker text must match the loaded board before it
# reaches a request path.
for n in "$blocked" "$blocker"; do
  jq -e --argjson n "$n" --arg repo "$repo" 'any(.items[]; .content.type == "Issue"
    and .content.number == $n and .content.repository == $repo)' \
    "$run_dir/board.json" >/dev/null || {
    echo "error: #$n in $repo is not on the cached board" >&2
    exit 4
  }
done

fields=state,body,blockedBy
blocked_now=$(gh issue view "$blocked" --repo "$repo" --json "$fields") ||
  fail "could not re-read #$blocked"
blocker_now=$(gh issue view "$blocker" --repo "$repo" --json "$fields") ||
  fail "could not re-read #$blocker"

if jq -e --argjson b "$blocker" 'any(.blockedBy.nodes[]; .number == $b)' \
  <<<"$blocked_now" >/dev/null; then
  echo "already $link"
  exit 0
fi
for pair in "$blocked:$blocked_now" "$blocker:$blocker_now"; do
  n=${pair%%:*} now=${pair#*:}
  state=$(jq -r .state <<<"$now") || fail "#$n's re-read is not JSON"
  if [[ $state != OPEN ]]; then
    echo "skipped $link closed"
    exit 10
  fi
  # The body, not updatedAt: drawing an earlier link in the same plan bumps
  # updatedAt and would skip every later link on that issue.
  if jq -e --argjson n "$n" --argjson now "$now" \
    'any(.[]; .number == $n and .body != $now.body)' "$run_dir/issues.json" >/dev/null; then
    echo "skipped $link changed-since-load"
    exit 10
  fi
done

# Every issue that BLOCKER waits on, transitively, through same-repository
# links: the cached ones, plus BLOCKER's fresh blockedBy.
waits_on=$(jq -c --arg repo "$repo" --argjson start "$blocker" --argjson fresh "$blocker_now" '
  def num: ((.url // "") | capture("/(?<r>[^/]+/[^/]+)/issues/(?<n>[0-9]+)$")) as $m
    | if ($m.r | ascii_downcase) == ($repo | ascii_downcase)
      then $m.n | tonumber else empty end;
  ([.[] | .number as $n
     | ((.blockedBy.nodes // [])[] | num | [$n, .]),
       ((.blocking.nodes // [])[] | num | [., $n])]
   + [($fresh.blockedBy.nodes // [])[] | num | [$start, .]]) as $edges
  | {seen: [$start], frontier: [$start]}
  | until(.frontier == [];
      .seen as $seen
      | ([.frontier[] as $f | $edges[] | select(.[0] == $f) | .[1]] | unique - $seen) as $new
      | .seen += $new | .frontier = $new)
  | .seen' "$run_dir/issues.json") || fail "issues.json is not JSON"
if jq -e --argjson b "$blocked" 'index($b) != null' <<<"$waits_on" >/dev/null; then
  echo "skipped $link would-cycle"
  exit 10
fi

# REST keys dependencies by database id, never the issue number or the GraphQL
# node id on the cached link nodes. Both numbers are integers, so a mix-up
# re-targets the link instead of failing.
blocker_id=$(gh api "repos/$repo/issues/$blocker" --jq .id) ||
  fail "could not resolve #$blocker's database id"
[[ $blocker_id =~ ^[0-9]+$ ]] || fail "#$blocker's database id is not an integer: $blocker_id"

# -F types the value, so issue_id lands as a JSON integer; -f would send a
# string, which the endpoint rejects with 422.
gh api --method POST "repos/$repo/issues/$blocked/dependencies/blocked_by" \
  -F issue_id="$blocker_id" >/dev/null || fail "the link write failed"

gh issue view "$blocked" --repo "$repo" --json blockedBy |
  jq -e --argjson b "$blocker" 'any(.blockedBy.nodes[]; .number == $b)' >/dev/null ||
  fail "the link does not read back from #$blocked"
echo "linked $link"
