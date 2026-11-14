#!/usr/bin/env bash
set -euo pipefail

cat >pr-inputs-home.md <<'EOF_1'
## Why

The banner re-rendered on every usage poll, so it flickered while the user typed. The fix debounces the refresh to once every 5 seconds.

## Verification

- `npm test` on 7d2b8e1: passed. The banner tests cover the 80 percent threshold, the dismiss button, and the 5-second debounce.

## Closing line

Closes #42
EOF_1

git init -q
git add -A
