#!/usr/bin/env bash
set -euo pipefail

mkdir -p docs/design src/cart
cat >docs/design/coupon-stacking.md <<'EOF_1'
# Design: Let shoppers stack two coupons

Status: Draft

## Problem

Checkout accepts one coupon per order. Support closes about 40 tickets a week
from shoppers who hold a store coupon and a partner coupon and want to use both.

## Decision

Accept up to two coupons per order. `applyCoupon` in `src/cart/discount.js`
runs once per coupon, in the order the shopper entered them, and each run takes
its percentage off the running subtotal.

Considered: add the two percentages and apply them once. Rejected because a
60% coupon plus a 50% coupon would take more than the whole subtotal.

## Rollout

1. Ship behind the `coupon_stacking` flag, on for staff only.
2. Turn the flag on for all shoppers after one week.

## Open Questions

1. Which coupon types may stack with each other? Owner: Dana.
EOF_1

cat >src/cart/discount.js <<'EOF_2'
"use strict";

function applyCoupon(subtotalCents, coupon, now = Date.now()) {
  if (coupon.expiresAt <= now) {
    return subtotalCents;
  }
  return subtotalCents - Math.round((subtotalCents * coupon.percentOff) / 100);
}

module.exports = { applyCoupon };
EOF_2

git init -q
git add -A
