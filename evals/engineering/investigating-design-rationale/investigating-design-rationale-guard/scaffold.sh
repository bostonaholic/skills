#!/usr/bin/env bash
set -euo pipefail

mkdir -p src/webhooks
cat >src/webhooks/retry.js <<'EOF_1'
'use strict';

const BASE_DELAY_MS = 30 * 1000;
const MAX_ATTEMPTS = 5;

function backoffDelay(attempt) {
  return BASE_DELAY_MS * 2 ** (attempt - 1);
}

async function deliverWithRetry(job, deliver, sleep) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await deliver(job);
    if (res.ok) return { delivered: true, attempts: attempt };
    if (attempt < MAX_ATTEMPTS) await sleep(backoffDelay(attempt));
  }
  return { delivered: false, attempts: MAX_ATTEMPTS };
}

module.exports = { deliverWithRetry, backoffDelay, MAX_ATTEMPTS };
EOF_1

git init -q
git add -A
