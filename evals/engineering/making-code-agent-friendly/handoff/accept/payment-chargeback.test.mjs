// Hidden test for the payment-chargeback task. Every test is top-level and named "payment-chargeback: ...".
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { queueFor } from "../src/events/router.js";
import { dispatch } from "../src/handlers/index.js";
import { listMigrations } from "../src/migrations.js";

const MIGRATIONS_DIR = new URL("../migrations/", import.meta.url);
const ORIGINAL_MIGRATIONS = new Set([
  ...Array.from({ length: 42 }, (_, i) => `${String(i + 1).padStart(4, "0")}_schema_change.sql`),
  "0043_add_invoice_voided_at.sql",
]);

test("payment-chargeback: dispatch handles payment.chargeback", () => {
  assert.deepEqual(dispatch({ type: "payment.chargeback", invoiceId: "inv_9" }), {
    status: "charged_back",
    invoiceId: "inv_9",
  });
});

test("payment-chargeback: queueFor routes payment.chargeback to payments", () => {
  assert.equal(queueFor("payment.chargeback"), "payments");
});

test("payment-chargeback: a new migration adds charged_back_at to payments", () => {
  const added = listMigrations().filter((name) => !ORIGINAL_MIGRATIONS.has(name));
  const sql = added.map((name) => readFileSync(new URL(name, MIGRATIONS_DIR), "utf8"));
  assert.ok(
    sql.some((text) =>
      /\balter\s+table\s+\W?payments\W?\s+add\s+(column\s+)?\W?charged_back_at\b/i.test(text),
    ),
    `no new migration adds charged_back_at to payments; new migrations: ${added.join(", ") || "none"}`,
  );
});
