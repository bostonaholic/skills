#!/usr/bin/env bash
set -euo pipefail

mkdir -p src/report test/report
cat >package.json <<'EOF_1'
{
  "name": "acme-orders",
  "version": "3.4.0",
  "private": true,
  "scripts": {
    "test": "node --test"
  }
}
EOF_1

cat >src/report/summary.js <<'EOF_2'
"use strict";

function summarize(items) {
  var title = "Order summary";
  const totalCents = items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
  const averageCents = Math.round(totalCents / items.length);
  return `${title}: ${items.length} items, total ${totalCents} cents, average ${averageCents} cents`;
}

module.exports = { summarize };
EOF_2

cat >test/report/summary.test.js <<'EOF_3'
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { summarize } = require("../../src/report/summary");

test("totals and averages the order items", () => {
  const items = [
    { priceCents: 500, quantity: 2 },
    { priceCents: 1000, quantity: 1 },
  ];
  assert.match(summarize(items), /2 items, total 2000 cents, average 1000 cents$/);
});
EOF_3

git init -q
git add -A
