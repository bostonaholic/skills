#!/usr/bin/env bash
set -euo pipefail

mkdir -p skill
cat >skill/SKILL.md <<'EOF_1'
---
name: writing-db-migrations
description: Helps with the acme checkout database. Use for any task that touches a database, SQL, Postgres, a table, a query, or data.
---

# Writing Database Migrations

Databases store data in tables made of rows and columns. SQL (Structured Query
Language) is the language used to read and change that data. A migration is a
file that changes the shape of the database, such as adding a table or a column.

Always give migrations clear, descriptive names so other developers can undrestand them.

## Principles

- Write clean, readable code.
- Test your changes before you open a pull request.
- Keep each migration small and focused on one change.
- Ask a teammate to review your migration.
- Build indexes on `orders` with `CREATE INDEX CONCURRENTLY`, outside a transaction block: a plain `CREATE INDEX` blocks every checkout write until the build finishes.

## Checklist

- [ ] The migration has a clear name.
- [ ] The migration is small.
- [ ] The migration was tested.
- [ ] A teammate reviewed it.

## Background

We started writing this skill in 2024 after a long discussion in the platform
channel. Postgres has been around since 1996 and is one of the most popular
databases in the world. It supports many index types, including B-tree, hash,
GiST, SP-GiST, GIN, and BRIN.

## Summary

Remember: write clear, small, tested migrations, and get them reviewed.
EOF_1

git init -q
git add -A
