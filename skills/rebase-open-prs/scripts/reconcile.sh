#!/usr/bin/env bash
set -euo pipefail

manifest="${1:?usage: reconcile.sh <manifest>}"
[ -f "$manifest" ] || {
  echo "manifest not found: $manifest" >&2
  exit 2
}

echo "Fetching latest remote state…" >&2
git fetch --prune origin >/dev/null 2>&1 ||
  echo "warning: git fetch failed; reporting from local remote-tracking refs" >&2

total=0
rebased_count=0

while IFS=$'\t' read -r pr branch base pre_oid || [ -n "${pr:-}" ]; do
  if [ -z "${pr// /}" ]; then continue; fi
  case "$pr" in \#*) continue ;; esac
  total=$((total + 1))

  ref="refs/remotes/origin/$branch"
  if ! current_oid=$(git rev-parse --verify --quiet "${ref}^{commit}"); then
    echo "PR=$pr BRANCH=$branch CURRENT_OID=missing REBASED=no OID_CHANGED=no TIP_COMMITTED=gone"
    echo "  $branch not found on origin (deleted/merged during the run?)" >&2
    continue
  fi

  base_ref="refs/remotes/origin/$base"
  if ! git rev-parse --verify --quiet "${base_ref}^{commit}" >/dev/null; then
    rebased="base-missing"
    echo "  base $base for $branch not found on origin (deleted/merged stacked base?)" >&2
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
