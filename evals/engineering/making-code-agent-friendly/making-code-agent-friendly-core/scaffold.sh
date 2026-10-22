#!/usr/bin/env bash
set -euo pipefail

cat >README.md <<'EOF_1'
# acme billing

Event handlers for invoices and payments.

To add a handler, create it in `src/handlers/`, add it to the `handlers`
array in `src/handlers/index.ts`, and route its event type in
`src/events/router.ts`. To change the schema, add the next numbered file in
`migrations/`.

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

mkdir -p src/handlers src/events migrations
cat >src/handlers/index.ts <<'EOF_3'
import { createInvoice } from "./createInvoice.js";
import { refundPayment } from "./refundPayment.js";
import { voidInvoice } from "./voidInvoice.js";

export const handlers = [
  createInvoice,
  refundPayment,
  voidInvoice,
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

cat >src/handlers/voidInvoice.ts <<'EOF_6'
export const voidInvoice = {
  type: "invoice.void",
  run(event: { type: string; invoiceId: string }) {
    return { status: "voided", invoiceId: event.invoiceId };
  },
};
EOF_6

cat >src/events/router.ts <<'EOF_7'
export function queueFor(eventType: string): string {
  switch (eventType) {
    case "invoice.create":
      return "billing";
    case "payment.refund":
      return "payments";
    case "invoice.void":
      return "billing";
    default:
      throw new Error(`no queue for ${eventType}`);
  }
}
EOF_7

for i in $(seq 1 42); do
  n=$(printf '%04d' "$i")
  printf -- '-- schema change %s\n' "$n" >"migrations/${n}_schema_change.sql"
done

cat >migrations/0043_add_invoice_voided_at.sql <<'EOF_8'
ALTER TABLE invoices ADD COLUMN voided_at TIMESTAMP NULL;
EOF_8

git init -q
git add -A
