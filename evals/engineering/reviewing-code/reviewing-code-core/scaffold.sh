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

cat >src/cart/discount.js <<'EOF_2'
"use strict";

function applyCoupon(subtotalCents, coupon, now = Date.now()) {
  if (coupon.expiresAt <= now) {
    return subtotalCents;
  }
  const percentOffCents = Math.round((subtotalCents * coupon.percentOff) / 100);
  return subtotalCents - Math.max(percentOffCents, coupon.maxOffCents);
}

module.exports = { applyCoupon };
EOF_2

cat >test/cart/discount.test.js <<'EOF_3'
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { applyCoupon } = require("../../src/cart/discount");

const FUTURE = Date.parse("2099-01-01T00:00:00Z");

test("takes the percentage off the subtotal", () => {
  assert.equal(applyCoupon(10000, { percentOff: 10, maxOffCents: 5000, expiresAt: FUTURE }), 9000);
});

test("ignores an expired coupon", () => {
  assert.equal(applyCoupon(10000, { percentOff: 10, maxOffCents: 5000, expiresAt: 0 }), 10000);
});

test("caps the discount at maxOffCents", () => {
  assert.equal(applyCoupon(10000, { percentOff: 50, maxOffCents: 2000, expiresAt: FUTURE }), 8000);
});
EOF_3

git init -q
git add -A
