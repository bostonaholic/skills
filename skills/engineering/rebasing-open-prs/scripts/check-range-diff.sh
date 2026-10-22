#!/usr/bin/env bash
# Proves a rebase dropped no PR commit and added none, before the push.
#
# Usage: check-range-diff.sh <worktree> <base> <pre_oid>
#   <worktree>: the rebased worktree. <base>: the PR's base branch (compared as origin/<base>).
#   <pre_oid>: the branch's OID before the rebase, from the manifest.
#   Pairs old and new commits with `git range-diff origin/<base> <pre_oid> HEAD`. An old commit with
#   no new partner is accepted only when `git cherry` finds its patch already in origin/<base>, the
#   same test rebase uses to skip a previously applied commit.
#
# Stdout: one line per unpaired commit, in range-diff order, nothing when all pair:
#   UPSTREAM <oid> <subject>  old commit whose patch is already in the base (accepted)
#   DROPPED <oid> <subject>   old commit missing from the rebase: PR work was lost
#   NEW <oid> <subject>       new commit with no old partner
#
# Exit: 0 every commit paired or already upstream; 3 a commit was dropped; 4 a new commit appeared
#   (wins over 3); 2 usage, or a ref that does not resolve; any other non-zero: git failed, with
#   its message on stderr.
set -euo pipefail

# The skill file that explains each exit code, relative to the skill directory.
doc_file=references/per-pr-procedure.md

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
  echo "check-range-diff.sh: $*" >&2
  see_doc
  exit "$code"
}

[ $# -eq 3 ] || die 2 "usage: check-range-diff.sh <worktree> <base> <pre_oid>"
worktree=$1
base_ref="refs/remotes/origin/$2"
pre_oid=$3
git -C "$worktree" rev-parse --verify --quiet "$base_ref^{commit}" >/dev/null ||
  die 2 "origin/$2 not found in $worktree"
git -C "$worktree" rev-parse --verify --quiet "$pre_oid^{commit}" >/dev/null ||
  die 2 "pre_oid $pre_oid is not a commit"

# `git cherry` marks with "-" each commit whose patch already exists upstream.
upstream=$(git -C "$worktree" cherry "$base_ref" "$pre_oid" | sed -n 's/^- //p')
pairs=$(git -C "$worktree" range-diff --no-color --no-patch "$base_ref" "$pre_oid" HEAD)

# A --no-patch range-diff line: "<n|->:  <oid|---> <=|!|<|>> <n|->:  <oid|---> <subject>".
re='^ *([0-9]+|-): +([0-9a-f]+|-+) ([<>=!]) +([0-9]+|-): +([0-9a-f]+|-+) (.*)$'
dropped=0
added=0
while IFS= read -r line; do
  [ -n "$line" ] || continue
  [[ $line =~ $re ]] || die 1 "unexpected range-diff line: $line"
  old=${BASH_REMATCH[2]} mark=${BASH_REMATCH[3]} new=${BASH_REMATCH[5]} subject=${BASH_REMATCH[6]}
  case "$mark" in
    '<')
      full=$(git -C "$worktree" rev-parse "$old^{commit}")
      if printf '%s\n' "$upstream" | grep -qx "$full"; then
        echo "UPSTREAM $full $subject"
      else
        echo "DROPPED $full $subject"
        dropped=$((dropped + 1))
      fi
      ;;
    '>')
      echo "NEW $(git -C "$worktree" rev-parse "$new^{commit}") $subject"
      added=$((added + 1))
      ;;
  esac
done <<<"$pairs"

if [ "$added" -gt 0 ]; then exit 4; fi
if [ "$dropped" -gt 0 ]; then exit 3; fi
