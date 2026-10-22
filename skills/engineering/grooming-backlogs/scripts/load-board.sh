#!/usr/bin/env bash
#
# Load a GitHub Projects board and its repository's issues into the run cache,
# in bulk, and derive the one repository the run grooms.
#
#   usage: load-board.sh RUN_DIR PROJECT OWNER [--issue N]
#
#   RUN_DIR   an existing run cache directory
#   PROJECT   the project number
#   OWNER     the project owner's login, or @me
#   --issue N load only issue N (promotion mode). Without it, load every open
#             issue in the repository (board and batch promotion modes)
#
# Requires `gh` (authenticated, with the project scope) and `jq` on PATH.
#
# Files written to RUN_DIR:
#
#   board.json              `gh project item-list` output, every item
#   milestones.json         every milestone, open and closed (board load only)
#   issues.json             an array of issues: every open one, or just N, with
#                           number,title,body,state,labels,milestone,assignees,
#                           createdAt,updatedAt and, when gh accepts them, the
#                           link fields blockedBy,blocking,parent,subIssues
#   comments-<n>.json       each loaded issue's REST comment list
#   original-body-<n>.md    issue N's body (with --issue only)
#   unloaded-links.txt      issue numbers with more links than gh returned
#   unloaded-threads.txt    issue numbers whose comments filled a whole page
#
# Stdout, one "key value" line each, in this order:
#
#   repo <owner>/<name>
#   login <authenticated login>
#   board-items <count>
#   issues <count loaded>
#   links loaded|unavailable
#   unloaded-links <count>
#   unloaded-threads <count>
#
# "links unavailable" means gh rejected the link fields and the issues loaded
# without them: declared links are unknown, never absent.
#
# Exit codes:
#
#   0   loaded
#   1   a gh call failed, returned something that is not JSON, or the load is
#       partial (the board or the open-issue list hit its limit). Never groom
#       a partial board
#   3   a choice is needed: the items span several repositories, or the
#       repository owner differs from OWNER. Stderr lists the repositories
#   4   nothing to load: issue N is not on the board, or no board item belongs
#       to a repository
#   64  usage error
#   69  a required tool is missing

set -euo pipefail

# The skill file that explains each exit code, relative to the skill directory.
# Promotion mode (--issue) documents its exits apart from board mode.
board_doc=references/board-mode.md
promotion_doc=references/promotion-mode.md

