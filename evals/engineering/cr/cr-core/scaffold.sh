#!/usr/bin/env bash
set -euo pipefail

mkdir -p src/cart test/cart
cat >package.json <<'EOF_1'
{
  "name": "acme-checkout",
  "version": "1.8.0",
  "private": true,
  "scripts": {
    "test": "node --test"
  }
}
EOF_1

cat >src/cart/format.js <<'EOF_2'
"use strict";

function formatCents(cents) {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, "0");
  return `${sign}$${dollars}.${rest}`;
}

module.exports = { formatCents };
EOF_2

cat >test/cart/format.test.js <<'EOF_3'
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { formatCents } = require("../../src/cart/format");

test("formats whole and fractional dollars", () => {
  assert.equal(formatCents(1234), "$12.34");
  assert.equal(formatCents(5), "$0.05");
});

test("keeps the sign of a refund", () => {
  assert.equal(formatCents(-250), "-$2.50");
});
EOF_3

git init -q -b main --object-format=sha1
git -c core.autocrlf=false add -- package.json
GIT_AUTHOR_DATE='2026-01-01T00:00:00Z' GIT_COMMITTER_DATE='2026-01-01T00:00:00Z' \
  git -c user.name='Eval Fixture' -c user.email='eval@example.invalid' \
  -c commit.gpgsign=false -c core.hooksPath=/dev/null commit -qm 'Add package manifest'
git update-ref refs/remotes/origin/main HEAD

git switch -q -c cart-format
git -c core.autocrlf=false add -- src test
GIT_AUTHOR_DATE='2026-01-01T00:01:00Z' GIT_COMMITTER_DATE='2026-01-01T00:01:00Z' \
  git -c user.name='Eval Fixture' -c user.email='eval@example.invalid' \
  -c commit.gpgsign=false -c core.hooksPath=/dev/null commit -qm 'Add formatCents'
