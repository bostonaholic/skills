#!/usr/bin/env bash
#
# Print one JSON object per pull request the authenticated gh user merged
# between START and END, inclusive.
#
#   usage: fetch-shipped-prs.sh START END [OWNER...]
#
#   START, END  dates as YYYY-MM-DD, START not after END
#   OWNER       a GitHub user or organization to search within; repeatable.
#               With none, every repository the gh user can see is searched
#
# Requires `gh` (authenticated) and `jq` on PATH.
#
# Writes one compact JSON object per line to stdout, and progress and errors
# to stderr:
#
#   repo               OWNER/REPO
#   number             the PR number
#   merged             the merge date, YYYY-MM-DD (UTC)
#   title              the PR title
#   url                the PR URL
#   issue_links        Linear, Jira, and GitHub issue URLs the body cites
#   title_ticket_keys  ticket keys in the title, such as OPS-123
#   body               the body without HTML comments, whitespace collapsed,
#                      cut to 400 characters
#
# Exit codes:
#
#   0   every chunk was fetched
#   1   a chunk hit the search cap, a search failed, or gh returned something
#       that is not JSON. Lines already printed are a partial result
#   64  usage error: wrong argument count, a malformed date, START after END,
#       or a malformed FETCH_SHIPPED_PRS_RETRY_SECONDS
#   69  a required tool is missing
#
# FETCH_SHIPPED_PRS_RETRY_SECONDS overrides the backoff base (default 60).

set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "usage: $0 START END [OWNER...]   (dates as YYYY-MM-DD)" >&2
  exit 64
fi

for tool in gh jq; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "error: missing required tool: $tool" >&2
    exit 69
  fi
done

start_date=$1
end_date=$2
shift 2

# GitHub search returns at most 1000 results per query, so a query that
# returns that many may have dropped some.
search_cap=1000
# GitHub's guidance for a secondary rate limit with no retry-after header is to
# wait at least one minute. Waits grow by the base each attempt, so four
# attempts wait 1 + 2 + 3 = 6 minutes in all before giving up.
retry_base=${FETCH_SHIPPED_PRS_RETRY_SECONDS:-60}
max_attempts=4
# Enough of a PR body for the summary line and its ticket, small enough that a
# quarter of PRs stays readable in one file.
body_chars=400

if [[ ! $retry_base =~ ^[0-9]+$ ]]; then
  echo "error: FETCH_SHIPPED_PRS_RETRY_SECONDS must be a whole number of seconds" >&2
  exit 64
fi

# Print the date N days after a YYYY-MM-DD date. GNU date first, then BSD.
add_days() {
  date -u -d "$1 + $2 days" +%Y-%m-%d 2>/dev/null ||
    date -u -j -v+"$2"d -f %Y-%m-%d "$1" +%Y-%m-%d 2>/dev/null
}

# A real calendar date in YYYY-MM-DD form. BSD date rolls 2026-02-30 over to
# March, so the date must survive a round trip unchanged.
is_date() {
  [[ $1 =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] && [[ "$(add_days "$1" 0)" == "$1" ]]
}

for date_arg in "$start_date" "$end_date"; do
  if ! is_date "$date_arg"; then
    echo "error: not a YYYY-MM-DD date: $date_arg" >&2
    exit 64
  fi
done
if [[ "$start_date" > "$end_date" ]]; then
  echo "error: START $start_date is after END $end_date" >&2
  exit 64
fi

owner_flags=()
for owner in "$@"; do
  owner_flags+=("--owner=$owner")
done

# gh writes why a search failed to stderr. Keep it to tell a rate limit, worth
# waiting out, from any other failure, which retrying will not fix.
stderr_file=$(mktemp)
trap 'rm -f "$stderr_file"' EXIT

search_prs() {
  local attempt err delay
  for ((attempt = 1; attempt <= max_attempts; attempt++)); do
    if gh search prs "$@" 2>"$stderr_file"; then
      return 0
    fi
    err=$(<"$stderr_file")
    printf '%s\n' "$err" >&2
    if [[ $err != *"rate limit"* ]]; then
      return 1
    fi
    if ((attempt < max_attempts)); then
      delay=$((attempt * retry_base))
      echo "rate limited (attempt $attempt of $max_attempts); retrying in ${delay}s" >&2
      sleep "$delay"
    fi
  done
  return 1
}

# closedAt is the merge time for a merged PR; search results carry no mergedAt.
# An issue-key auto-linker can add a Jira link for every key a PR mentions, so
# a Jira link whose key also has a Linear link is a duplicate of the real
# ticket and is dropped.
to_lines='
  .[] | (.body // "" | gsub("<!--[\\s\\S]*?-->"; "")) as $body | {
    repo: .repository.nameWithOwner,
    number,
    merged: .closedAt[:10],
    title,
    url,
    issue_links: (
      [$body | scan("https://(?:linear\\.app/[^/\\s]+/issue/[A-Z][A-Z0-9]+-[0-9]+|[a-z0-9-]+\\.atlassian\\.net/browse/[A-Z][A-Z0-9]+-[0-9]+|github\\.com/[^/\\s]+/[^/\\s]+/issues/[0-9]+)")]
      | unique
      | ([.[] | select(test("linear\\.app")) | capture("(?<key>[A-Z][A-Z0-9]+-[0-9]+)$").key]) as $linear_keys
      | map(select((test("atlassian\\.net") and (capture("(?<key>[A-Z][A-Z0-9]+-[0-9]+)$").key | IN($linear_keys[]))) | not))
    ),
    title_ticket_keys: ([.title | scan("\\b[A-Z][A-Z0-9]+-[0-9]+\\b")] | unique),
    body: ($body | gsub("\\s+"; " ") | .[:$body_chars])
  }'

# 31-day chunks keep a calendar month in one query, far below the search cap
# for one author; a chunk that still reaches the cap fails below.
chunk_start=$start_date
while [[ ! "$chunk_start" > "$end_date" ]]; do
  if ! chunk_end=$(add_days "$chunk_start" 30); then
    echo "error: could not add 30 days to $chunk_start" >&2
    exit 1
  fi
  [[ "$chunk_end" > "$end_date" ]] && chunk_end=$end_date
  range="$chunk_start..$chunk_end"

  if ! results=$(search_prs --author=@me --merged-at="$range" \
    ${owner_flags[@]+"${owner_flags[@]}"} --limit "$search_cap" \
    --json repository,number,title,closedAt,url,body); then
    echo "error: search for PRs merged $range failed" >&2
    exit 1
  fi

  if ! count=$(jq 'length' <<<"$results" 2>/dev/null); then
    echo "error: gh returned output that is not JSON for $range" >&2
    exit 1
  fi
  if ((count >= search_cap)); then
    echo "error: $range hit the $search_cap-result search cap; narrow the range" >&2
    exit 1
  fi

  jq -c --argjson body_chars "$body_chars" "$to_lines" <<<"$results"

  chunk_start=$(add_days "$chunk_end" 1)
done
