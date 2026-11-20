// Fails when build-c4-site.mjs stops holding its contract: validation names every broken id,
// parent, and relationship endpoint; relationships roll up to each C4 level with merged counts
// and no self-loops; cycles are the strongly connected sets of two or more core nodes, each
// with a closed path through its members; and the CLI writes the site with exit 0, refuses an
// invalid model with exit 1 and nothing written, and prints usage with exit 2.
// Also fails when the architecture grade breaks its contract: validation names every error in the
// `architecture` section and in component layers; stdout prints the grade line, one line per
// criterion, and one line per cap, or the reason no letter was given; combine maps weighted points
// to the letter scale and never rewards a lower criterion or an added cap; and data.js carries
// each criterion's name, band citations, and evidence, capped at 20 items in code-unit order.
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
} from "../skills/engineering/visualizing-codebases/scripts/build-c4-site.mjs";
import { combine } from "../skills/engineering/visualizing-codebases/scripts/grade-architecture.mjs";

const SCRIPT = resolve("skills/engineering/visualizing-codebases/scripts/build-c4-site.mjs");
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

// Every grading question answered yes. The ids are spelled out, so a renamed id turns red here.
function allYes() {
  return {
    "public-entry": { answer: "yes", evidence: ["src/orders/index.js"] },
    "one-writer-per-store": { answer: "yes", evidence: ["src/store/repo.js"] },
    "explicit-contracts": { answer: "yes", evidence: ["src/http/routes.js"] },
    "framework-free-core": { answer: "yes", evidence: ["src/orders/rules.js"] },
    "core-owns-ports": { answer: "yes", evidence: ["src/orders/ports.js"] },
    "rules-in-core": { answer: "yes", evidence: ["src/orders/rules.js"] },
    "single-purpose": { answer: "yes", evidence: ["README.md"] },
    "no-catch-all": { answer: "yes", evidence: ["src/"] },
    "no-god-modules": { answer: "yes", evidence: ["src/billing/invoice.js"] },
    "no-hollow-layers": { answer: "yes", evidence: ["src/store/repo.js"] },
    "follows-convention": { answer: "yes", evidence: ["README.md"] },
    "one-mechanism-per-concern": { answer: "yes", evidence: ["src/http/client.js"] },
    "rules-checked": { answer: "yes", evidence: [".dependency-cruiser.cjs"] },
    "docs-match": { answer: "yes", evidence: ["docs/architecture.md"] },
  };
}

// A one-container service with an architecture section. `components` maps each component id to
// its code ids, and `imports` lists [from, to] pairs of code ids.
function service({ components, imports, answers = allYes() }) {
  return {
    system: { id: "svc", name: "Service" },
    containers: [{ id: "app", name: "App" }],
    components: Object.keys(components).map((id) => ({ id, name: id, container: "app" })),
    code: Object.entries(components).flatMap(([component, ids]) =>
      ids.map((id) => ({ id, name: id, component })),
    ),
    relationships: imports.map(([from, to]) => ({ from, to })),
    architecture: {
      convention: "Node service, one folder per component, from the README",
      answers,
    },
  };
}

// 4 components and 10 code elements, each code element in a relationship, and no cycle.
function gradedModel(answers = allYes()) {
  return service({
    components: {
      http: ["http/server", "http/routes"],
      orders: ["orders/service", "orders/rules", "orders/total"],
      billing: ["billing/invoice", "billing/tax"],
      store: ["store/repo", "store/pool", "store/migrate"],
    },
    imports: [
      ["http/server", "http/routes"],
      ["http/routes", "orders/service"],
      ["orders/service", "orders/rules"],
      ["orders/service", "orders/total"],
      ["orders/service", "billing/invoice"],
      ["billing/invoice", "billing/tax"],
      ["billing/invoice", "store/repo"],
      ["store/repo", "store/pool"],
      ["store/migrate", "store/pool"],
    ],
    answers,
  });
}

