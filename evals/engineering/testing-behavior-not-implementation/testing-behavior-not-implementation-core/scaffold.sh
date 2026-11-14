#!/usr/bin/env bash
set -euo pipefail

mkdir -p src test

cat >package.json <<'EOF_1'
{
  "name": "shop",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "test": "node --test --test-reporter=spec"
  }
}
EOF_1

cat >src/cart.js <<'EOF_2'
export class EmptyCartError extends Error {}

export function subtotalCents(items) {
  return items.reduce((sum, item) => sum + item.quantity * item.unitCents, 0);
}

// Charges the cart through the payment service and returns its receipt.
export async function checkout(items, payments) {
  if (items.length === 0) throw new EmptyCartError("cart is empty");
  return payments.charge({ amountCents: subtotalCents(items), currency: "USD" });
}
EOF_2

cat >test/cart.test.js <<'EOF_3'
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkout, subtotalCents } from "../src/cart.js";

const fakePayments = () => ({ charge: mock.fn(async (request) => ({ id: "ch_1", ...request })) });

test("checkout charges the subtotal", async () => {
  const items = [
    { quantity: 2, unitCents: 500 },
    { quantity: 1, unitCents: 250 },
  ];
  const receipt = await checkout(items, fakePayments());
  assert.equal(receipt.amountCents, subtotalCents(items));
});

test("checkout rejects an empty cart", async () => {
  await assert.rejects(checkout([], fakePayments()), { message: "cart is empty" });
});

test("subtotal is computed with reduce", () => {
  assert.match(readFileSync(new URL("../src/cart.js", import.meta.url), "utf8"), /items\.reduce/);
});
EOF_3

git init -q
git add -A
