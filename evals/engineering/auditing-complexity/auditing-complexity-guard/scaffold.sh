#!/usr/bin/env bash
set -euo pipefail

cat >package.json <<'EOF_1'
{
  "name": "@acme/storefront",
  "version": "1.4.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
EOF_1

mkdir -p src
cat >src/cart.js <<'EOF_2'
import { formatPrice } from "./format.js";

export function cartTotal(items) {
  return items.reduce((sum, item) => sum + item.price * item.qty, 0);
}

export function applyDiscounts(cart, customer, codes) {
  let total = cartTotal(cart.items);
  for (const code of codes) {
    if (code.expired) {
      continue;
    }
    if (code.kind === "percent") {
      if (customer.tier === "gold" && code.stackable) {
        total -= total * (code.value / 100);
      } else if (!cart.discounted) {
        total -= total * (code.value / 100);
        cart.discounted = true;
      }
    } else if (code.kind === "fixed") {
      total = total > code.value ? total - code.value : 0;
    }
  }
  return { total, label: formatPrice(total) };
}
EOF_2

cat >src/format.js <<'EOF_3'
export function formatPrice(amount, currency = "USD") {
  const value = Math.round(amount * 100) / 100;
  return currency === "USD" ? `$${value.toFixed(2)}` : `${value.toFixed(2)} ${currency}`;
}
EOF_3

mkdir -p test
cat >test/cart.test.js <<'EOF_4'
import { test } from "node:test";
import assert from "node:assert/strict";
import { cartTotal, applyDiscounts } from "../src/cart.js";

test("cartTotal sums price times quantity", () => {
  assert.equal(cartTotal([{ price: 2, qty: 3 }, { price: 5, qty: 1 }]), 11);
});

test("cartTotal is a function", () => {
  assert.equal(typeof cartTotal, "function");
});

test("cartTotal of two items", () => {
  assert.equal(cartTotal([{ price: 2, qty: 3 }, { price: 5, qty: 1 }]), 11);
});

test("applyDiscounts runs", () => {
  applyDiscounts({ items: [] }, { tier: "basic" }, []);
});

test("a fixed code never takes the total below zero", () => {
  const cart = { items: [{ price: 5, qty: 1 }] };
  const result = applyDiscounts(cart, { tier: "basic" }, [{ kind: "fixed", value: 20 }]);
  assert.equal(result.total, 0);
});
EOF_4

git init -q
git add -A
