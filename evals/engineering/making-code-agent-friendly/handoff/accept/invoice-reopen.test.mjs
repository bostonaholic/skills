// Hidden test for the invoice-reopen task. Every test is top-level and named "invoice-reopen: ...".
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

test("invoice-reopen: dispatch handles invoice.reopen", () => {
  assert.deepEqual(dispatch({ type: "invoice.reopen", invoiceId: "inv_9" }), {
    status: "reopened",
    invoiceId: "inv_9",
  });
});

test("invoice-reopen: queueFor routes invoice.reopen to billing", () => {
  assert.equal(queueFor("invoice.reopen"), "billing");
});

test("invoice-reopen: a new migration adds reopened_at to invoices", () => {
  const added = listMigrations().filter((name) => !ORIGINAL_MIGRATIONS.has(name));
  const sql = added.map((name) => readFileSync(new URL(name, MIGRATIONS_DIR), "utf8"));
  assert.ok(
    sql.some((text) =>
      /\balter\s+table\s+\W?invoices\W?\s+add\s+(column\s+)?\W?reopened_at\b/i.test(text),
    ),
    `no new migration adds reopened_at to invoices; new migrations: ${added.join(", ") || "none"}`,
  );
});
