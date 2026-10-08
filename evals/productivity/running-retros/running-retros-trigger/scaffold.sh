#!/usr/bin/env bash
set -euo pipefail

cat >AGENTS.md <<'EOF_1'
# AGENTS.md

Guidance for coding agents working in acme/api.

## Commands

- Install: `npm ci`
- Check: `npm test` runs the linter and the unit tests. Run it before every push.

## Conventions

- Route handlers live in `src/routes/`, one file per resource.
- Every new endpoint gets a test in `test/routes/`.
- PR descriptions say what changed and why, in that order.
EOF_1

git init -q
git add -A