# Prints `see <absolute path of the mode's doc>`. It resolves the physical
# path with builtins only, so a symlinked scripts directory or a PATH without
# dirname still names the real file, and a failed resolution never changes the
# exit.
see_doc() {
  local dir=. real doc_file=$board_doc
  if [[ -n ${issue:-} ]]; then doc_file=$promotion_doc; fi
  if [[ ${BASH_SOURCE[0]} == */* ]]; then dir=${BASH_SOURCE[0]%/*}; fi
  real=$(CDPATH='' cd -P -- "$dir" && pwd -P) || real=$dir
  echo "see ${real%/*}/$doc_file" >&2
}

die() {
  local code=$1
  shift
  echo "error: $*" >&2
  see_doc
  exit "$code"
}

usage() {
  echo "usage: $0 RUN_DIR PROJECT OWNER [--issue N]" >&2
  see_doc
  exit 64
}

[[ $# -eq 3 || $# -eq 5 ]] || usage
run_dir=$1
project=$2
owner=$3
issue=""
if [[ $# -eq 5 ]]; then
  [[ $4 == "--issue" ]] || usage
  issue=$5
fi

[[ -d $run_dir ]] || die 64 "RUN_DIR is not a directory: $run_dir"
[[ $project =~ ^[1-9][0-9]*$ ]] || die 64 "PROJECT is not a project number: $project"
[[ $owner == "@me" || $owner =~ ^[A-Za-z0-9][A-Za-z0-9-]*$ ]] || die 64 "OWNER is not a GitHub login: $owner"
[[ -z $issue || $issue =~ ^[1-9][0-9]*$ ]] || die 64 "--issue takes an issue number: $issue"

for tool in gh jq; do
  command -v "$tool" >/dev/null 2>&1 || die 69 "missing required tool: $tool"
done

# A board past this many items is too big to groom in one run; the totalCount
# check below then stops the run instead of grooming part of it.
board_limit=10000
# More open issues than this is too many to verify in one run; a list that
# reaches it may have dropped some, so it stops the run.
issue_limit=1000
# GitHub's REST maximum per page. A full page means the thread was read only in
# part, which is recorded rather than fatal: long threads are ordinary.
comment_page=100

issue_fields=number,title,body,state,labels,milestone,assignees,createdAt,updatedAt
link_fields=blockedBy,blocking,parent,subIssues

fail() {
  echo "error: $*" >&2
  see_doc
  exit 1
}

board="$run_dir/board.json"
gh project item-list "$project" --owner "$owner" --format json \
  --limit "$board_limit" >"$board" || fail "could not list project $project items"
jq -e '.totalCount == (.items | length)' "$board" >/dev/null ||
  fail "board.json is partial or not JSON: loaded fewer items than totalCount"

login=$(gh api user --jq .login) || fail "could not read the authenticated login"
[[ -n $login ]] || fail "gh returned an empty login"
expected_owner=$owner
[[ $owner == "@me" ]] && expected_owner=$login

# The repositories holding the issues this run grooms: every repository item, or
# the items that are issue N.
if [[ -n $issue ]]; then
  repos=$(jq -r --argjson n "$issue" '[.items[] | select(.content.type == "Issue"
    and .content.number == $n) | .content.repository] | unique | .[]' "$board")
  [[ -n $repos ]] || die 4 "issue #$issue is not on project $project"
else
  repos=$(jq -r '[.items[].content.repository // empty] | unique | .[]' "$board")
  [[ -n $repos ]] || die 4 "no item on project $project belongs to a repository"
fi
if [[ $(wc -l <<<"$repos") -gt 1 ]]; then
  echo "error: the items span several repositories; ask which to groom:" >&2
  printf '%s\n' "$repos" >&2
  see_doc
  exit 3
fi
repo=$repos
repo_owner=${repo%%/*}
if [[ $(tr '[:upper:]' '[:lower:]' <<<"$repo_owner") != $(tr '[:upper:]' '[:lower:]' <<<"$expected_owner") ]]; then
  die 3 "repository $repo is not owned by $expected_owner; ask which to groom"
fi
[[ $repo =~ ^[A-Za-z0-9-]+/[A-Za-z0-9._-]+$ ]] || fail "unexpected repository name: $repo"

# Load the issues, retrying once without the link fields, which some hosts reject.
issues="$run_dir/issues.json"
links=loaded
load_issues() {
  if [[ -n $issue ]]; then
    gh issue view "$issue" --repo "$repo" --json "$1" | jq -s . >"$issues"
  else
    gh issue list --repo "$repo" --state open --limit "$issue_limit" --json "$1" >"$issues"
  fi
}
if ! load_issues "$issue_fields,$link_fields"; then
  echo "retrying the issue load without the link fields" >&2
  links=unavailable
  load_issues "$issue_fields" || fail "could not load issues from $repo"
fi
jq -e 'type == "array"' "$issues" >/dev/null || fail "issues.json is not a JSON array"
if [[ -z $issue ]]; then
  jq -e --argjson limit "$issue_limit" 'length < $limit' "$issues" >/dev/null ||
    fail "the open-issue list reached $issue_limit, so it may be partial"
fi

: >"$run_dir/unloaded-links.txt"
if [[ $links == loaded ]]; then
  jq -r '.[] | select(any(.blockedBy, .blocking, .subIssues;
    (.nodes | length) < .totalCount)) | .number' "$issues" >"$run_dir/unloaded-links.txt"
fi

if [[ -z $issue ]]; then
  milestones_raw="$run_dir/milestones.raw"
  gh api --paginate "repos/$repo/milestones?state=all&per_page=100" --jq '.[]' \
    >"$milestones_raw" || fail "could not list milestones for $repo"
  jq -s . "$milestones_raw" >"$run_dir/milestones.json" || fail "milestones are not JSON"
  rm -f "$milestones_raw"
else
  jq -r '.[0].body // ""' "$issues" >"$run_dir/original-body-$issue.md"
fi

: >"$run_dir/unloaded-threads.txt"
for n in $(jq -r '.[].number' "$issues"); do
  comments="$run_dir/comments-$n.json"
  gh api "repos/$repo/issues/$n/comments?per_page=$comment_page" >"$comments" ||
    fail "could not read the comments on #$n"
  count=$(jq 'length' "$comments") || fail "comments on #$n are not JSON"
  ((count < comment_page)) || echo "$n" >>"$run_dir/unloaded-threads.txt"
done

echo "repo $repo"
echo "login $login"
echo "board-items $(jq '.items | length' "$board")"
echo "issues $(jq 'length' "$issues")"
echo "links $links"
echo "unloaded-links $(wc -l <"$run_dir/unloaded-links.txt" | tr -d ' ')"
echo "unloaded-threads $(wc -l <"$run_dir/unloaded-threads.txt" | tr -d ' ')"
