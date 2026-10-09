#!/usr/bin/env bash
set -euo pipefail

mkdir -p src/cart test/cart
cat >package.json <<'PACKAGE'
{"name":"coupon-cap-eval","private":true,"scripts":{"test":"node --test"}}
PACKAGE

cat >src/cart/discount.js <<'SOURCE'
"use strict";
function applyCoupon(subtotalCents, coupon) {
  const percentOffCents = Math.round((subtotalCents * coupon.percentOff) / 100);
  return subtotalCents - Math.max(percentOffCents, coupon.maxOffCents);
}
module.exports = { applyCoupon };
SOURCE

cat >test/cart/discount.test.js <<'TESTS'
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { applyCoupon } = require("../../src/cart/discount");
test("a small discount stays below the cap", () => {
  assert.equal(applyCoupon(10000, { percentOff: 10, maxOffCents: 5000 }), 9000);
});
test("a large discount stops at the cap", () => {
  assert.equal(applyCoupon(10000, { percentOff: 50, maxOffCents: 2000 }), 8000);
});
TESTS

git init -q -b main --object-format=sha1
git -c core.autocrlf=false add -- package.json src test
GIT_AUTHOR_DATE='2026-01-01T00:00:00Z' GIT_COMMITTER_DATE='2026-01-01T00:00:00Z' \
  git -c user.name='Eval Fixture' -c user.email='eval@example.invalid' \
  -c commit.gpgsign=false -c core.hooksPath=/dev/null commit -qm 'Coupon cap before fix'
git update-ref refs/remotes/origin/main HEAD

sed 's/Math.max/Math.min/' src/cart/discount.js >src/cart/discount.js.next
mv src/cart/discount.js.next src/cart/discount.js
git add -- src/cart/discount.js
GIT_AUTHOR_DATE='2026-01-01T00:01:00Z' GIT_COMMITTER_DATE='2026-01-01T00:01:00Z' \
  git -c user.name='Eval Fixture' -c user.email='eval@example.invalid' \
  -c commit.gpgsign=false -c core.hooksPath=/dev/null commit -qm 'Fix coupon cap'

cat >external-review.md <<'REVIEW'
**Verdict: REQUEST CHANGES**

**issue (blocking):** The coupon cap acts as a minimum discount.
`src/cart/discount.js:4` uses `Math.max`, so a 10% discount on 10000 cents with a 5000-cent cap incorrectly subtracts 5000 cents.
Reviewed commit: BASE_COMMIT.
Permalink: https://github.com/acme/checkout/blob/BASE_COMMIT/src/cart/discount.js#L4
REVIEW

base_commit=$(git rev-parse origin/main)
sed "s/BASE_COMMIT/$base_commit/g" external-review.md >external-review.md.next
mv external-review.md.next external-review.md
