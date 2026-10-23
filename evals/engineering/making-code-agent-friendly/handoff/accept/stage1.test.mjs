// Hidden test for the stage-1 refactor only: it must keep the migration list exactly, while each
// follow-on task adds a migration. Every test is top-level and named "stage1: ...".
import assert from "node:assert/strict";
import test from "node:test";
import { listMigrations } from "../src/migrations.js";

const ORIGINAL_MIGRATIONS = [
  ...Array.from({ length: 42 }, (_, i) => `${String(i + 1).padStart(4, "0")}_schema_change.sql`),
  "0043_add_invoice_voided_at.sql",
];

test("stage1: listMigrations returns exactly the 43 original migrations", () => {
  assert.deepEqual(listMigrations(), ORIGINAL_MIGRATIONS);
});
