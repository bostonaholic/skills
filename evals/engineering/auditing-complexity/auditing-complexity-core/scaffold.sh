#!/usr/bin/env bash
set -euo pipefail

cat >README.md <<'EOF_1'
# acme storefront

Cart, shipping, and checkout logic for the acme storefront.

Run the tests with `npm test`.
EOF_1

cat >package.json <<'EOF_2'
{
  "name": "@acme/storefront",
  "version": "1.4.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
EOF_2

mkdir -p src
cat >src/cart.js <<'EOF_3'
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
EOF_3

cat >src/shipping.js <<'EOF_4'
const REMOTE_PREFIXES = ["96", "99"];

export function isRemote(postcode) {
  return REMOTE_PREFIXES.some((prefix) => postcode.startsWith(prefix));
}

export function shippingRate(order, region) {
  let rate;
  switch (region) {
    case "domestic":
      rate = 5;
      break;
    case "canada":
      rate = 12;
      break;
    case "europe":
      rate = 18;
      break;
    default:
      rate = 25;
  }
  if (isRemote(order.postcode)) {
    rate += 10;
  }
  if (order.weightKg > 20 && region !== "domestic") {
    rate *= 1.5;
  }
  return order.subtotal >= 100 && region === "domestic" ? 0 : rate;
}
EOF_4

cat >src/checkout.js <<'EOF_5'
import { applyDiscounts } from "./cart.js";
import { shippingRate } from "./shipping.js";
import { charge } from "./payments.js";

let ordersPlaced = 0;

export async function placeOrder(cart, customer, codes, region, card) {
  if (cart.items.length === 0) {
    throw new Error("empty cart");
  }
  const { total } = applyDiscounts(cart, customer, codes);
  const shipping = shippingRate({ ...cart, subtotal: total }, region);
  try {
    const receipt = await charge(card, total + shipping);
    ordersPlaced += 1;
    return receipt;
  } catch (error) {
    if (error.code === "card_declined") {
      return null;
    }
    throw error;
  }
}

export function orderCount() {
  return ordersPlaced;
}
EOF_5

cat >src/payments.js <<'EOF_6'
export async function charge(card, amount) {
  if (!card || !card.token) {
    throw Object.assign(new Error("missing card"), { code: "card_missing" });
  }
  return { id: `ch_${card.token.slice(-6)}`, amount };
}
EOF_6

cat >src/format.js <<'EOF_7'
export function formatPrice(amount, currency = "USD") {
  const value = Math.round(amount * 100) / 100;
  return currency === "USD" ? `$${value.toFixed(2)}` : `${value.toFixed(2)} ${currency}`;
}
EOF_7

git init -q
git add -A