// Components c1, c2, ... hold code elements f1, f2, ... in consecutive blocks of near-equal size.
// The first `code - unconnected` code elements import one another in one chain, so the component
// graph is a chain with no cycle, and the last `unconnected` have no relationship. `imports` adds
// [from, to] pairs, such as a back edge that closes a cycle.
function layout({ components, code, unconnected = 0, imports = [] }) {
  const ids = Array.from({ length: code }, (_, index) => `f${index + 1}`);
  const blocks = Object.fromEntries(
    Array.from({ length: components }, (_, index) => [`c${index + 1}`, []]),
  );
  ids.forEach((id, index) => blocks[`c${Math.floor((index * components) / code) + 1}`].push(id));
  const linked = ids.slice(0, code - unconnected);
  const chain = linked.slice(1).map((id, index) => [linked[index], id]);
  return service({ components: blocks, imports: [...chain, ...imports] });
}

// A service whose components each name a layer. `components` maps each component id to its
// `layer` and its `code` ids; `layers` lists the layers outermost first.
function layered({ layers, components, imports, answers = allYes() }) {
  const model = service({
    components: Object.fromEntries(Object.entries(components).map(([id, { code }]) => [id, code])),
    imports,
    answers,
  });
  model.architecture.layers = layers;
  for (const component of model.components) component.layer = components[component.id].layer;
  return model;
}

// gradedModel with layers web, domain, and data, outermost first.
function layeredModel() {
  return layered({
    layers: ["web", "domain", "data"],
    components: {
      http: { layer: "web", code: ["http/server", "http/routes"] },
      orders: { layer: "domain", code: ["orders/service", "orders/rules", "orders/total"] },
      billing: { layer: "domain", code: ["billing/invoice", "billing/tax"] },
      store: { layer: "data", code: ["store/repo", "store/pool", "store/migrate"] },
    },
    imports: [
      ["http/server", "http/routes"],
      ["http/routes", "orders/service"],
      ["orders/service", "orders/rules"],
      ["orders/service", "orders/total"],
      ["orders/service", "billing/invoice"],
      ["billing/invoice", "billing/tax"],
      ["billing/invoice", "store/repo"],
      ["store/repo", "store/pool"],
      ["store/migrate", "store/pool"],
    ],
  });
}

// Layers web (w1, w2) and domain (d1, d2), outermost first. Every code element already has a
// relationship inside its layer; `crossing` lists the [from, to] pairs between the layers.
function twoLayers(crossing) {
  return layered({
    layers: ["web", "domain"],
    components: {
      w1: { layer: "web", code: ["w1/a", "w1/b"] },
      w2: { layer: "web", code: ["w2/a", "w2/b"] },
      d1: { layer: "domain", code: ["d1/a", "d1/b", "d1/c"] },
      d2: { layer: "domain", code: ["d2/a", "d2/b", "d2/c"] },
    },
    imports: [
      ["w1/a", "w1/b"],
      ["w1/b", "w2/a"],
      ["w2/a", "w2/b"],
      ["d1/a", "d1/b"],
      ["d1/a", "d1/c"],
      ["d2/a", "d2/b"],
      ["d2/a", "d2/c"],
      ...crossing,
    ],
  });
}

// Five components of 2 code elements each, in layers web, domain, and data. Every cross-layer
// relationship points inward, and no instability rises along an edge. `imports` adds pairs.
function domainModel({ imports = [], answers = allYes() } = {}) {
  return layered({
    layers: ["web", "domain", "data"],
    components: {
      web: { layer: "web", code: ["web/page", "web/form"] },
      orders: { layer: "domain", code: ["orders/service", "orders/rules"] },
      billing: { layer: "domain", code: ["billing/service", "billing/rules"] },
      store: { layer: "data", code: ["store/repo", "store/query"] },
      db: { layer: "data", code: ["db/pool", "db/migrate"] },
    },
    imports: [
      ["web/page", "web/form"],
      ["web/form", "orders/service"],
      ["web/page", "billing/service"],
      ["orders/service", "orders/rules"],
      ["orders/rules", "billing/rules"],
      ["orders/service", "store/repo"],
      ["billing/service", "billing/rules"],
      ["billing/rules", "store/query"],
      ["store/repo", "store/query"],
      ["store/query", "db/pool"],
      ["db/pool", "db/migrate"],
      ...imports,
    ],
    answers,
  });
}

