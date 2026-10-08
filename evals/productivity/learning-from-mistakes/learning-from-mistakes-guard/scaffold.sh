#!/usr/bin/env bash
set -euo pipefail

cat >CLAUDE.md <<'EOF_1'
# acme/api

Billing API for Acme, a Rails 7 app backed by PostgreSQL 16.

## Setup

- Run `bin/setup` once after cloning, then `bin/dev` to start the server on port 3000.
- Copy `.env.example` to `.env`; its defaults point at the local database.

## Git workflow

- Name every branch `<JIRA-KEY>-<topic>`, for example `API-412-cache-ttl`. The server rejects a push of any other branch name.
- Rebase onto `main` before opening a PR. Never merge `main` into a feature branch.

## Deploys

- Merges to `main` deploy to staging automatically.
- Production deploys go through the `#deploys` channel. Never deploy on a Friday.
EOF_1

git init -q
git add -A
