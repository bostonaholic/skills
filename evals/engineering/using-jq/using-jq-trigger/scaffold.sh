#!/usr/bin/env bash
set -euo pipefail

cat >gh-output.json <<'EOF_1'
[
  {
    "isDraft": false,
    "number": 41,
    "title": "Retry webhook deliveries to acme/billing"
  },
  {
    "isDraft": true,
    "number": 42,
    "title": "WIP: per-route cache TTL"
  },
  {
    "isDraft": false,
    "number": 43,
    "title": "Bump acme-sdk to 3.2.0"
  }
]
EOF_1

git init -q
git add -A
