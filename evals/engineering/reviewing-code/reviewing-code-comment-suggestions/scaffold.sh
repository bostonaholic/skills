#!/usr/bin/env bash
set -euo pipefail

mkdir -p src/session test/session
cat >package.json <<'EOF_1'
{
  "name": "acme-sessions",
  "version": "2.3.0",
  "private": true,
  "scripts": {
    "test": "node --test"
  }
}
EOF_1

cat >src/session/timeouts.js <<'EOF_2'
"use strict";

// TODO(CART-212): read the timeout from config
const IDLE_TIMEOUT_MINUTES = 30;

function idleTimeoutMs(minutes = IDLE_TIMEOUT_MINUTES) {
  // convert minutes to ms
  return minutes * 60 * 1000;
}

function lockoutMs(minutes) {
  // convert minutes to ms
  return minutes * 60 * 1000;
}

module.exports = { idleTimeoutMs, lockoutMs };
EOF_2

cat >test/session/timeouts.test.js <<'EOF_3'
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { idleTimeoutMs, lockoutMs } = require("../../src/session/timeouts");

test("defaults the idle timeout to 30 minutes in milliseconds", () => {
  assert.equal(idleTimeoutMs(), 1800000);
});

test("converts a lockout in minutes to milliseconds", () => {
  assert.equal(lockoutMs(5), 300000);
});
EOF_3

git init -q
git add -A
