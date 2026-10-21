#!/usr/bin/env bash
#
# Close one approved closure: re-read the issue, post its evidence comment,
# add the resolution label, close it as not planned, and verify all three.
#
#   usage: close-issue.sh RUN_DIR REPO N LABEL
#
#   RUN_DIR   the run cache holding board.json, issues.json, comments-N.json
#             from load-board.sh, and closure-evidence-N.md, the approved text
#   REPO      the issue's repository, <owner>/<name>
#   N         the issue number
#   LABEL     the resolution label, such as duplicate, invalid, or wontfix
#
# Requires `gh` (authenticated) and `jq` on PATH.
#
# The re-read is cached as pre-close-N.json (kept from the first attempt on a
# re-run). The closure is skipped when, since the load, the issue closed, its
# body changed, its board Status changed, or a comment other than the evidence
# comment landed. The evidence comment is matched by content before posting,
# the label is added, never set, and an issue already closed with its evidence
# comment is only verified, so a re-run after a partial failure is safe.
#
# Stdout, one line per step, in this order:
#
#   pre-image <path>
#   comment posted|exists
#   label <LABEL>
#   closed #N|already-closed #N
#   verified #N
#
# or a single `skipped #N closed|body-edited|status-changed|new-comment`.
# On a failure, the lines already printed are the steps that landed.
#
# Exit codes:
#
#   0   closed and verified: state CLOSED as NOT_PLANNED, LABEL and every
#       pre-existing label present, and the evidence comment on the issue
#   1   a gh call failed or returned something that is not JSON, or the
#       verification failed
#   4   issue N is not on the cached board in REPO or not in issues.json
#   10  skipped, per the stdout line
#   64  usage error, including a missing or empty closure-evidence-N.md
#   69  a required tool is missing

set -euo pipefail

usage() {
  echo "usage: $0 RUN_DIR REPO N LABEL" >&2
  exit 64
}

[[ $# -eq 4 ]] || usage
run_dir=$1 repo=$2 n=$3 label=$4
[[ $repo =~ ^[A-Za-z0-9-]+/[A-Za-z0-9._-]+$ ]] || usage
[[ $n =~ ^[1-9][0-9]*$ ]] || usage
[[ -n $label && $label != -* ]] || usage
evidence="$run_dir/closure-evidence-$n.md"
[[ -s $evidence ]] || {
  echo "error: no approved evidence comment at $evidence" >&2
  exit 64
}
for file in board.json issues.json "comments-$n.json"; do
  [[ -f $run_dir/$file ]] || {
    echo "error: no $file in $run_dir" >&2
    exit 64
  }
done

for tool in gh jq; do
  command -v "$tool" >/dev/null 2>&1 || {
    echo "error: missing required tool: $tool" >&2
    exit 69
  }
done

# GitHub's REST maximum per page, so the paginated reads make the fewest calls.
comment_page=100

fail() {
  echo "error: $*" >&2
  exit 1
}

item=$(jq -c --argjson n "$n" --arg repo "$repo" '.items[] | select(.content.type == "Issue"
  and .content.number == $n and .content.repository == $repo)' "$run_dir/board.json")
cached=$(jq -c --argjson n "$n" '.[] | select(.number == $n)' "$run_dir/issues.json")
[[ -n $item && -n $cached ]] || {
  echo "error: #$n in $repo is not on the cached board or not in issues.json" >&2
  exit 4
}

fresh=$(gh issue view "$n" --repo "$repo" --json state,stateReason,body,labels,updatedAt) ||
  fail "could not re-read #$n"
pre_image="$run_dir/pre-close-$n.json"
[[ -f $pre_image ]] || printf '%s\n' "$fresh" >"$pre_image"
echo "pre-image $pre_image"

# Every comment, all pages: one past the first page still counts as landed.
read_comments() {
  gh api --paginate "repos/$repo/issues/$n/comments?per_page=$comment_page" --jq '.[]' |
    jq -s .
}
comments=$(read_comments) || fail "could not re-read #$n's comments"
# Comments that were not in the cache and are not the evidence comment.
match='(.body | rtrimstr("\n")) == ($evidence | rtrimstr("\n"))'
posted=$(jq --rawfile evidence "$evidence" "any(.[]; $match)" <<<"$comments") ||
  fail "#$n's comments are not JSON"
new_comments=$(jq --rawfile evidence "$evidence" --slurpfile old "$run_dir/comments-$n.json" \
  "[.[] | select(.id as \$id | (\$old[0] | map(.id) | index(\$id)) == null)
    | select(($match) | not)] | length" <<<"$comments")

state=$(jq -r .state <<<"$fresh")
if [[ $state == CLOSED && $posted != true ]]; then
  echo "skipped #$n closed"
  exit 10
fi
if [[ $state != CLOSED ]]; then
  if [[ $(jq -r .body <<<"$fresh") != "$(jq -r .body <<<"$cached")" ]]; then
    echo "skipped #$n body-edited"
    exit 10
  fi
  item_id=$(jq -r .id <<<"$item")
  status_now=$(gh api graphql -f query='query($item: ID!) { node(id: $item) {
    ... on ProjectV2Item { fieldValueByName(name: "Status") {
    ... on ProjectV2ItemFieldSingleSelectValue { name } } } } }' \
    -f item="$item_id" --jq '.data.node.fieldValueByName.name // ""') ||
    fail "could not re-read #$n's board Status"
  if [[ $status_now != "$(jq -r '.status // ""' <<<"$item")" ]]; then
    echo "skipped #$n status-changed"
    exit 10
  fi
  if ((new_comments > 0)); then
    echo "skipped #$n new-comment"
    exit 10
  fi
fi

if [[ $posted == true ]]; then
  echo "comment exists"
else
  gh api --method POST "repos/$repo/issues/$n/comments" -F body=@"$evidence" >/dev/null ||
    fail "could not post the evidence comment on #$n"
  echo "comment posted"
fi

gh issue edit "$n" --repo "$repo" --add-label "$label" >/dev/null ||
  fail "could not add label $label to #$n"
echo "label $label"

if [[ $state == CLOSED ]]; then
  echo "already-closed #$n"
else
  # "not planned", never "completed": the premise died, no work was delivered.
  gh issue close "$n" --repo "$repo" --reason "not planned" >/dev/null ||
    fail "could not close #$n"
  echo "closed #$n"
fi

after=$(gh issue view "$n" --repo "$repo" --json state,stateReason,labels) ||
  fail "could not re-read #$n after closing"
jq -e --arg label "$label" --slurpfile pre "$pre_image" '.state == "CLOSED"
  and .stateReason == "NOT_PLANNED"
  and ([.labels[].name] as $now | ($pre[0].labels | map(.name)) + [$label]
    | all(. as $l | $now | index($l) != null))' <<<"$after" >/dev/null ||
  fail "#$n is not closed as not planned with its labels intact"
comments=$(read_comments) || fail "could not re-read #$n's comments after closing"
jq -e --rawfile evidence "$evidence" "any(.[]; $match)" <<<"$comments" >/dev/null ||
  fail "the evidence comment is not on #$n"
echo "verified #$n"
