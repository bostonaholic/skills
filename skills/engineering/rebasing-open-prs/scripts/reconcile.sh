#!/usr/bin/env bash
# Reports each dispatched PR's remote state and derives its outcome from git and its result file,
# never from completion notifications. Changes nothing but remote-tracking refs; safe to re-run.
#
# Usage: reconcile.sh <run>
#   <run>: the run directory init-run.sh printed. Reads <run>/manifest.tsv (TAB-separated pr,
#   branch, base, pre_oid; blank lines and lines starting with # are ignored) and each PR's result
#   file <run>/<pr>.json, which write-result.sh wrote.
#
# Stdout: first FETCH=ok, or FETCH=failed when `git fetch --prune origin` failed and every line
#   below comes from possibly stale local refs. Then one line per PR, in manifest order:
#   PR=<n> BRANCH=<b> CURRENT_OID=<oid|missing> REBASED=yes|no|base-missing OID_CHANGED=yes|no
#   TIP_COMMITTED=<ISO date|gone|unknown> RESULT=present|missing|invalid STATUS=<status>
#   NEEDS_REVIEW=yes|no
#   STATUS is pushed, already-up-to-date, conflicts-flagged, push-rejected, skipped, error,
#   branch-gone, or needs-review. NEEDS_REVIEW=yes when STATUS=needs-review, or when a failure
#   status from the result file stands although the remote branch moved.
# Stderr: progress and per-branch notes.
#
# Status rules. The result file owns the worker's action and git owns remote truth, so a failure
# status in the file stands even when the branch contains its base (it may have before the run).
# When git contradicts the file, the status is needs-review, never a silent pick.
#   CURRENT_OID=missing: branch-gone (merged or closed during the run).
#   REBASED=base-missing: needs-review (the base is gone, an orphaned stacked PR).
#   File pushed: pushed when REBASED=yes OID_CHANGED=yes, else needs-review.
#   File already-up-to-date: already-up-to-date when REBASED=yes OID_CHANGED=no, else needs-review.
#   File conflicts-flagged, push-rejected, skipped, or error: that status, with NEEDS_REVIEW=yes
#     when OID_CHANGED=yes.
#   File invalid (unreadable, or an unknown status): needs-review.
#   File missing (the worker stopped before persisting), from git alone:
#     REBASED=yes OID_CHANGED=yes: pushed (the push is real). REBASED=yes OID_CHANGED=no:
#     already-up-to-date. REBASED=no OID_CHANGED=yes: needs-review (pushed without containing the
#     base: a stale base, or it advanced after the fetch). REBASED=no OID_CHANGED=no: error.
#
# Requires git and jq.
# Exit: 0 reported, including FETCH=failed; 2 usage or manifest not found; 127 git or jq missing.
set -euo pipefail

command -v git >/dev/null && command -v jq >/dev/null || {
  echo "reconcile.sh: requires git and jq" >&2
  exit 127
}
[ $# -eq 1 ] || {
  echo "usage: reconcile.sh <run>" >&2
  exit 2
}
run=$1
manifest="$run/manifest.tsv"
[ -f "$manifest" ] || {
  echo "reconcile.sh: manifest not found: $manifest" >&2
  exit 2
}

# file_status <result-file>: the file's status, or missing, or invalid.
file_status() {
  local status
  if [ ! -e "$1" ]; then
    echo missing
    return
  fi
  status=$(jq -r '.status // empty' "$1" 2>/dev/null || true)
  case "$status" in
    pushed | already-up-to-date | conflicts-flagged | push-rejected | skipped | error) echo "$status" ;;
    *) echo invalid ;;
  esac
}

# derive <file-status> <rebased> <oid-changed>: prints "<status> <needs-review>".
derive() {
  local file=$1 git_state="$2/$3"
  if [ "$2" = base-missing ]; then
    echo "needs-review yes"
    return
  fi
  case "$file" in
    pushed) [ "$git_state" = yes/yes ] && echo "pushed no" || echo "needs-review yes" ;;
    already-up-to-date) [ "$git_state" = yes/no ] && echo "already-up-to-date no" || echo "needs-review yes" ;;
    invalid) echo "needs-review yes" ;;
    missing)
      case "$git_state" in
        yes/yes) echo "pushed no" ;;
        yes/no) echo "already-up-to-date no" ;;
        no/yes) echo "needs-review yes" ;;
        no/no) echo "error no" ;;
      esac
      ;;
    *) [ "$3" = yes ] && echo "$file yes" || echo "$file no" ;;
  esac
}

echo "Fetching latest remote state..." >&2
if git fetch --prune origin >/dev/null 2>&1; then
  echo "FETCH=ok"
else
  echo "FETCH=failed"
  echo "reconcile.sh: git fetch --prune origin failed; reporting from local remote-tracking refs" >&2
fi

total=0
rebased_count=0

while IFS=$'\t' read -r pr branch base pre_oid || [ -n "${pr:-}" ]; do
  if [ -z "${pr// /}" ]; then continue; fi
  case "$pr" in \#*) continue ;; esac
  total=$((total + 1))

  file=$(file_status "$run/$pr.json")
  case "$file" in missing | invalid) result=$file ;; *) result=present ;; esac

  ref="refs/remotes/origin/$branch"
  if ! current_oid=$(git rev-parse --verify --quiet "${ref}^{commit}"); then
    echo "PR=$pr BRANCH=$branch CURRENT_OID=missing REBASED=no OID_CHANGED=no TIP_COMMITTED=gone RESULT=$result STATUS=branch-gone NEEDS_REVIEW=no"
    echo "  $branch not found on origin (deleted or merged during the run?)" >&2
    continue
  fi

  base_ref="refs/remotes/origin/$base"
  if ! git rev-parse --verify --quiet "${base_ref}^{commit}" >/dev/null; then
    rebased="base-missing"
    echo "  base $base for $branch not found on origin (deleted or merged stacked base?)" >&2
  elif git merge-base --is-ancestor "$base_ref" "$ref"; then
    rebased=yes
    rebased_count=$((rebased_count + 1))
  else
    rebased=no
  fi

  if [ "$current_oid" = "$pre_oid" ]; then oid_changed=no; else oid_changed=yes; fi

  tip_committed=$(git log -1 --format=%cI "$ref" 2>/dev/null || echo unknown)

  read -r status needs_review <<<"$(derive "$file" "$rebased" "$oid_changed")"

  echo "PR=$pr BRANCH=$branch CURRENT_OID=$current_oid REBASED=$rebased OID_CHANGED=$oid_changed TIP_COMMITTED=$tip_committed RESULT=$result STATUS=$status NEEDS_REVIEW=$needs_review"
done <"$manifest"

echo "Reconciled $total branch(es); $rebased_count now contain their base." >&2
