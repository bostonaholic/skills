#!/usr/bin/env bash
set -euo pipefail

cat >CLAUDE.md <<'EOF_1'
# acme/api

Billing API for Acme, a Rails 7 app backed by PostgreSQL 16.

## Setup

- Run `bin/setup` once after cloning, then `bin/dev` to start the server on port 3000.

## Testing

- Specs run against the test database through `bin/test`.

## Deploys

- Deploy with the `deploying-api` skill in `.claude/skills/deploying-api/`.
EOF_1

mkdir -p .claude/skills/deploying-api
cat >.claude/skills/deploying-api/SKILL.md <<'EOF_2'
---
name: deploying-api
description: Deploys acme/api to production. Use when the user asks to deploy, ship, or release the API.
---

# Deploying the API

1. Confirm `main` is green in CI.
2. Run `bin/deploy staging` and wait for it to report `deployed`.
3. Run `bin/deploy production` and wait for it to report `deployed`.
4. Post the deployed SHA in `#deploys`.
EOF_2

git init -q
git add -A
