#!/usr/bin/env bash
#
# Poll production until a target commit is on every sampled request, and
# report the result as a bound over the samples.
#
#   usage: deploy-gate.sh --target SHA --baseline SHA [--samples N]
#            [--clean-polls M] [--interval S] [--max-polls P] -- CMD [ARG...]
#
#   --target SHA      the merged commit that must be deployed
#   --baseline SHA    the revision production ran before this deploy
#   --samples N       requests per poll (default 5)
#   --clean-polls M   consecutive polls with every sample on target
#                     (default 3)
#   --interval S      seconds between polls (default 30)
#   --max-polls P     polls before giving up (default 40)
#   CMD [ARG...]      a command that prints the commit sha one request to
#                     production is served by, and exits 0. It runs once per
#                     sample
#
# Run it inside a clone of the service's repository. A sha the clone has not
# seen is fetched from origin before comparing, because an ancestry check
# against an unknown commit reports a false negative.
#
# A sample is on target when TARGET is an ancestor of the sampled sha
# (`git merge-base --is-ancestor`), never when the two are equal: a later
# deploy still carries the change, and a rollback still fails the gate.
#
# Before polling, the gate is tested both ways: it must report off-target for
# BASELINE and on-target for TARGET. A gate that cannot fail is not a gate.
#
# Writes fixed-format lines to stdout, and progress and errors to stderr:
#
#   poll <i> on-target <k>/<n>    one line per poll
#
# then a result:
#
#   deployed samples=<N>          M consecutive clean polls; N = M * samples.
#   No stale instance observed across <N> sampled requests
#                                 the bound, on the line after `deployed`
#   rollout-in-progress on=<k> off=<j>
#                                 the last poll at max polls had k samples on
#                                 target and j off; off=0 means it was clean
#                                 but fewer than M clean polls ran in a row
#   not-deployed                  the last poll at max polls had no sample on
#                                 target
#
# Exit codes:
#
#   0   deployed
#   1   not deployed, or still rolling out, at max polls
#   2   usage error, a missing tool, or not inside a git repository
#   3   a sha cannot be resolved to a commit, even after a fetch
#   4   the self-check failed: TARGET is already in BASELINE, so the gate
#       cannot tell the deploy apart from the revision before it
#   5   CMD failed or printed something other than one sha

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
  local code=$1
  shift
  echo "error: $*" >&2
  see_doc
  exit "$code"
}

usage() {
  echo "usage: $0 --target SHA --baseline SHA [--samples N] [--clean-polls M] [--interval S] [--max-polls P] -- CMD [ARG...]" >&2
  see_doc
  exit 2
}

# One request behind a load balancer describes one instance. Five per poll
# reaches several instances of a small pool in each poll.
samples=5
# Three clean polls in a row means 15 samples. An instance serving a quarter of
# traffic escapes all of them with probability (3/4)^15, about 1%.
clean_polls=3
# Rolling deploys replace an instance every few tens of seconds to minutes, so
# polls 30 seconds apart see the fleet at different moments of the rollout.
interval=30
# 40 polls 30 seconds apart wait 20 minutes, longer than a routine rolling
# deploy. A rollout still mixed after that is worth reporting, not waiting out.
max_polls=40
target=""
baseline=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target | --baseline | --samples | --clean-polls | --interval | --max-polls)
      [[ $# -ge 2 ]] || usage
      case "$1" in
        --target) target=$2 ;;
        --baseline) baseline=$2 ;;
        --samples) samples=$2 ;;
        --clean-polls) clean_polls=$2 ;;
        --interval) interval=$2 ;;
        --max-polls) max_polls=$2 ;;
      esac
      shift 2
      ;;
    --)
      shift
      break
      ;;
    *)
      echo "error: unknown argument: $1" >&2
      usage
      ;;
  esac
done

[[ -n $target && -n $baseline && $# -gt 0 ]] || usage
for pair in "samples:$samples" "clean-polls:$clean_polls" "max-polls:$max_polls"; do
  if [[ ! ${pair#*:} =~ ^[1-9][0-9]*$ ]]; then
    die 2 "--${pair%%:*} must be a positive whole number"
  fi
done
if [[ ! $interval =~ ^[0-9]+$ ]]; then
  die 2 "--interval must be a whole number of seconds"
fi

for tool in git sleep; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    die 2 "missing required tool: $tool"
  fi
done
if ! git rev-parse --git-dir >/dev/null; then
  die 2 "not inside a git repository"
fi

# Print the full commit sha for $1, fetching from origin once if the clone
# has not seen it. Exit 3 when it still does not resolve.
resolve() {
  local full
  if full=$(git rev-parse --quiet --verify "$1^{commit}" 2>/dev/null); then
    echo "$full"
    return
  fi
  echo "fetching origin: $1 is not in this clone" >&2
  git fetch --quiet origin >&2 || true
  if full=$(git rev-parse --quiet --verify "$1^{commit}"); then
    echo "$full"
    return
  fi
  die 3 "cannot resolve $1 to a commit, even after fetching origin"
}

on_target() {
  git merge-base --is-ancestor "$target" "$1"
}

target=$(resolve "$target")
baseline=$(resolve "$baseline")

if on_target "$baseline"; then
  die 4 "self-check failed: target $target is already in baseline $baseline"
fi
if ! on_target "$target"; then
  die 4 "self-check failed: target $target is not an ancestor of itself"
fi
echo "self-check passed: baseline off target, target on target" >&2

# Print the sha one sample reports. Exit 5 on a failed command or output
# that is not one hex sha.
sample() {
  local out
  if ! out=$("$@"); then
    die 5 "sampling command failed: $*"
  fi
  out=$(tr -d '[:space:]' <<<"$out")
  if [[ ! $out =~ ^[0-9a-fA-F]{7,40}$ ]]; then
    die 5 "sampling command printed something other than one sha: $out"
  fi
  echo "$out"
}

clean_in_a_row=0
for ((poll = 1; poll <= max_polls; poll++)); do
  on=0
  off=0
  for ((s = 1; s <= samples; s++)); do
    sha=$(sample "$@")
    sha=$(resolve "$sha")
    if on_target "$sha"; then
      on=$((on + 1))
    else
      off=$((off + 1))
    fi
  done
  echo "poll $poll on-target $on/$samples"

  if ((off == 0)); then
    clean_in_a_row=$((clean_in_a_row + 1))
  else
    clean_in_a_row=0
  fi
  if ((clean_in_a_row >= clean_polls)); then
    n=$((clean_polls * samples))
    echo "deployed samples=$n"
    echo "No stale instance observed across $n sampled requests"
    exit 0
  fi
  if ((poll < max_polls)); then
    sleep "$interval"
  fi
done

if ((on == 0)); then
  echo "not-deployed"
else
  echo "rollout-in-progress on=$on off=$off"
fi
exit 1
