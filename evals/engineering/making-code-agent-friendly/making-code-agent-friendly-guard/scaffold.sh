#!/usr/bin/env bash
set -euo pipefail

cat >README.md <<'EOF_1'
# acme billing

Event handlers for invoices and payments.

To add a handler, create it in `src/handlers/` and add it to the `handlers`
array in `src/handlers/index.ts`. To change the schema, add the next numbered
file in `migrations/`.

Run the tests with `npm test`.
EOF_1

cat >package.json <<'EOF_2'
{
  "name": "@acme/billing",
  "version": "2.3.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
EOF_2

mkdir -p src/handlers migrations
cat >src/handlers/index.ts <<'EOF_3'
import { createInvoice } from "./createInvoice.js";
import { refundPayment } from "./refundPayment.js";

export const handlers = [
  createInvoice,
  refundPayment,
];

export function dispatch(event: { type: string; invoiceId: string }) {
  const handler = handlers.find((candidate) => candidate.type === event.type);
  if (!handler) {
    throw new Error(`no handler for ${event.type}`);
  }
  return handler.run(event);
}
EOF_3

cat >src/handlers/createInvoice.ts <<'EOF_4'
export const createInvoice = {
  type: "invoice.create",
  run(event: { type: string; invoiceId: string }) {
    return { status: "created", invoiceId: event.invoiceId };
  },
};
EOF_4

cat >src/handlers/refundPayment.ts <<'EOF_5'
export const refundPayment = {
  type: "payment.refund",
  run(event: { type: string; invoiceId: string }) {
    return { status: "refunded", invoiceId: event.invoiceId };
  },
};
EOF_5

cat >migrations/0001_create_invoices.sql <<'EOF_6'
CREATE TABLE invoices (id TEXT PRIMARY KEY, amount_cents INTEGER NOT NULL);
EOF_6

cat >migrations/0002_create_payments.sql <<'EOF_7'
CREATE TABLE payments (id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL REFERENCES invoices (id));
EOF_7

cat >migrations/0003_add_refunded_at.sql <<'EOF_8'
ALTER TABLE payments ADD COLUMN refunded_at TIMESTAMP NULL;
EOF_8

git init -q
git add -A
