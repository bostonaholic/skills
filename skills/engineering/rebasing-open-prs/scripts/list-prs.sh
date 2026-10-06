#!/usr/bin/env bash
# Lists open PRs as JSON, marking which ones this skill may rebase.
#
# Usage: list-prs.sh [--author <login>] [--include-forks] [--skip-drafts] [--limit <n>]
#   --author <login>  only PRs by this author (gh syntax, for example @me)
#   --include-forks   also mark fork PRs rebaseable; their branches usually reject pushes
#   --skip-drafts     mark draft PRs not rebaseable (drafts are included by default)
#   --limit <n>       maximum PRs to fetch (default 200)
#
# Stdout: a JSON array; each item has number, title, headRefName, baseRefName, isDraft,
#   isCrossRepository, author, url, rebaseable, and skipReason (null when rebaseable).
#   A PR whose head or base name has a character outside [A-Za-z0-9._/-] is never rebaseable:
#   agents place branch names in shell commands. A Dependabot PR is never rebaseable: Dependabot
#   stops updating a PR once anyone else pushes to it.
# Stderr: counts, and a warning when the result may be truncated.
#
# Requires gh (authenticated) and jq.
# Exit: 0 listed; 2 usage; 127 gh or jq missing; any other non-zero: gh or jq failed, with its
#   message on stderr.
set -euo pipefail

# 200 open PRs covers nearly any repository in one call; a full page triggers the truncation warning.
limit=200
include_forks=false
skip_drafts=false
author=""

usage() {
  echo "usage: list-prs.sh [--author <login>] [--include-forks] [--skip-drafts] [--limit <n>]" >&2
  exit 2
}

command -v gh >/dev/null && command -v jq >/dev/null || {
  echo "list-prs.sh: requires gh and jq" >&2
  exit 127
}

while [ $# -gt 0 ]; do
  case "$1" in
    --include-forks)
      include_forks=true
      shift
      ;;
    --skip-drafts)
      skip_drafts=true
      shift
      ;;
    --author)
      [ $# -ge 2 ] && [ -n "$2" ] || usage
      author=$2
      shift 2
      ;;
    --limit)
      [ $# -ge 2 ] && [[ $2 =~ ^[1-9][0-9]*$ ]] || usage
      limit=$2
      shift 2
      ;;
    *)
      echo "list-prs.sh: unknown argument: $1" >&2
      usage
      ;;
  esac
done

fields="number,title,headRefName,baseRefName,isDraft,isCrossRepository,author,url"
args=(pr list --state open --limit "$limit" --json "$fields")
if [ -n "$author" ]; then args+=(--author "$author"); fi

raw=$(gh "${args[@]}")

result=$(printf '%s\n' "$raw" | jq \
  --argjson incForks "$include_forks" \
  --argjson skipDrafts "$skip_drafts" '
  def safe: test("^[A-Za-z0-9._/-]+$");
  map(
    (if   .isCrossRepository and ($incForks | not)            then "fork (cannot push to contributor branch)"
     elif .author.login == "app/dependabot"                     then "dependabot (another push stops Dependabot updating it; use /rebasing-dependabot-prs)"
     elif ((.headRefName | safe) and (.baseRefName | safe)) | not then "branch name outside [A-Za-z0-9._/-]"
     elif .isDraft and $skipDrafts                          then "draft (skipped by request)"
     else null end) as $skip
    | .author = (.author.login // .author)
    | . + { rebaseable: ($skip == null), skipReason: $skip }
  )')

total=$(printf '%s\n' "$result" | jq 'length')
ok=$(printf '%s\n' "$result" | jq '[.[] | select(.rebaseable)] | length')
echo "Found $total open PR(s); $ok rebaseable, $((total - ok)) skipped." >&2
if [ "$total" -ge "$limit" ]; then
  echo "warning: got $total PRs, the --limit; more may exist. Re-run with a larger --limit." >&2
fi

printf '%s\n' "$result"
