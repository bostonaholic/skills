// Fails when find-leads.mjs misses or invents a lead in a synthetic Rails app: file sizes, a
// foreign key column with no constraint or index, a money column with no currency, an
// attr_accessor shadowing a column, an unresolved table, or a literal grep hit; or when it
// changes its output order or an exit code.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import {
  countLines,
  parseSchema,
  pluralize,
  singularize,
} from "../skills/engineering/auditing-rails-tech-debt/scripts/find-leads.mjs";

const SCRIPT = resolve("skills/engineering/auditing-rails-tech-debt/scripts/find-leads.mjs");

const SCHEMA = `ActiveRecord::Schema[7.1].define(version: 2026_10_01_000000) do
  create_table "customers", force: :cascade do |t|
    t.string "email", null: false
    t.decimal "balance", precision: 10, scale: 2
    t.string "balance_currency"
    t.index ["email"], name: "index_customers_on_email", unique: true
  end

  create_table "orders", force: :cascade do |t|
    t.bigint "customer_id", null: false
    t.bigint "buyer_id"
    t.bigint "coupon_id"
    t.float "total"
    t.decimal "tax_rate"
    t.integer "price_cents"
    t.string "notes"
    t.index ["customer_id", "created_at"], name: "index_orders_on_customer_id_and_created_at"
  end

  create_table "comments", force: :cascade do |t|
    t.string "commentable_type"
    t.bigint "commentable_id"
    t.string "body"
    t.index ["commentable_type", "commentable_id"], name: "index_comments_on_commentable"
  end

  create_table "categories", force: :cascade do |t|
    t.string "name"
  end

  create_table "people", force: :cascade do |t|
    t.string "name"
  end

  add_index "orders", "buyer_id", name: "index_orders_on_buyer_id"
  add_foreign_key "orders", "customers"
  add_foreign_key "orders", "customers", column: "buyer_id"
  add_foreign_key "comments", "people"
end
`;

const APP = {
  Gemfile: 'source "https://gems.invalid"\ngem "rails"\n',
  "db/schema.rb": SCHEMA,
  "app/models/application_record.rb":
    "class ApplicationRecord < ActiveRecord::Base\n  primary_abstract_class\nend\n",
  "app/models/order.rb": [
    "class Order < ApplicationRecord",
    "  attr_accessor :notes, :gift_message",
    "  belongs_to :customer",
    "  scope :by, ->(q) { where(\"name = '#{q}'\") }",
    '  # where("x = #{commented}") is not code',
    '  def label = "<span>#{id}</span>".html_safe',
    "  def charge! = Stripe::Charge.create(amount: total)",
    "end",
    "",
  ].join("\n"),
  "app/models/category.rb": "class Category < ApplicationRecord\n  attr_writer :name\nend\n",
  "app/models/legacy/widget.rb": [
    "class Legacy::Widget < ActiveRecord::Base",
    '  self.table_name = "orders"',
    "  attr_accessor :total # cached",
    "end",
  ].join("\n"),
  "app/models/person.rb": "class Person < ApplicationRecord\n  attr_accessor :name\nend\n",
  "app/controllers/application_controller.rb":
    "class ApplicationController < ActionController::Base\nend\n",
  "app/controllers/orders_controller.rb": [
    "class OrdersController < ApplicationController",
    "  def update",
    "    @order.update_column(:notes, params[:notes])",
    "    @order.save(validate: false) if Rails.env.production?",
    "    $stdout.puts 'ok'",
    "    $cache[:order] = @order",
    "    Thread.current[:order] = @order",
    "    ActiveRecord::Base.connection.execute('select 1')",
    "  end",
    "end",
    "",
  ].join("\n"),
  "lib/legacy_client.rb":
    "class LegacyClient\n  @@calls = 0\n  def get = Net::HTTP.get(URI(@url))\nend\n",
  "spec/models/order_spec.rb": "order.update_column(:notes, nil)\n",
};

