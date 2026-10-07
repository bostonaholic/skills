#!/usr/bin/env bash
set -euo pipefail

cat >brag-doc.md <<'EOF_1'
# Brag document

Shipped work for review time. Newest month first, one line per change, links at the end.

## 2026

### August 2026

- Operators can now pin a rollout to one region while the others wait. ([deploy-service#771](https://github.acme.invalid/acme/deploy-service/pull/771), [OPS-112](https://linear.app/acme/issue/OPS-112))

### July 2026

- Deploys now pause when a health check fails instead of rolling on to the next region, and the dashboard lists each paused deploy. ([deploy-service#760](https://github.acme.invalid/acme/deploy-service/pull/760), [web-console#1490](https://github.acme.invalid/acme/web-console/pull/1490), [OPS-104](https://linear.app/acme/issue/OPS-104))
EOF_1

git init -q
git add -A
