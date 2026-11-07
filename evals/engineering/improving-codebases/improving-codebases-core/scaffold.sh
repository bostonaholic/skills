#!/usr/bin/env bash
set -euo pipefail

mkdir -p src test

cat >package.json <<'EOF_1'
{
  "name": "acme-orders",
  "version": "0.3.0",
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
EOF_1

cat >README.md <<'EOF_2'
# acme-orders

Order handling for the Acme shop.
EOF_2

cat >src/order.js <<'EOF_3'
export class Order {
  constructor(id) {
    this.id = id;
    this.status = "pending";
  }

  pay() {
    if (this.status !== "pending") throw new Error(`cannot pay a ${this.status} order`);
    this.status = "paid";
  }

  ship() {
    if (this.status !== "paid") throw new Error(`cannot ship a ${this.status} order`);
    this.status = "shipped";
  }

  cancel() {
    if (this.status === "shipped") throw new Error("cannot cancel a shipped order");
    this.status = "cancelled";
  }
}
EOF_3

cat >test/order.test.js <<'EOF_4'
import assert from "node:assert/strict";
import { test } from "node:test";
import { Order } from "../src/order.js";

test("a paid order ships", () => {
  const order = new Order(1);
  order.pay();
  order.ship();
  assert.equal(order.status, "shipped");
});

test("a shipped order cannot be cancelled", () => {
  const order = new Order(2);
  order.pay();
  order.ship();
  assert.throws(() => order.cancel(), /cannot cancel/);
});

test("an unpaid order cannot ship", () => {
  assert.throws(() => new Order(3).ship(), /cannot ship a pending order/);
});
EOF_4

git init -q
git add -A
