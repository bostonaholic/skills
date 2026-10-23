#!/usr/bin/env bash
# Writes the handoff eval's base repository into the current directory. scripts/eval-handoff.mjs
# commits it in its own scratch git directory, so this script runs no git. The tests touch only
# files inside the repository and start no child process, because the script runs them under the
# Node permission model.
set -euo pipefail

cat >README.md <<'EOF_1'
# acme billing

Event handlers for invoices and payments.

To add a handler, create it in `src/handlers/`, add it to the `handlers`
array in `src/handlers/index.js`, and route its event type in the `switch`
in `src/events/router.js`. To change the schema, add the next numbered file
in `migrations/`, such as `0044_<change>.sql`.

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

mkdir -p src/handlers src/events migrations test
cat >src/handlers/index.js <<'EOF_3'
import { createInvoice } from "./createInvoice.js";
import { refundPayment } from "./refundPayment.js";
import { voidInvoice } from "./voidInvoice.js";

export const handlers = [
  createInvoice,
  refundPayment,
  voidInvoice,
];

export function dispatch(event) {
  const handler = handlers.find((candidate) => candidate.type === event.type);
  if (!handler) {
    throw new Error(`no handler for ${event.type}`);
  }
  return handler.run(event);
}
EOF_3

cat >src/handlers/createInvoice.js <<'EOF_4'
export const createInvoice = {
  type: "invoice.create",
  run(event) {
    return { status: "created", invoiceId: event.invoiceId };
  },
};
EOF_4

cat >src/handlers/refundPayment.js <<'EOF_5'
export const refundPayment = {
  type: "payment.refund",
  run(event) {
    return { status: "refunded", invoiceId: event.invoiceId };
  },
};
EOF_5

cat >src/handlers/voidInvoice.js <<'EOF_6'
export const voidInvoice = {
  type: "invoice.void",
  run(event) {
    return { status: "voided", invoiceId: event.invoiceId };
  },
};
EOF_6

cat >src/events/router.js <<'EOF_7'
export function queueFor(eventType) {
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

cat >src/migrations.js <<'EOF_8'
import { readdirSync } from "node:fs";

// Returns the migration file names in apply order. Two files that share a
// 4-digit version would apply in an undefined order, so that throws.
export function listMigrations(dir = new URL("../migrations/", import.meta.url)) {
  const names = readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const seen = new Map();
  for (const name of names) {
    const version = name.slice(0, 4);
    if (seen.has(version)) {
      throw new Error(`migrations ${seen.get(version)} and ${name} share version ${version}`);
    }
    seen.set(version, name);
  }
  return names;
}
EOF_8

for i in $(seq 1 42); do
  n=$(printf '%04d' "$i")
  printf -- '-- schema change %s\n' "$n" >"migrations/${n}_schema_change.sql"
done

cat >migrations/0043_add_invoice_voided_at.sql <<'EOF_9'
ALTER TABLE invoices ADD COLUMN voided_at TIMESTAMP NULL;
EOF_9

cat >test/handlers.test.js <<'EOF_10'
import assert from "node:assert/strict";
import test from "node:test";
import { dispatch } from "../src/handlers/index.js";

test("dispatch runs the handler for each event type", () => {
  assert.deepEqual(dispatch({ type: "invoice.create", invoiceId: "inv_1" }), {
    status: "created",
    invoiceId: "inv_1",
  });
  assert.deepEqual(dispatch({ type: "payment.refund", invoiceId: "inv_2" }), {
    status: "refunded",
    invoiceId: "inv_2",
  });
  assert.deepEqual(dispatch({ type: "invoice.void", invoiceId: "inv_3" }), {
    status: "voided",
    invoiceId: "inv_3",
  });
});

test("dispatch throws for an unknown event type", () => {
  assert.throws(() => dispatch({ type: "invoice.unknown", invoiceId: "inv_4" }));
});
EOF_10

cat >test/router.test.js <<'EOF_11'
import assert from "node:assert/strict";
import test from "node:test";
import { queueFor } from "../src/events/router.js";

test("queueFor routes each event type to its queue", () => {
  assert.equal(queueFor("invoice.create"), "billing");
  assert.equal(queueFor("payment.refund"), "payments");
  assert.equal(queueFor("invoice.void"), "billing");
});

test("queueFor throws for an unknown event type", () => {
  assert.throws(() => queueFor("invoice.unknown"));
});
EOF_11

cat >test/migrations.test.js <<'EOF_12'
import assert from "node:assert/strict";
import test from "node:test";
import { listMigrations } from "../src/migrations.js";

test("listMigrations returns the migrations in version order", () => {
  const names = listMigrations();
  assert.equal(names.length, 43);
  assert.equal(names[0], "0001_schema_change.sql");
  assert.equal(names.at(-1), "0043_add_invoice_voided_at.sql");
});
EOF_12
