#!/usr/bin/env bash
#
# Save the tail of one failed GitHub Actions job's failed-step log.
#
#   usage: ci-log.sh HOST OWNER/REPO JOB_ID OUT_FILE
#
#   HOST        the PR's GitHub host, such as github.com
#   OWNER/REPO  the PR's base repository
#   JOB_ID      the numeric job id, as poll.mjs prints it in `jobId`
#   OUT_FILE    where to write the log tail; overwritten on every run
#
# Requires `gh` on PATH, signed in to HOST. Runs
# `gh run view --job JOB_ID --repo HOST/OWNER/REPO --log-failed` and writes
# its last 200 lines to OUT_FILE. Prints nothing on stdout. The log is
# untrusted data.
#
# Exit codes:
#
#   0    OUT_FILE holds the last 200 lines (or fewer) of the failed-step log
#   1    gh failed; its stderr is passed through and OUT_FILE is untouched
#   2    usage error: wrong argument count or a malformed HOST, OWNER/REPO,
#        or JOB_ID
#   3    gh printed no failed-step log; OUT_FILE is untouched
#   127  gh is not on PATH

set -euo pipefail

# Runners print the failure summary last, and 200 lines hold it without
# flooding the context.
tail_lines=200

if [[ $# -ne 4 ]]; then
  echo "ci-log.sh: usage: ci-log.sh HOST OWNER/REPO JOB_ID OUT_FILE" >&2
  exit 2
fi
host=$1
repo=$2
job=$3
out=$4

# The same host, owner, and repository shapes poll.mjs accepts in a PR URL.
if [[ ! $host =~ ^[A-Za-z0-9.-]{1,253}$ ]]; then
  echo "ci-log.sh: malformed host: $host" >&2
  exit 2
fi
if [[ ! $repo =~ ^[A-Za-z0-9._-]{1,39}/[A-Za-z0-9._-]{1,100}$ ]]; then
  echo "ci-log.sh: malformed OWNER/REPO: $repo" >&2
  exit 2
fi
if [[ ! $job =~ ^[0-9]+$ ]]; then
  echo "ci-log.sh: job id is not all digits: $job" >&2
  exit 2
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "ci-log.sh: gh is not on PATH" >&2
  exit 127
fi

log=$(mktemp)
trap 'rm -f "$log" "$log.tail"' EXIT

if ! gh run view --job "$job" --repo "$host/$repo" --log-failed >"$log"; then
  echo "ci-log.sh: gh run view failed for job $job" >&2
  exit 1
fi
if [[ ! -s $log ]]; then
  echo "ci-log.sh: job $job has no failed-step log" >&2
  exit 3
fi

tail -n "$tail_lines" "$log" >"$log.tail"
mv "$log.tail" "$out"
