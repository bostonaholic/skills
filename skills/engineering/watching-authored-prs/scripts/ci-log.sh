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
  echo "ci-log.sh: $2" >&2
  see_doc
  exit "$1"
}

# Runners print the failure summary last, and 200 lines hold it without
# flooding the context.
tail_lines=200

if [[ $# -ne 4 ]]; then
  die 2 "usage: ci-log.sh HOST OWNER/REPO JOB_ID OUT_FILE"
fi
host=$1
repo=$2
job=$3
out=$4

# The same host, owner, and repository shapes poll.mjs accepts in a PR URL.
if [[ ! $host =~ ^[A-Za-z0-9.-]{1,253}$ ]]; then
  die 2 "malformed host: $host"
fi
if [[ ! $repo =~ ^[A-Za-z0-9._-]{1,39}/[A-Za-z0-9._-]{1,100}$ ]]; then
  die 2 "malformed OWNER/REPO: $repo"
fi
if [[ ! $job =~ ^[0-9]+$ ]]; then
  die 2 "job id is not all digits: $job"
fi

if ! command -v gh >/dev/null 2>&1; then
  die 127 "gh is not on PATH"
fi

log=$(mktemp)
trap 'rm -f "$log" "$log.tail"' EXIT

if ! gh run view --job "$job" --repo "$host/$repo" --log-failed >"$log"; then
  die 1 "gh run view failed for job $job"
fi
if [[ ! -s $log ]]; then
  die 3 "job $job has no failed-step log"
fi

tail -n "$tail_lines" "$log" >"$log.tail"
mv "$log.tail" "$out"