function scratch(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "find-leads-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeApp(root, files) {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

function run(...args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
}

function leadsFor(t, files = APP) {
  const result = run(writeApp(scratch(t), files));
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("sizes rank models and controllers by line count, then path", (t) => {
  const { sizes } = leadsFor(t);
  assert.deepEqual(sizes.models, {
    count: 5,
    largest: [
      { file: "app/models/order.rb", lines: 8 },
      { file: "app/models/legacy/widget.rb", lines: 4 },
      { file: "app/models/application_record.rb", lines: 3 },
      { file: "app/models/category.rb", lines: 3 },
      { file: "app/models/person.rb", lines: 3 },
    ],
  });
  assert.deepEqual(sizes.controllers, {
    count: 2,
    largest: [
      { file: "app/controllers/orders_controller.rb", lines: 10 },
      { file: "app/controllers/application_controller.rb", lines: 2 },
    ],
  });
});

test("largest holds at most 25 files while count holds them all", (t) => {
  const files = { Gemfile: "", "db/schema.rb": "ActiveRecord::Schema.define do\nend\n" };
  for (let n = 0; n < 30; n++) files[`app/models/m${String(n).padStart(2, "0")}.rb`] = "x\n";
  const { sizes } = leadsFor(t, files);
  assert.equal(sizes.models.count, 30);
  assert.equal(sizes.models.largest.length, 25);
  assert.equal(sizes.models.largest[24].file, "app/models/m24.rb");
});

test("foreign key leads cover constraints, indexes, and polymorphic columns", (t) => {
  const { schema } = leadsFor(t);
  assert.deepEqual(schema.fkWithoutConstraint, [
    { table: "comments", column: "commentable_id", polymorphic: true },
    { table: "orders", column: "coupon_id", polymorphic: false },
  ]);
  assert.deepEqual(schema.fkWithoutIndex, [
    { table: "orders", column: "coupon_id", polymorphic: false },
  ]);
});

test("money leads are float or decimal money-named columns on tables with no currency", (t) => {
  const { schema } = leadsFor(t);
  assert.deepEqual(schema.moneyColumns, [
    { table: "orders", column: "tax_rate", type: "decimal" },
    { table: "orders", column: "total", type: "float" },
  ]);
});

test("attr leads name accessors and writers that shadow a column of the model's table", (t) => {
  const { schema } = leadsFor(t);
  assert.deepEqual(schema.attrShadowsColumn, [
    { file: "app/models/category.rb", line: 2, attribute: "name", table: "categories" },
    { file: "app/models/legacy/widget.rb", line: 3, attribute: "total", table: "orders" },
    { file: "app/models/order.rb", line: 2, attribute: "notes", table: "orders" },
  ]);
});

test("a foreign key or model table the naive inflection cannot match is unresolved", (t) => {
  const { schema } = leadsFor(t);
  assert.deepEqual(schema.unresolved, [
    { kind: "foreign-key", table: "comments", toTable: "people" },
    { kind: "model-table", file: "app/models/person.rb", table: "persons" },
  ]);
});

test("grep leads follow rule order, skip comments, specs, and Application definitions", (t) => {
  const { greps } = leadsFor(t);
  const lead = (rule, file, line) => ({ rule, file, line });
  assert.deepEqual(
    greps.map(({ rule, file, line }) => ({ rule, file, line })),
    [
      lead("sql-interpolation", "app/models/order.rb", 4),
      lead("validation-bypass", "app/controllers/orders_controller.rb", 3),
      lead("validation-bypass", "app/controllers/orders_controller.rb", 4),
      lead("raw-sql", "app/controllers/orders_controller.rb", 8),
      lead("http-client", "app/models/order.rb", 7),
      lead("http-client", "lib/legacy_client.rb", 3),
      lead("layer-supertype-bypass", "app/models/legacy/widget.rb", 1),
      lead("global-state", "app/controllers/orders_controller.rb", 6),
      lead("global-state", "app/controllers/orders_controller.rb", 7),
      lead("global-state", "lib/legacy_client.rb", 2),
      lead("rails-env-branch", "app/controllers/orders_controller.rb", 4),
      lead("presentation-in-model", "app/models/order.rb", 6),
    ],
  );
  assert.equal(greps[0].text, "scope :by, ->(q) { where(\"name = '#{q}'\") }");
});

test("a Rails root without db/schema.rb prints the other leads and exits 3", (t) => {
  const files = { ...APP };
  delete files["db/schema.rb"];
  const result = run(writeApp(scratch(t), files));
  assert.equal(result.status, 3);
  assert.match(result.stderr, /no db\/schema\.rb/);
  const leads = JSON.parse(result.stdout);
  assert.equal(leads.schema, null);
  assert.equal(leads.sizes.models.count, 5);
  assert.equal(leads.greps.length, 12);
});

test("a directory without a Gemfile or app/ exits 1 and prints nothing", (t) => {
  for (const files of [{ "app/models/a.rb": "" }, { Gemfile: "" }]) {
    const result = run(writeApp(scratch(t), files));
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /^find-leads\.mjs: .* is not a Rails root/);
  }
});

test("a schema.rb with no ActiveRecord::Schema definition exits 1", (t) => {
  const result = run(writeApp(scratch(t), { ...APP, "db/schema.rb": "# empty\n" }));
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /no ActiveRecord::Schema definition/);
});

test("an unreadable Ruby file exits 1 naming it", (t) => {
  const root = writeApp(scratch(t), APP);
  writeFileSync(join(root, "app/models/locked.rb"), "x\n", { mode: 0o000 });
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /cannot read .*locked\.rb: EACCES/);
});

test("a wrong argument count exits 2 with the usage line", () => {
  for (const args of [[], ["a", "b"]]) {
    const result = run(...args);
    assert.equal(result.status, 2);
    assert.equal(
      result.stderr,
      `find-leads.mjs: usage: find-leads.mjs <app-root>\nsee ${realpathSync(resolve(SCRIPT, "../../SKILL.md"))}\n`,
    );
  }
});

test("the naive inflection and line count follow their stated rules", () => {
  assert.deepEqual(["categories", "boxes", "orders", "address"].map(singularize), [
    "category",
    "box",
    "order",
    "address",
  ]);
  assert.deepEqual(["category", "box", "order", "key"].map(pluralize), [
    "categories",
    "boxes",
    "orders",
    "keys",
  ]);
  assert.deepEqual(["", "a", "a\n", "a\nb"].map(countLines), [0, 1, 1, 2]);
  assert.throws(() => parseSchema("create_table"), /no ActiveRecord::Schema definition/);
});
