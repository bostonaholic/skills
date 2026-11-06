#!/usr/bin/env bash
set -euo pipefail

cat >README.md <<'EOF_1'
# acme billing

Event handlers for invoices and payments.

To add a handler, create it in `src/handlers/` and add it to the `handlers`
array in `src/handlers/index.ts`. Invoice states and the events that move
between them live in `src/ledger/transitions.ts`.

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

mkdir -p src/handlers src/ledger
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

cat >src/ledger/transitions.ts <<'EOF_7'
export const transitions = [
  { from: "draft", on: "invoice.create", to: "open" },
  { from: "open", on: "payment.capture", to: "paid" },
  { from: "paid", on: "payment.refund", to: "refunded" },
  { from: "open", on: "invoice.void", to: "voided" },
  { from: "draft", on: "invoice.void", to: "voided" },
];

export function nextState(state: string, eventType: string): string {
  const transition = transitions.find(
    (candidate) => candidate.from === state && candidate.on === eventType,
  );
  if (!transition) {
    throw new Error(`no transition from ${state} on ${eventType}`);
  }
  return transition.to;
}
EOF_7

git init -q
git add -A
