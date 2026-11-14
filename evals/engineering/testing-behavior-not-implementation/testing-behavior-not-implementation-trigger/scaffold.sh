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

git init -q
git add -A
