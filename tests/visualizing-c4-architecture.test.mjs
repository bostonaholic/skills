// Fails when build-c4-site.mjs stops holding its contract: validation names every broken id,
// parent, and relationship endpoint; relationships roll up to each C4 level with merged counts
// and no self-loops; cycles are the strongly connected sets of two or more core nodes, each
// with a closed path through its members; and the CLI writes the site with exit 0, refuses an
// invalid model with exit 1 and nothing written, and prints usage with exit 2.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  buildViews,
  findCycles,
  stronglyConnected,
  validateModel,
} from "../skills/engineering/visualizing-c4-architecture/scripts/build-c4-site.mjs";

const SCRIPT = resolve("skills/engineering/visualizing-c4-architecture/scripts/build-c4-site.mjs");
const SITE_FILES = [
  "index.html",
  "context.html",
  "containers.html",
  "components.html",
  "code.html",
  "styles.css",
  "app.js",
  "data.js",
];

function scratch(t) {
  const dir = mkdtempSync(join(tmpdir(), "c4-site-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function run(...args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
}

// Two containers with two components each. Code in api.orders and api.billing imports in a loop,
// so the loop shows at the code and component levels and vanishes inside the api container.
function model() {
  return {
    system: { id: "shop", name: "Shop", description: "Sells things." },
    people: [{ id: "buyer", name: "Buyer" }],
    externalSystems: [{ id: "pay", name: "PayCo" }],
    containers: [
      { id: "web", name: "Web", technology: "React" },
      { id: "api", name: "API", technology: "Node" },
    ],
    components: [
      { id: "web.ui", name: "UI", container: "web" },
      { id: "web.client", name: "Client", container: "web" },
      { id: "api.orders", name: "Orders", container: "api" },
      { id: "api.billing", name: "Billing", container: "api" },
    ],
    code: [
      { id: "ui/Page", name: "Page", component: "web.ui" },
      { id: "client/http", name: "http", component: "web.client" },
      { id: "orders/OrderService", name: "OrderService", component: "api.orders" },
      { id: "orders/OrderRepo", name: "OrderRepo", component: "api.orders" },
      { id: "billing/Invoice", name: "Invoice", component: "api.billing" },
    ],
    relationships: [
      { from: "buyer", to: "ui/Page", label: "Shops", technology: "HTTPS" },
      { from: "ui/Page", to: "client/http" },
      { from: "client/http", to: "orders/OrderService", label: "Calls", technology: "JSON" },
      { from: "orders/OrderService", to: "orders/OrderRepo" },
      { from: "orders/OrderService", to: "billing/Invoice", label: "Bills" },
      { from: "billing/Invoice", to: "orders/OrderService", label: "Reads order" },
      { from: "billing/Invoice", to: "pay", label: "Charges" },
    ],
  };
}

const pairs = (edges) => edges.map((e) => `${e.source}>${e.target}`).sort();

test("a well-formed model has no validation errors", () => {
  assert.deepEqual(validateModel(model()), []);
});

test("validation names duplicate ids, unknown parents, and unknown endpoints", () => {
  const broken = model();
  broken.code.push({ id: "ui/Page", name: "Again", component: "web.ui" });
  broken.code.push({ id: "x/Lost", name: "Lost", component: "nowhere" });
  broken.components.push({ id: "api.misfiled", name: "Misfiled", container: "api.orders" });
  broken.relationships.push({ from: "ui/Page", to: "ghost" });
  broken.relationships.push({ from: "web", to: "web" });
  const errors = validateModel(broken);
  assert.ok(errors.some((e) => /code\[5\]\.id: "ui\/Page" is used twice/.test(e)));
  assert.ok(errors.some((e) => /code\[6\]\.component: "nowhere" is not a component id/.test(e)));
  assert.ok(
    errors.some((e) => /components\[4\]\.container: "api.orders" is not a container id/.test(e)),
  );
  assert.ok(errors.some((e) => /relationships\[7\]\.to: "ghost" is not an element id/.test(e)));
  assert.ok(errors.some((e) => /relationships\[8\]: from and to are the same element/.test(e)));
});

test("validation rejects a model with no system", () => {
  assert.deepEqual(validateModel({ containers: [] }), [
    "system: missing; give it an id and a name",
  ]);
  assert.deepEqual(validateModel([]), ["the model is not a JSON object"]);
});

test("relationships roll up to each level, merging pairs and dropping self-loops", () => {
  const { levels } = buildViews(model());
  assert.deepEqual(pairs(levels.context.edges), ["buyer>shop", "shop>pay"]);
  assert.deepEqual(pairs(levels.containers.edges), ["api>pay", "buyer>web", "web>api"]);
  assert.deepEqual(pairs(levels.components.edges), [
    "api.billing>api.orders",
    "api.billing>pay",
    "api.orders>api.billing",
    "buyer>web.ui",
    "web.client>api.orders",
    "web.ui>web.client",
  ]);
  assert.equal(levels.code.edges.length, 5);
  const shops = levels.containers.edges.find((e) => e.source === "buyer");
  assert.deepEqual([shops.count, shops.labels, shops.technologies], [1, ["Shops"], ["HTTPS"]]);
});

test("merged relationships count every source and list each label once", () => {
  const twice = model();
  twice.relationships.push({ from: "ui/Page", to: "client/http", label: "Fetches" });
  twice.relationships.push({ from: "ui/Page", to: "client/http", label: "Fetches" });
  const edge = buildViews(twice).levels.components.edges.find((e) => e.source === "web.ui");
  assert.equal(edge.count, 3);
  assert.deepEqual(edge.labels, ["Fetches"]);
});

test("cycles appear at the levels where the loop crosses element boundaries", () => {
  const { levels } = buildViews(model());
  assert.deepEqual(levels.containers.cycles, []);
  assert.deepEqual(
    levels.components.cycles.map((c) => c.nodes),
    [["api.billing", "api.orders"]],
  );
  assert.deepEqual(
    levels.code.cycles.map((c) => c.nodes),
    [["billing/Invoice", "orders/OrderService"]],
  );
  const flagged = levels.code.edges.filter((e) => e.cycle).map((e) => `${e.source}>${e.target}`);
  assert.deepEqual(flagged.sort(), [
    "billing/Invoice>orders/OrderService",
    "orders/OrderService>billing/Invoice",
  ]);
  assert.equal(levels.code.nodes.find((n) => n.id === "orders/OrderRepo").cycle, null);
});

test("peripheral nodes appear beside the core nodes they connect to and never join a cycle", () => {
  const { levels } = buildViews(model());
  const pay = levels.components.nodes.find((n) => n.id === "pay");
  assert.deepEqual(pay, { id: "pay", core: false, cycle: null });
  const both = model();
  both.relationships.push({ from: "pay", to: "billing/Invoice" });
  assert.deepEqual(
    buildViews(both).levels.components.cycles.map((c) => c.nodes),
    [["api.billing", "api.orders"]],
  );
});

test("stronglyConnected finds every set of two or more nodes that reach one another", () => {
  const edges = [
    ["a", "b"],
    ["b", "c"],
    ["c", "a"],
    ["c", "d"],
    ["d", "e"],
    ["e", "d"],
    ["f", "f"],
  ].map(([source, target]) => ({ source, target }));
  const found = stronglyConnected(["a", "b", "c", "d", "e", "f"], edges).map((c) => c.join(""));
  assert.deepEqual(found.sort(), ["abc", "de"]);
});

test("stronglyConnected survives a dependency chain deeper than the call stack", () => {
  const size = 200_000;
  const ids = Array.from({ length: size }, (_, i) => `n${i}`);
  const edges = ids.slice(1).map((id, i) => ({ source: ids[i], target: id }));
  edges.push({ source: ids[size - 1], target: ids[0] });
  const found = stronglyConnected(ids, edges);
  assert.equal(found.length, 1);
  assert.equal(found[0].length, size);
});

test("each cycle carries a closed path that follows real edges inside the set", () => {
  const edges = [
    ["a", "b"],
    ["b", "c"],
    ["c", "d"],
    ["d", "a"],
    ["b", "a"],
  ].map(([source, target]) => ({ source, target }));
  const { cycles } = findCycles(["a", "b", "c", "d"], edges);
  assert.equal(cycles.length, 1);
  const { path, nodes, edgeCount } = cycles[0];
  assert.deepEqual(nodes, ["a", "b", "c", "d"]);
  assert.equal(edgeCount, 5);
  assert.deepEqual(path, ["a", "b", "a"]);
  const real = new Set(edges.map((e) => `${e.source}>${e.target}`));
  for (let i = 1; i < path.length; i++) assert.ok(real.has(`${path[i - 1]}>${path[i]}`));
});

test("the CLI writes every site file and embeds the views in data.js", (t) => {
  const dir = scratch(t);
  const modelPath = join(dir, "c4-model.json");
  writeFileSync(modelPath, JSON.stringify(model()));
  const out = join(dir, "site");
  const result = run(modelPath, out);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    result.stdout,
    [
      join(out, "index.html"),
      "containers: 0 cycle(s)",
      "components: 1 cycle(s)",
      "  cycle-1 (2 elements): api.billing -> api.orders -> api.billing",
      "code: 1 cycle(s)",
      "  cycle-1 (2 elements): billing/Invoice -> orders/OrderService -> billing/Invoice",
      "",
    ].join("\n"),
  );
  for (const name of SITE_FILES) assert.ok(existsSync(join(out, name)), name);
  const data = readFileSync(join(out, "data.js"), "utf8");
  const views = JSON.parse(data.replace(/^window\.C4 = /, "").replace(/;\n$/, ""));
  assert.equal(views.system.name, "Shop");
  assert.equal(views.levels.code.cycles.length, 1);
  assert.match(readFileSync(join(out, "components.html"), "utf8"), /data-level="components"/);
});

test("model text is escaped in the pages and in data.js", (t) => {
  const dir = scratch(t);
  const hostile = model();
  hostile.system.name = "<script>alert(1)</script>";
  hostile.containers[0].description = "</script><img src=x>";
  const modelPath = join(dir, "c4-model.json");
  writeFileSync(modelPath, JSON.stringify(hostile));
  const out = join(dir, "site");
  assert.equal(run(modelPath, out).status, 0);
  assert.doesNotMatch(readFileSync(join(out, "index.html"), "utf8"), /<script>alert/);
  assert.doesNotMatch(readFileSync(join(out, "data.js"), "utf8"), /<\/script>/);
});

test("the CLI refuses an invalid model, lists every error, and writes nothing", (t) => {
  const dir = scratch(t);
  const broken = model();
  broken.relationships.push({ from: "ui/Page", to: "ghost" });
  broken.code.push({ id: "x/Lost", name: "Lost", component: "nowhere" });
  const modelPath = join(dir, "c4-model.json");
  writeFileSync(modelPath, JSON.stringify(broken));
  const out = join(dir, "site");
  const result = run(modelPath, out);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /2 validation error\(s\)/);
  assert.match(result.stderr, /"ghost"/);
  assert.match(result.stderr, /"nowhere"/);
  assert.match(result.stderr, /\nsee \/.+\/visualizing-c4-architecture\/SKILL\.md\n$/);
  assert.equal(existsSync(out), false);
});

test("the CLI refuses a file that is not JSON", (t) => {
  const dir = scratch(t);
  const modelPath = join(dir, "c4-model.json");
  writeFileSync(modelPath, "{ not json");
  const result = run(modelPath, join(dir, "site"));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^cannot read .+ as JSON/);
});

test("the CLI prints usage with exit 2 for the wrong number of arguments", () => {
  const result = run("only-one");
  assert.equal(result.status, 2);
  assert.match(
    result.stderr,
    /^usage: build-c4-site\.mjs <c4-model\.json> <out>\nsee \/.+\/SKILL\.md\n$/,
  );
});