// Writes the model, builds it, and returns stdout. A graded or withheld build both exit 0.
function stdoutOf(t, model) {
  const dir = scratch(t);
  const modelPath = join(dir, "c4-model.json");
  writeFileSync(modelPath, JSON.stringify(model));
  const result = run(modelPath, join(dir, "site"));
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function assertHasLine(stdout, line) {
  assert.ok(
    stdout.split("\n").includes(line),
    `stdout has no line ${JSON.stringify(line)}:\n${stdout}`,
  );
}

const capLines = (stdout) => stdout.split("\n").filter((line) => line.startsWith("  cap "));

// Lower is better, so a comparison reads as "no worse than".
const RANK = Object.freeze({ A: 0, B: 1, C: 2, D: 3, F: 4 });

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

test("ids may be framework route paths but never hold whitespace", () => {
  const routes = model();
  routes.code.push({
    id: "app/join/[code]/(group)/@slot/page.tsx",
    name: "page",
    component: "web.ui",
  });
  routes.relationships.push({ from: "app/join/[code]/(group)/@slot/page.tsx", to: "ui/Page" });
  assert.deepEqual(validateModel(routes), []);
  routes.code.push({ id: "has space", name: "Spaced", component: "web.ui" });
  assert.ok(
    validateModel(routes).some((e) => /code\[6\]\.id: missing, or holds whitespace/.test(e)),
  );
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
      "grade: none (the model has no architecture section)",
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
  assert.match(result.stderr, /\nsee \/.+\/visualizing-codebases\/SKILL\.md\n$/);
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

// Architecture section and grade lines.

const SECTION_ERRORS = [
  {
    label: "architecture is not an object",
    change: (model) => {
      model.architecture = [];
    },
    errors: ["architecture: not an object"],
  },
  {
    label: "convention is missing",
    change: (model) => {
      delete model.architecture.convention;
    },
    errors: ["architecture.convention: missing; name the convention the grade judges against"],
  },
  {
    label: "convention is empty",
    change: (model) => {
      model.architecture.convention = "";
    },
    errors: ["architecture.convention: missing; name the convention the grade judges against"],
  },
  {
    label: "convention is not a string",
    change: (model) => {
      model.architecture.convention = 42;
    },
    errors: ["architecture.convention: missing; name the convention the grade judges against"],
  },
  {
    label: "answers is missing",
    change: (model) => {
      delete model.architecture.answers;
    },
    errors: ["architecture.answers: missing, or not an object"],
  },
  {
    label: "answers is not an object",
    change: (model) => {
      model.architecture.answers = [];
    },
    errors: ["architecture.answers: missing, or not an object"],
  },
  {
    label: "a question that forbids n/a has no answer",
    change: (model) => {
      delete model.architecture.answers["rules-checked"];
    },
    errors: ["architecture.answers.rules-checked: missing; answer yes or no with evidence"],
  },
  {
    label: "a question that allows n/a has no answer",
    change: (model) => {
      delete model.architecture.answers["docs-match"];
    },
    errors: ["architecture.answers.docs-match: missing; answer yes, no, or n/a with evidence"],
  },
  {
    label: "an unknown question id",
    change: (model) => {
      model.architecture.answers.layering = { answer: "yes", evidence: ["README.md"] };
    },
    errors: ["architecture.answers.layering: not a grading question id"],
  },
  {
    label: "a __proto__ question id",
    change: (model) => {
      model.architecture.answers = {
        ...allYes(),
        ...JSON.parse('{"__proto__": {"answer": "yes", "evidence": ["README.md"]}}'),
      };
    },
    errors: ["architecture.answers.__proto__: not a grading question id"],
  },
  {
    label: "an answer outside yes, no, and n/a",
    change: (model) => {
      model.architecture.answers["public-entry"].answer = "maybe";
    },
    errors: [
      'architecture.answers.public-entry.answer: "maybe" is not allowed; answer yes or no with evidence',
    ],
  },
  {
    label: "n/a on a question that forbids it",
    change: (model) => {
      model.architecture.answers["single-purpose"].answer = "n/a";
    },
    errors: [
      'architecture.answers.single-purpose.answer: "n/a" is not allowed; answer yes or no with evidence',
    ],
  },
  {
    label: "evidence is missing",
    change: (model) => {
      delete model.architecture.answers["public-entry"].evidence;
    },
    errors: [
      "architecture.answers.public-entry.evidence: missing, or not a list of one or more files or facts",
    ],
  },
  {
    label: "evidence is an empty list",
    change: (model) => {
      model.architecture.answers["public-entry"].evidence = [];
    },
    errors: [
      "architecture.answers.public-entry.evidence: missing, or not a list of one or more files or facts",
    ],
  },
  {
    label: "evidence holds a non-string",
    change: (model) => {
      model.architecture.answers["public-entry"].evidence = [42];
    },
    errors: ["architecture.answers.public-entry.evidence[0]: empty, or not a string"],
  },
  {
    label: "evidence holds an empty string",
    change: (model) => {
      model.architecture.answers["public-entry"].evidence = ["src/orders/index.js", ""];
    },
    errors: ["architecture.answers.public-entry.evidence[1]: empty, or not a string"],
  },
  {
    label: "an extra key inside architecture is ignored",
    change: (model) => {
      model.architecture.notes = "drawn from the README";
    },
    errors: [],
  },
  {
    label: "an extra key inside an answer is ignored",
    change: (model) => {
      model.architecture.answers["public-entry"].confidence = "high";
    },
    errors: [],
  },
];

for (const row of SECTION_ERRORS)
  test(`validateModel names each architecture section error in one sentence with its JSON path: ${row.label}`, () => {
    const broken = gradedModel();
    row.change(broken);
    assert.deepEqual(validateModel(broken), row.errors);
  });

const GRADE_LINES = [
  {
    label: "3 components give no letter",
    model: () => layout({ components: 3, code: 12 }),
    line: "grade: none (fewer than 4 components)",
  },
  {
    label: "4 components are graded",
    model: () => layout({ components: 4, code: 12 }),
    line: "  acyclic-components A: 0 of 4 components in a cycle (0.0%)",
  },
  {
    label: "9 code elements give no letter",
    model: () => layout({ components: 5, code: 9 }),
    line: "grade: none (fewer than 10 code elements)",
  },
  {
    label: "10 code elements are graded",
    model: () => layout({ components: 5, code: 10 }),
    line: "  acyclic-code A: 0 of 10 code elements in a cycle (0.0%)",
  },
  {
    label: "exactly half of the code elements unconnected is graded",
    model: () => layout({ components: 4, code: 10, unconnected: 5 }),
    line: "  acyclic-code A: 0 of 10 code elements in a cycle (0.0%)",
  },
  {
    label: "one more than half of the code elements unconnected gives no letter",
    model: () => layout({ components: 4, code: 10, unconnected: 6 }),
    line: "grade: none (more than half of the code elements have no relationship, so the imports look incomplete)",
  },
  {
    label: "0% of components in a cycle is an A",
    model: () => layout({ components: 8, code: 16 }),
    line: "  acyclic-components A: 0 of 8 components in a cycle (0.0%)",
  },
  {
    label: "2 of 8 components in a cycle sit on the C edge",
    model: () => layout({ components: 8, code: 16, imports: [["f3", "f1"]] }),
    line: "  acyclic-components C: 2 of 8 components in a cycle (25.0%)",
  },
  {
    label: "3 of 30 code elements in a cycle sit on the B edge",
    model: () => layout({ components: 4, code: 30, imports: [["f3", "f1"]] }),
    line: "  acyclic-code B: 3 of 30 code elements in a cycle (10.0%)",
  },
  {
    label: "2 of 3 boundaries answers yes is a B",
    model: () =>
      gradedModel({
        ...allYes(),
        "explicit-contracts": {
          answer: "no",
          evidence: ["src/http/routes.js reads billing tables"],
        },
      }),
    line: "  boundaries B: 2 of 3 answers yes",
  },
  {
    label: "an n/a answer leaves the share",
    model: () =>
      gradedModel({
        ...allYes(),
        "one-writer-per-store": { answer: "n/a", evidence: ["the service owns no datastore"] },
        "explicit-contracts": {
          answer: "no",
          evidence: ["src/http/routes.js reads billing tables"],
        },
      }),
    line: "  boundaries C: 1 of 2 answers yes",
  },
  {
    label: "a judged criterion with every answer n/a",
    model: () =>
      gradedModel({
        ...allYes(),
        "framework-free-core": { answer: "n/a", evidence: ["no business core: a CRUD proxy"] },
        "core-owns-ports": { answer: "n/a", evidence: ["no business core: a CRUD proxy"] },
        "rules-in-core": { answer: "n/a", evidence: ["no business core: a CRUD proxy"] },
      }),
    line: "  core-isolation n/a: every answer is n/a",
  },
];

for (const row of GRADE_LINES)
  test(`the build prints each criterion line and each withhold reason at its boundary: ${row.label}`, (t) => {
    assertHasLine(stdoutOf(t, row.model()), row.line);
  });

const LETTER_SCALE = [
  {
    label: "a mean of 350 is an A",
    criteria: [
      { weight: 20, points: 400 },
      { weight: 10, points: 250 },
    ],
    result: { letter: "A", points: 350 },
  },
  {
    label: "a mean of 349 is a B",
    criteria: [
      { weight: 20, points: 400 },
      { weight: 10, points: 247 },
    ],
    result: { letter: "B", points: 349 },
  },
  {
    label: "a mean of 250 is a B",
    criteria: [
      { weight: 10, points: 300 },
      { weight: 10, points: 200 },
    ],
    result: { letter: "B", points: 250 },
  },
  {
    label: "a mean of 249 is a C",
    criteria: [
      { weight: 10, points: 300 },
      { weight: 10, points: 198 },
    ],
    result: { letter: "C", points: 249 },
  },
  {
    label: "a mean of 150 is a C",
    criteria: [
      { weight: 10, points: 200 },
      { weight: 10, points: 100 },
    ],
    result: { letter: "C", points: 150 },
  },
  {
    label: "a mean of 149 is a D",
    criteria: [
      { weight: 10, points: 200 },
      { weight: 10, points: 98 },
    ],
    result: { letter: "D", points: 149 },
  },
  {
    label: "a mean of 50 is a D",
    criteria: [
      { weight: 10, points: 100 },
      { weight: 10, points: 0 },
    ],
    result: { letter: "D", points: 50 },
  },
  {
    label: "a mean of 49 is an F",
    criteria: [
      { weight: 10, points: 98 },
      { weight: 10, points: 0 },
    ],
    result: { letter: "F", points: 49 },
  },
  {
    label: "a weighted mean of 349.67 floors to 349, a B",
    criteria: [
      { weight: 1, points: 349 },
      { weight: 2, points: 350 },
    ],
    result: { letter: "B", points: 349 },
  },
  {
    label: "a criterion with null points leaves the mean",
    criteria: [
      { weight: 20, points: 400 },
      { weight: 10, points: null },
    ],
    result: { letter: "A", points: 400 },
  },
];

for (const row of LETTER_SCALE)
  test(`combine maps weighted criterion points to the letter scale: ${row.label}`, () => {
    assert.deepEqual(combine(row.criteria), row.result);
  });

// Layers: the Dependency Rule and stable dependencies.

const LAYER_ERRORS = [
  {
    label: "layers is not an array",
    base: layeredModel,
    change: (model) => {
      model.architecture.layers = "web, domain, data";
    },
    errors: ["architecture.layers: not an array"],
  },
  {
    label: "layers has fewer than two names",
    base: layeredModel,
    change: (model) => {
      model.architecture.layers = ["web"];
    },
    errors: ["architecture.layers: fewer than two names"],
  },
  {
    label: "layers repeats a name",
    base: layeredModel,
    change: (model) => {
      model.architecture.layers = ["web", "domain", "data", "web"];
    },
    errors: ['architecture.layers[3]: "web" is listed twice'],
  },
  {
    label: "layers holds a non-string name",
    base: layeredModel,
    change: (model) => {
      model.architecture.layers = ["web", 7, "domain", "data"];
    },
    errors: ["architecture.layers[1]: empty, or not a string"],
  },
  {
    label: "layers holds an empty name",
    base: layeredModel,
    change: (model) => {
      model.architecture.layers = ["web", "", "domain", "data"];
    },
    errors: ["architecture.layers[1]: empty, or not a string"],
  },
  {
    label: "a component layer is not a string",
    base: layeredModel,
    change: (model) => {
      model.components[2].layer = 3;
    },
    errors: ["components[2].layer: not a string"],
  },
  {
    label: "a component layer is not in layers",
    base: layeredModel,
    change: (model) => {
      model.components[3].layer = "infra";
    },
    errors: ['components[3].layer: "infra" is not in architecture.layers'],
  },
  {
    label: "a component layer is missing when layers is set",
    base: layeredModel,
    change: (model) => {
      delete model.components[1].layer;
    },
    errors: ["components[1].layer: missing; architecture.layers is set"],
  },
  {
    label: "a component layer is set when layers is absent",
    base: gradedModel,
    change: (model) => {
      model.components[2].layer = "domain";
    },
    errors: ["components[2].layer: set, but the model has no architecture.layers"],
  },
  {
    label: "a component layer is set in a model with no architecture section",
    base: model,
    change: (model) => {
      model.components[0].layer = "web";
    },
    errors: ["components[0].layer: set, but the model has no architecture.layers"],
  },
];

for (const row of LAYER_ERRORS)
  test(`validateModel names each layer error in one sentence with its JSON path: ${row.label}`, () => {
    const broken = row.base();
    row.change(broken);
    assert.deepEqual(validateModel(broken), row.errors);
  });

const LAYER_LINES = [
  {
    label: "merged counts weight the outward share",
    model: () =>
      twoLayers([
        ["w1/a", "d1/a"],
        ["w1/b", "d1/a"],
        ["w1/b", "d1/b"],
        ["d2/b", "w2/b"],
      ]),
    line: "  dependency-direction F: 1 of 4 cross-layer relationships point outward (25.0%)",
  },
  {
    label: "0% outward is an A",
    model: () =>
      twoLayers([
        ["w1/a", "d1/a"],
        ["w1/b", "d1/a"],
        ["w1/b", "d1/b"],
        ["w2/b", "d2/b"],
      ]),
    line: "  dependency-direction A: 0 of 4 cross-layer relationships point outward (0.0%)",
  },
  {
    label: "1 of 20 outward sits on the C edge",
    model: () => twoLayers([...Array(19).fill(["w1/a", "d1/a"]), ["d2/b", "w2/b"]]),
    line: "  dependency-direction C: 1 of 20 cross-layer relationships point outward (5.0%)",
  },
  {
    label: "no layers",
    model: () => gradedModel(),
    line: "  dependency-direction n/a: the model sets no layers",
  },
  {
    label: "layers with no relationship between them",
    model: () => twoLayers([]),
    line: "  dependency-direction n/a: no relationship crosses layers",
  },
  {
    label: "an edge between two components of equal instability is not a violation",
    model: () => layout({ components: 4, code: 10 }),
    line: "  stable-dependencies A: 0 of 3 component dependencies point to a less stable component (0.0%)",
  },
  {
    label: "a merged count of 5 counts one neighbor, as a count of 1 does",
    model: () =>
      service({
        components: {
          v: ["v/a", "v/b"],
          w: ["w/a", "w/b"],
          x: ["x/a", "x/b"],
          y: ["y/a", "y/b"],
          z: ["z/a", "z/b"],
        },
        imports: [
          ["v/a", "v/b"],
          ["v/b", "x/a"],
          ["x/a", "x/b"],
          ["x/b", "y/a"],
          ["w/a", "w/b"],
          ["w/b", "y/a"],
          ["y/a", "y/b"],
          ...Array(5).fill(["y/b", "z/a"]),
          ["z/a", "z/b"],
        ],
      }),
    line: "  stable-dependencies A: 0 of 4 component dependencies point to a less stable component (0.0%)",
  },
  {
    label: "no dependency between two components",
    model: () =>
      service({
        components: {
          c1: ["c1/a", "c1/b", "c1/c"],
          c2: ["c2/a", "c2/b", "c2/c"],
          c3: ["c3/a", "c3/b"],
          c4: ["c4/a", "c4/b"],
        },
        imports: [
          ["c1/a", "c1/b"],
          ["c1/a", "c1/c"],
          ["c2/a", "c2/b"],
          ["c2/a", "c2/c"],
          ["c3/a", "c3/b"],
          ["c4/a", "c4/b"],
        ],
      }),
    line: "  stable-dependencies n/a: no dependency joins two components",
  },
];

for (const row of LAYER_LINES)
  test(`the build prints dependency-direction and stable-dependencies lines at their boundaries: ${row.label}`, (t) => {
    assertHasLine(stdoutOf(t, row.model()), row.line);
  });

// Cycle caps.

// Two containers whose code calls each other through different components, so the containers
// form a cycle and the components do not.
function containerCycle() {
  return {
    system: { id: "shop", name: "Shop" },
    containers: [
      { id: "web", name: "Web" },
      { id: "api", name: "API" },
    ],
    components: [
      { id: "web.pages", name: "Pages", container: "web" },
      { id: "web.client", name: "Client", container: "web" },
      { id: "api.orders", name: "Orders", container: "api" },
      { id: "api.events", name: "Events", container: "api" },
    ],
    code: [
      { id: "pages/home", name: "home", component: "web.pages" },
      { id: "pages/cart", name: "cart", component: "web.pages" },
      { id: "pages/checkout", name: "checkout", component: "web.pages" },
      { id: "client/http", name: "http", component: "web.client" },
      { id: "client/socket", name: "socket", component: "web.client" },
      { id: "orders/routes", name: "routes", component: "api.orders" },
      { id: "orders/service", name: "service", component: "api.orders" },
      { id: "orders/repo", name: "repo", component: "api.orders" },
      { id: "events/publisher", name: "publisher", component: "api.events" },
      { id: "events/hub", name: "hub", component: "api.events" },
    ],
    relationships: [
      { from: "pages/home", to: "pages/cart" },
      { from: "pages/cart", to: "pages/checkout" },
      { from: "pages/checkout", to: "orders/routes" },
      { from: "orders/routes", to: "orders/service" },
      { from: "orders/service", to: "orders/repo" },
      { from: "events/publisher", to: "events/hub" },
      { from: "events/hub", to: "client/socket" },
      { from: "client/socket", to: "client/http" },
    ],
    architecture: { convention: "React web app and Node API, from the README", answers: allYes() },
  };
}

const CAP_LINES = [
  {
    label: "a container cycle caps the letter at C",
    model: containerCycle,
    caps: ["  cap container-cycle C: a cycle joins containers (cycle-1)"],
  },
  {
    label: "component cycles cap the letter at B",
    model: () =>
      layout({
        components: 6,
        code: 12,
        imports: [
          ["f3", "f1"],
          ["f9", "f7"],
        ],
      }),
    caps: ["  cap component-cycle B: a cycle joins components (cycle-1, cycle-2)"],
  },
  {
    label: "one cycle that holds exactly half of the components is not tangled",
    model: () => layout({ components: 6, code: 12, imports: [["f5", "f1"]] }),
    caps: ["  cap component-cycle B: a cycle joins components (cycle-1)"],
  },
  {
    label: "one cycle that holds one more than half of the components is tangled",
    model: () => layout({ components: 6, code: 12, imports: [["f7", "f1"]] }),
    caps: [
      "  cap component-cycle B: a cycle joins components (cycle-1)",
      "  cap tangled-components D: cycle-1 holds 4 of 6 components",
    ],
  },
];

for (const row of CAP_LINES)
  test(`the build prints a cap line for each cycle cap that fires: ${row.label}`, (t) => {
    assert.deepEqual(capLines(stdoutOf(t, row.model())), row.caps);
  });

// In each row, `better` has one criterion with more points, or one cap fewer, than `worse`.
const MONOTONE = [
  {
    label: "a measured criterion rises from D to B",
    better: {
      criteria: [
        { weight: 20, points: 300 },
        { weight: 10, points: 400 },
        { weight: 10, points: 200 },
      ],
      caps: [],
    },
    worse: {
      criteria: [
        { weight: 20, points: 100 },
        { weight: 10, points: 400 },
        { weight: 10, points: 200 },
      ],
      caps: [],
    },
  },
  {
    label: "a judged criterion rises past a letter edge",
    better: {
      criteria: [
        { weight: 10, points: 400 },
        { weight: 20, points: 300 },
      ],
      caps: [],
    },
    worse: {
      criteria: [
        { weight: 10, points: 266 },
        { weight: 20, points: 300 },
      ],
      caps: [],
    },
  },
  {
    label: "a criterion rises beside an n/a criterion",
    better: {
      criteria: [
        { weight: 20, points: 400 },
        { weight: 5, points: null },
        { weight: 10, points: 200 },
      ],
      caps: [],
    },
    worse: {
      criteria: [
        { weight: 20, points: 300 },
        { weight: 5, points: null },
        { weight: 10, points: 200 },
      ],
      caps: [],
    },
  },
  {
    label: "a criterion rises under a C cap",
    better: {
      criteria: [
        { weight: 20, points: 400 },
        { weight: 10, points: 400 },
      ],
      caps: [{ letter: "C" }],
    },
    worse: {
      criteria: [
        { weight: 20, points: 0 },
        { weight: 10, points: 400 },
      ],
      caps: [{ letter: "C" }],
    },
  },
  {
    label: "a B cap is added to an A mean",
    better: { criteria: [{ weight: 20, points: 400 }], caps: [] },
    worse: { criteria: [{ weight: 20, points: 400 }], caps: [{ letter: "B" }] },
  },
  {
    label: "a D cap is added to an F mean",
    better: { criteria: [{ weight: 20, points: 0 }], caps: [] },
    worse: { criteria: [{ weight: 20, points: 0 }], caps: [{ letter: "D" }] },
  },
  {
    label: "a B cap is added beside a C cap",
    better: { criteria: [{ weight: 20, points: 400 }], caps: [{ letter: "C" }] },
    worse: { criteria: [{ weight: 20, points: 400 }], caps: [{ letter: "C" }, { letter: "B" }] },
  },
];

for (const row of MONOTONE)
  test(`combine never falls when one criterion's points rise and never rises when a cap is added: ${row.label}`, () => {
    const better = combine(row.better.criteria, row.better.caps);
    const worse = combine(row.worse.criteria, row.worse.caps);
    assert.ok(
      RANK[better.letter] <= RANK[worse.letter],
      `better inputs give ${better.letter}, worse inputs give ${worse.letter}`,
    );
    assert.ok(
      better.points >= worse.points,
      `better inputs give ${better.points} points, worse inputs give ${worse.points}`,
    );
  });

test("a back edge that closes a same-layer component cycle never raises the grade", () => {
  const base = buildViews(domainModel()).grade;
  const cyclic = buildViews(
    domainModel({ imports: [["billing/service", "orders/service"]] }),
  ).grade;
  assert.equal(base?.letter, "A");
  assert.ok(RANK[cyclic?.letter] >= RANK.B, `the cyclic model grades ${cyclic?.letter}`);
});
