#!/usr/bin/env bash
set -euo pipefail

cat >README.md <<'EOF_1'
# How to recieve webhooks

Point your provider at `/webhooks` and set `WEBHOOK_SECRET`.
EOF_1
