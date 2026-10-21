#!/usr/bin/env bash
#
# Move one issue's card to a Status column, after re-reading the board, and
# verify it landed.
#
#   usage: set-status.sh RUN_DIR PROJECT OWNER REPO N COLUMN [--wip-limit L]
#
#   RUN_DIR       the run cache holding board.json from load-board.sh
#   PROJECT       the project number
#   OWNER         the project owner's login, or @me
#   REPO          the issue's repository, <owner>/<name>
#   N             the issue number
#   COLUMN        the target Status option, such as Ready or Backlog
#   --wip-limit L skip the move when COLUMN already holds L or more cards
#
# Requires `gh` (authenticated, with the project scope) and `jq` on PATH.
#
# Before writing, the board is re-read. The move is skipped when the card's
# Status differs from the one cached in board.json (someone moved it since the
# load), and, with --wip-limit, when COLUMN is already at its limit. A card
# already in COLUMN is left alone, so a re-run is safe.
#
# Stdout, one line:
#
#   moved #N COLUMN
#   already #N COLUMN
#   skipped #N changed-since-load|left-board|wip-limit
#
# Exit codes:
#
#   0   moved and verified, or already in COLUMN
#   1   a gh call failed or returned something that is not JSON, the fresh
#       board is partial, or the Status read back after the write is not COLUMN
#   4   issue N is not on the cached board, or COLUMN is not a Status option
#   10  skipped, per the stdout line
#   64  usage error
#   69  a required tool is missing

set -euo pipefail

usage() {
  echo "usage: $0 RUN_DIR PROJECT OWNER REPO N COLUMN [--wip-limit L]" >&2
  exit 64
}

[[ $# -eq 6 || $# -eq 8 ]] || usage
run_dir=$1 project=$2 owner=$3 repo=$4 n=$5 column=$6
wip_limit=""
if [[ $# -eq 8 ]]; then
  [[ $7 == "--wip-limit" && $8 =~ ^[0-9]+$ ]] || usage
  wip_limit=$8
fi
[[ -f $run_dir/board.json ]] || {
  echo "error: no board.json in $run_dir" >&2
  exit 64
}
[[ $project =~ ^[1-9][0-9]*$ ]] || usage
[[ $owner == "@me" || $owner =~ ^[A-Za-z0-9][A-Za-z0-9-]*$ ]] || usage
[[ $repo =~ ^[A-Za-z0-9-]+/[A-Za-z0-9._-]+$ ]] || usage
[[ $n =~ ^[1-9][0-9]*$ ]] || usage
[[ -n $column && $column != -* ]] || usage

for tool in gh jq; do
  command -v "$tool" >/dev/null 2>&1 || {
    echo "error: missing required tool: $tool" >&2
    exit 69
  }
done

# The same ceiling load-board.sh uses: the fresh read must be complete too.
board_limit=10000
# Above GitHub's cap of 50 fields per project, so one page holds them all.
field_limit=100

fail() {
  echo "error: $*" >&2
  exit 1
}

item_filter='.items[] | select(.content.type == "Issue" and .content.number == $n
  and .content.repository == $repo)'
item_id=$(jq -r --argjson n "$n" --arg repo "$repo" "$item_filter | .id" "$run_dir/board.json")
[[ -n $item_id ]] || {
  echo "error: #$n in $repo is not on the cached board" >&2
  exit 4
}
cached_status=$(jq -r --argjson n "$n" --arg repo "$repo" \
  "$item_filter | .status // \"\"" "$run_dir/board.json")

fresh="$run_dir/board-before-move-$n.json"
gh project item-list "$project" --owner "$owner" --format json \
  --limit "$board_limit" >"$fresh" || fail "could not re-read project $project"
jq -e '.totalCount == (.items | length)' "$fresh" >/dev/null 2>&1 ||
  fail "the fresh board read is partial or not JSON"

if ! jq -e --arg id "$item_id" 'any(.items[]; .id == $id)' "$fresh" >/dev/null; then
  echo "skipped #$n left-board"
  exit 10
fi
fresh_status=$(jq -r --arg id "$item_id" '.items[] | select(.id == $id) | .status // ""' "$fresh")
if [[ $fresh_status == "$column" ]]; then
  echo "already #$n $column"
  exit 0
fi
if [[ $fresh_status != "$cached_status" ]]; then
  echo "skipped #$n changed-since-load"
  exit 10
fi
if [[ -n $wip_limit ]]; then
  in_column=$(jq --arg c "$column" '[.items[] | select(.status == $c)] | length' "$fresh")
  if ((in_column >= wip_limit)); then
    echo "skipped #$n wip-limit"
    exit 10
  fi
fi

project_id=$(gh project view "$project" --owner "$owner" --format json --jq .id) ||
  fail "could not read project $project"
fields="$run_dir/fields.json"
gh project field-list "$project" --owner "$owner" --format json --limit "$field_limit" >"$fields" ||
  fail "could not list project $project fields"
field_id=$(jq -r '.fields[] | select(.name == "Status") | .id' "$fields") ||
  fail "fields.json is not JSON"
option_id=$(jq -r --arg c "$column" '.fields[] | select(.name == "Status")
  | .options[] | select(.name == $c) | .id' "$fields")
[[ -n $field_id && -n $option_id ]] || {
  echo "error: $column is not an option of the Status field" >&2
  exit 4
}

# Every id goes over -f, which sends a string: -F would type an all-digit id as
# a number and fail the String! variable.
gh api graphql -f query='mutation($project: ID!, $item: ID!, $field: ID!,
  $option: String!) { updateProjectV2ItemFieldValue(input: { projectId: $project,
  itemId: $item, fieldId: $field, value: { singleSelectOptionId: $option } })
  { projectV2Item { id } } }' \
  -f project="$project_id" -f item="$item_id" -f field="$field_id" \
  -f option="$option_id" >/dev/null || fail "the Status write for #$n failed"

# A zero exit means the write was accepted, not that it landed: read it back.
landed=$(gh api graphql -f query='query($item: ID!) { node(id: $item) {
  ... on ProjectV2Item { fieldValueByName(name: "Status") {
  ... on ProjectV2ItemFieldSingleSelectValue { name } } } } }' \
  -f item="$item_id" --jq '.data.node.fieldValueByName.name // ""') ||
  fail "could not read #$n's Status back"
[[ $landed == "$column" ]] || fail "#$n's Status reads '$landed' after the write, not '$column'"
echo "moved #$n $column"
