#!/usr/bin/env bash
set -euo pipefail

mkdir -p docs
cat >docs/friction.md <<'EOF_1'
# Known friction

- The integration suite hangs on a Postgres advisory lock after a killed run.
- A fresh checkout needs twelve env vars set by hand before the server boots.
- The CI bundle cache misses on every new branch.
EOF_1

git init -q
git add -A
