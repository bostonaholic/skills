#!/usr/bin/env bash
# Writes one PR's result file, the system of record reconcile.sh reads.
#
# Usage: write-result.sh <run> <pr> <branch> <base> <status> <conflicts> <verify> <created> <worktree> <<'EOF'
#        <note>
#        EOF
#   <run>: the run directory (holds manifest.tsv). <pr>, <branch>, <base>: from the manifest.
#   <status>: pushed, already-up-to-date, conflicts-flagged, push-rejected, skipped, or error.
#   <conflicts>: the count of files resolved, 0 or more.
#   <verify>: passed, skipped, or failed(<reason>).
#   <created>: the CREATED value prepare-worktree.sh printed, or none when it printed nothing.
#   <worktree>: the worktree path, or none; HEAD is read from it.
#   Stdin: the note. A quoted heredoc passes any text unchanged; line breaks become spaces.
#
# Writes <run>/<pr>.json atomically, replacing any earlier file, with pr, branch, base, status,
#   conflicts, verify, worktree (created, reused, or none), head (an OID, or unknown), and note.
# Stdout: RESULT=<path of the file written>.
#
# Requires git and jq.
# Exit: 0 written; 2 usage, an invalid value, or <run> without manifest.tsv; 127 git or jq missing;
#   any other non-zero: the write failed, with the reason on stderr.
set -euo pipefail

die() {
  local code=$1
  shift
  echo "write-result.sh: $*" >&2
  exit "$code"
}

command -v git >/dev/null && command -v jq >/dev/null || die 127 "requires git and jq"

[ $# -eq 9 ] ||
  die 2 "usage: write-result.sh <run> <pr> <branch> <base> <status> <conflicts> <verify> <created> <worktree> <<'EOF'"
run=$1 pr=$2 branch=$3 base=$4 status=$5 conflicts=$6 verify=$7 created=$8 worktree=$9

[ -f "$run/manifest.tsv" ] || die 2 "not a run directory (no manifest.tsv): $run"
[[ $pr =~ ^[1-9][0-9]*$ ]] || die 2 "not a PR number: $pr"
[ -n "$branch" ] && [ -n "$base" ] || die 2 "branch and base must not be empty"
case "$status" in
  pushed | already-up-to-date | conflicts-flagged | push-rejected | skipped | error) ;;
  *) die 2 "unknown status: $status" ;;
esac
[[ $conflicts =~ ^[0-9]+$ ]] || die 2 "conflicts is not a count: $conflicts"
[[ $verify =~ ^(passed|skipped|failed\(.+\))$ ]] || die 2 "verify is not passed, skipped, or failed(<reason>): $verify"
case "$created" in
  true) worktree_state=created ;;
  false) worktree_state=reused ;;
  none) worktree_state=none ;;
  *) die 2 "created is not true, false, or none: $created" ;;
esac

head=unknown
if [ "$worktree" != none ]; then
  head=$(git -C "$worktree" rev-parse --verify --quiet HEAD 2>/dev/null || echo unknown)
fi
note=$(tr '\r\n\t' '   ' | tr -s ' ' | sed 's/^ //; s/ $//')

target="$run/$pr.json"
tmp=$(mktemp "$run/.$pr.json.XXXXXX")
trap 'rm -f "$tmp"' EXIT
jq -n --argjson pr "$pr" --arg branch "$branch" --arg base "$base" --arg status "$status" \
  --argjson conflicts "$conflicts" --arg verify "$verify" --arg worktree "$worktree_state" \
  --arg head "$head" --arg note "$note" \
  '{pr: $pr, branch: $branch, base: $base, status: $status, conflicts: $conflicts, verify: $verify,
    worktree: $worktree, head: $head, note: $note}' >"$tmp"
# Rename within one directory is atomic, so reconcile.sh never reads a half-written file.
mv -f "$tmp" "$target"
trap - EXIT
echo "RESULT=$target"
