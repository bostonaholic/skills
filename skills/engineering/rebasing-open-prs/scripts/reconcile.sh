#!/usr/bin/env bash
# Reports each dispatched PR's remote state, so the orchestrator derives outcomes from git rather
# than from completion notifications. Changes nothing but remote-tracking refs; safe to re-run.
#
# Usage: reconcile.sh <manifest>
#   <manifest>: TAB-separated lines of pr, branch, base, pre_oid, written before dispatch. Blank
#   lines and lines starting with # are ignored.
#
# Stdout: first FETCH=ok, or FETCH=failed when `git fetch --prune origin` failed and every line
#   below comes from possibly stale local refs. Then one line per PR:
#   PR=<n> BRANCH=<b> CURRENT_OID=<oid|missing> REBASED=yes|no|base-missing OID_CHANGED=yes|no
#   TIP_COMMITTED=<ISO date|gone|unknown>
# Stderr: progress and per-branch notes.
#
# Exit: 0 reported, including FETCH=failed; 2 usage or manifest not found.
set -euo pipefail

[ $# -eq 1 ] || {
  echo "usage: reconcile.sh <manifest>" >&2
  exit 2
}
manifest=$1
[ -f "$manifest" ] || {
  echo "reconcile.sh: manifest not found: $manifest" >&2
  exit 2
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

  ref="refs/remotes/origin/$branch"
  if ! current_oid=$(git rev-parse --verify --quiet "${ref}^{commit}"); then
    echo "PR=$pr BRANCH=$branch CURRENT_OID=missing REBASED=no OID_CHANGED=no TIP_COMMITTED=gone"
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

  echo "PR=$pr BRANCH=$branch CURRENT_OID=$current_oid REBASED=$rebased OID_CHANGED=$oid_changed TIP_COMMITTED=$tip_committed"
done <"$manifest"

echo "Reconciled $total branch(es); $rebased_count now contain their base." >&2
