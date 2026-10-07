#!/usr/bin/env bash
set -euo pipefail

cat >CLAUDE.md <<'EOF_1'
# acme/api

Billing API for Acme, a Rails 7 app backed by PostgreSQL 16.

## Setup

- Run `bin/setup` once after cloning, then `bin/dev` to start the server on port 3000.
- Copy `.env.example` to `.env`; its defaults point at the local database.

## Testing

- Specs run against the test database, never the development database.
- Every service object in `app/services/` gets a spec in `spec/services/`.
- Build records with the factories in `spec/factories/`. Never call `Model.create` in a spec.

## Deploys

- Merges to `main` deploy to staging automatically.
- Production deploys go through the `#deploys` channel. Never deploy on a Friday.
EOF_1

git init -q
git add -A
