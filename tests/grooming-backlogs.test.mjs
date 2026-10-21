// Fails when a grooming-backlogs script stops refusing bad arguments before any gh call,
// grooms a partial or multi-repository board, loses the link-field retry, miscounts a
// gap-inventory row or a link cycle, moves a card that changed since the load or past the
// WIP limit, draws a self, backwards, or cycle-closing link, closes an issue someone is
// still discussing, re-posts an evidence comment on a re-run, or reports a write as
// landed without reading it back.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { gapInventory } from "../skills/engineering/grooming-backlogs/scripts/gap-inventory.mjs";
import { readySlots } from "../skills/engineering/grooming-backlogs/scripts/ready-slots.mjs";

const SCRIPTS = resolve("skills/engineering/grooming-backlogs/scripts");
const BASH = spawnSync("bash", ["-c", "command -v bash"], { encoding: "utf8" }).stdout.trim();
// Every external command the shell scripts run besides `gh`.
const TOOLS = ["jq", "wc", "tr", "rm"];
const REPO = "acme/api";

function scratch(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "grooming-backlogs-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function realPath(tool) {
  const found = spawnSync(BASH, ["-c", `command -v ${tool}`], { encoding: "utf8" }).stdout.trim();
  assert.ok(found, `test host lacks ${tool}`);
  return found;
}

// A fake `gh` that logs each call's argv as one JSON line and answers from `routes`: the
// first route whose `match` regex matches the space-joined argv replies. A route with
// several replies gives them in call order and then repeats its last. An unmatched call
// exits 99, so an unexpected gh call fails the test.
const FAKE_GH = `#!${process.execPath}
const fs = require("node:fs");
const args = process.argv.slice(2);
const dir = process.env.FAKE_GH_DIR;
fs.appendFileSync(dir + "/gh.log", JSON.stringify(args) + "\\n");
const routes = JSON.parse(fs.readFileSync(dir + "/routes.json", "utf8"));
const joined = args.join(" ");
const index = routes.findIndex((route) => new RegExp(route.match).test(joined));
if (index < 0) {
  process.stderr.write("fake gh: no route for: " + joined + "\\n");
  process.exit(99);
}
const counter = dir + "/count-" + index;
const seen = fs.existsSync(counter) ? Number(fs.readFileSync(counter, "utf8")) : 0;
fs.writeFileSync(counter, String(seen + 1));
const replies = routes[index].replies;
const reply = replies[Math.min(seen, replies.length - 1)];
const out = reply.stdout ?? "";
process.stdout.write(typeof out === "string" ? out : JSON.stringify(out));
process.stderr.write(reply.stderr ?? "");
process.exit(reply.exit ?? 0);
`;

function reply(stdout, extra = {}) {
  return { replies: [{ stdout, ...extra }] };
}

// A run cache directory and a PATH holding `tools` plus the fake gh.
function setup(t, { tools = TOOLS, routes = [], files = {} } = {}) {
  const dir = scratch(t);
  const bin = join(dir, "bin");
  const fake = join(dir, "fake");
  const runDir = join(dir, "run");
  for (const sub of [bin, fake, runDir]) mkdirSync(sub);
  for (const tool of tools) symlinkSync(realPath(tool), join(bin, tool));
  writeFileSync(join(bin, "gh"), FAKE_GH);
  chmodSync(join(bin, "gh"), 0o755);
  writeFileSync(join(fake, "gh.log"), "");
  writeFileSync(join(fake, "routes.json"), JSON.stringify(routes));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(
      join(runDir, name),
      typeof content === "string" ? content : JSON.stringify(content),
    );
  }
  return { dir, bin, fake, runDir };
}

function run(env, script, args) {
  const result = spawnSync(BASH, [join(SCRIPTS, script), ...args], {
    encoding: "utf8",
    env: { PATH: env.bin, FAKE_GH_DIR: env.fake },
  });
  const ghCalls = readFileSync(join(env.fake, "gh.log"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  return { ...result, ghCalls, lines: result.stdout.split("\n").filter(Boolean) };
}

function runNode(script, args) {
  return spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { encoding: "utf8" });
}

const readJsonFile = (path) => JSON.parse(readFileSync(path, "utf8"));

// --- fixtures -------------------------------------------------------------------------

function item(number, status, extra = {}) {
  return {
    id: `PVTI_${number}`,
    status,
    content: { type: "Issue", number, repository: REPO, title: `Issue ${number}` },
    ...extra,
  };
}

function boardOf(items) {
  return { items, totalCount: items.length };
}

const BOARD = boardOf([
  item(9, "Ready", { priority: "P1", estimate: 3 }),
  item(12, "Backlog", { priority: "P2" }),
  item(15, "Backlog"),
  item(20, "In progress", { priority: "P1" }),
]);

function link(number, state = "OPEN", repo = REPO) {
  return {
    id: `I_${number}`,
    number,
    state,
    title: `Issue ${number}`,
    url: `https://github.com/${repo}/issues/${number}`,
  };
}

function links(nodes, totalCount = nodes.length) {
  return { nodes, totalCount };
}

function issue(number, extra = {}) {
  return {
    number,
    title: `Issue ${number}`,
    body: `Body of ${number}`,
    state: "OPEN",
    labels: [{ name: "enhancement" }],
    milestone: null,
    assignees: [],
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-02T00:00:00Z",
    blockedBy: links([]),
    blocking: links([]),
    parent: null,
    subIssues: links([]),
    ...extra,
  };
}

// --- load-board.sh --------------------------------------------------------------------

function loadRoutes({ board = BOARD, issues, fullThread = [] } = {}) {
  return [
    { match: "^project item-list 5 --owner \\S+ ", ...reply(board) },
    { match: "^api user --jq .login$", ...reply("acme-bot\n") },
    { match: "^issue list --repo acme/api ", ...reply(issues ?? [issue(9), issue(12)]) },
    {
      match: "^api --paginate repos/acme/api/milestones\\?state=all&per_page=100 --jq .\\[\\]$",
      ...reply('{"number":1,"title":"M1"}\n{"number":2,"title":"M2"}\n'),
    },
    ...fullThread.map((n) => ({
      match: `^api repos/acme/api/issues/${n}/comments\\?per_page=100$`,
      ...reply(Array.from({ length: 100 }, (_, i) => ({ id: i }))),
    })),
    { match: "^api repos/acme/api/issues/\\d+/comments\\?per_page=100$", ...reply([]) },
  ];
}

test("load-board.sh refuses bad arguments with 64 before any gh call", (t) => {
  for (const args of [
    [],
    ["RUN", "5"],
    ["RUN", "five", "acme"],
    ["RUN", "5", "-acme"],
    ["RUN", "5", "acme", "--issue"],
    ["RUN", "5", "acme", "--issue", "12x"],
    ["RUN", "5", "acme", "--promote", "12"],
    ["/nonexistent/run", "5", "acme"],
  ]) {
    const env = setup(t);
    const resolved = args.map((arg) => (arg === "RUN" ? env.runDir : arg));
    const result = run(env, "load-board.sh", resolved);
    assert.equal(result.status, 64, JSON.stringify(args));
    assert.deepEqual(result.ghCalls, []);
  }
});

test("load-board.sh exits 69 naming a missing jq before any gh call", (t) => {
  const env = setup(t, { tools: TOOLS.filter((tool) => tool !== "jq") });
  const result = run(env, "load-board.sh", [env.runDir, "5", "acme"]);
  assert.equal(result.status, 69);
  assert.match(result.stderr, /missing required tool: jq/);
  assert.deepEqual(result.ghCalls, []);
});

test("load-board.sh loads the board, milestones, issues, and comments, recording partial reads", (t) => {
  const issues = [
    issue(9, { blockedBy: links([link(12)], 2) }),
    issue(12),
    issue(15, { subIssues: links([], 1) }),
  ];
  const env = setup(t, { routes: loadRoutes({ issues, fullThread: [12] }) });
  const result = run(env, "load-board.sh", [env.runDir, "5", "acme"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.lines, [
    "repo acme/api",
    "login acme-bot",
    "board-items 4",
    "issues 3",
    "links loaded",
    "unloaded-links 2",
    "unloaded-threads 1",
  ]);
  assert.deepEqual(readJsonFile(join(env.runDir, "board.json")), BOARD);
  assert.deepEqual(readJsonFile(join(env.runDir, "issues.json")), issues);
  assert.deepEqual(readJsonFile(join(env.runDir, "milestones.json")), [
    { number: 1, title: "M1" },
    { number: 2, title: "M2" },
  ]);
  assert.equal(readFileSync(join(env.runDir, "unloaded-links.txt"), "utf8"), "9\n15\n");
  assert.equal(readFileSync(join(env.runDir, "unloaded-threads.txt"), "utf8"), "12\n");
  for (const n of [9, 12, 15]) assert.ok(existsSync(join(env.runDir, `comments-${n}.json`)));
  assert.ok(!existsSync(join(env.runDir, "milestones.raw")));
  assert.deepEqual(result.ghCalls[0], [
    "project",
    "item-list",
    "5",
    "--owner",
    "acme",
    "--format",
    "json",
    "--limit",
    "10000",
  ]);
  const list = result.ghCalls.find((call) => call[0] === "issue");
  assert.deepEqual(list, [
    "issue",
    "list",
    "--repo",
    "acme/api",
    "--state",
    "open",
    "--limit",
    "1000",
    "--json",
    "number,title,body,state,labels,milestone,assignees,createdAt,updatedAt,blockedBy,blocking,parent,subIssues",
  ]);
});

test("load-board.sh stops with 1 on a partial board and never loads issues", (t) => {
  const env = setup(t, {
    routes: loadRoutes({ board: { items: [item(9, "Ready")], totalCount: 2 } }),
  });
  const result = run(env, "load-board.sh", [env.runDir, "5", "acme"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /partial/);
  assert.equal(result.ghCalls.length, 1);
});

test("load-board.sh stops with 3 when items span repositories or another owner holds the repo", (t) => {
  const multi = boardOf([
    item(9, "Ready"),
    { ...item(3, "Backlog"), content: { type: "Issue", number: 3, repository: "acme/web" } },
  ]);
  let env = setup(t, { routes: loadRoutes({ board: multi }) });
  let result = run(env, "load-board.sh", [env.runDir, "5", "acme"]);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /several repositories[\s\S]*acme\/api\nacme\/web/);

  env = setup(t, { routes: loadRoutes() });
  result = run(env, "load-board.sh", [env.runDir, "5", "globex"]);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /acme\/api is not owned by globex/);

  env = setup(t, { routes: loadRoutes() });
  result = run(env, "load-board.sh", [env.runDir, "5", "@me"]);
  assert.equal(result.status, 3, "@me resolves to acme-bot, not acme");
});

test("load-board.sh exits 4 for a board with no repository items", (t) => {
  const drafts = boardOf([{ id: "PVTI_1", status: "Backlog", content: { type: "DraftIssue" } }]);
  const env = setup(t, { routes: loadRoutes({ board: drafts }) });
  const result = run(env, "load-board.sh", [env.runDir, "5", "acme"]);
  assert.equal(result.status, 4);
});

test("load-board.sh retries once without the link fields and reports links unavailable", (t) => {
  const routes = loadRoutes();
  routes.unshift({
    match: "^issue list .*blockedBy",
    replies: [{ stderr: "Unknown JSON field: blockedBy\n", exit: 1 }],
  });
  const env = setup(t, { routes });
  const result = run(env, "load-board.sh", [env.runDir, "5", "acme"]);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.lines.includes("links unavailable"));
  assert.ok(result.lines.includes("unloaded-links 0"));
  const lists = result.ghCalls.filter((call) => call[0] === "issue");
  assert.equal(lists.length, 2);
  assert.equal(
    lists[1].at(-1),
    "number,title,body,state,labels,milestone,assignees,createdAt,updatedAt",
  );
});

test("load-board.sh stops with 1 when the open-issue list reaches its limit or a read fails", (t) => {
  let env = setup(t, {
    routes: loadRoutes({ issues: Array.from({ length: 1000 }, (_, i) => ({ number: i + 1 })) }),
  });
  let result = run(env, "load-board.sh", [env.runDir, "5", "acme"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /reached 1000/);

  const routes = loadRoutes();
  routes.unshift({ match: "issues/12/comments", replies: [{ stderr: "HTTP 502\n", exit: 1 }] });
  env = setup(t, { routes });
  result = run(env, "load-board.sh", [env.runDir, "5", "acme"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /comments on #12/);
  assert.equal(result.stdout, "");
});

test("load-board.sh --issue loads one issue, its comments, and its body pre-image", (t) => {
  const one = issue(12, { body: "## Problem\n\nNo TTL." });
  const routes = [
    { match: "^project item-list 5 ", ...reply(BOARD) },
    { match: "^api user", ...reply("acme-bot\n") },
    { match: "^issue view 12 --repo acme/api --json ", ...reply(one) },
    { match: "^api repos/acme/api/issues/12/comments", ...reply([{ id: 1, body: "hi" }]) },
  ];
  const env = setup(t, { routes });
  const result = run(env, "load-board.sh", [env.runDir, "5", "acme", "--issue", "12"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.lines.slice(0, 4), [
    "repo acme/api",
    "login acme-bot",
    "board-items 4",
    "issues 1",
  ]);
  assert.deepEqual(readJsonFile(join(env.runDir, "issues.json")), [one]);
  assert.equal(
    readFileSync(join(env.runDir, "original-body-12.md"), "utf8"),
    "## Problem\n\nNo TTL.\n",
  );
  assert.ok(!existsSync(join(env.runDir, "milestones.json")));
  assert.ok(!result.ghCalls.some((call) => call.includes("--paginate")));
});

test("load-board.sh --issue exits 4 when the issue is not on the board", (t) => {
  const env = setup(t, { routes: loadRoutes() });
  const result = run(env, "load-board.sh", [env.runDir, "5", "acme", "--issue", "77"]);
  assert.equal(result.status, 4);
  assert.match(result.stderr, /#77 is not on project 5/);
  assert.ok(!result.ghCalls.some((call) => call[0] === "issue"));
});

// --- ready-slots.mjs and gap-inventory.mjs --------------------------------------------

const SETTINGS = {
  ready: "Ready",
  wip: 5,
  login: "acme-bot",
  inFlight: ["In progress", "In review"],
  priorityField: "priority",
  estimateField: "estimate",
  today: "2026-10-21",
};

const row = (inventory, gap) => inventory.rows.find((r) => r.gap === gap);

test("readySlots counts every card in the column and flags a breach", () => {
  const board = boardOf([
    item(4, "Ready"),
    item(2, "Ready"),
    { id: "PVTI_d", status: "Ready", content: { type: "DraftIssue" } },
    item(7, "Backlog"),
  ]);
  assert.deepEqual(readySlots(board, "Ready", 5), {
    column: "Ready",
    wip: 5,
    count: 3,
    free: 2,
    breach: false,
    cards: [2, 4],
  });
  assert.deepEqual(readySlots(board, "Ready", 2), {
    column: "Ready",
    wip: 2,
    count: 3,
    free: 0,
    breach: true,
    cards: [2, 4],
  });
});

test("gapInventory lists milestone, priority, estimate, and in-flight ownership gaps", () => {
  const board = boardOf([
    item(9, "Ready", { priority: "P1", estimate: 3 }),
    item(12, "Backlog", { priority: "P2" }),
    item(15, "Backlog", { priority: "" }),
    item(20, "In progress", { priority: "P1" }),
    item(21, "In review", { priority: "P1" }),
  ]);
  const issues = [
    issue(9, { milestone: { title: "M1" } }),
    issue(12),
    issue(15),
    issue(20, { assignees: [{ login: "acme-bot" }] }),
    issue(21, { assignees: [{ login: "Acme-Bot" }, { login: "wile" }] }),
    issue(30),
  ];
  const milestones = [
    {
      number: 1,
      state: "open",
      due_on: "2026-10-20T07:00:00Z",
      description: "x",
      open_issues: 2,
      closed_issues: 0,
    },
    {
      number: 2,
      state: "open",
      due_on: "2026-10-21T07:00:00Z",
      description: " ",
      open_issues: 0,
      closed_issues: 4,
    },
    { number: 3, state: "open", due_on: null, description: null, open_issues: 0, closed_issues: 0 },
    {
      number: 4,
      state: "closed",
      due_on: "2020-01-01T00:00:00Z",
      description: "",
      open_issues: 0,
      closed_issues: 0,
    },
  ];
  const inventory = gapInventory({ board, issues, milestones }, SETTINGS);
  assert.equal(inventory.repo, REPO);
  assert.equal(inventory.links, "loaded");
  assert.deepEqual(
    inventory.rows.map((r) => r.gap),
    [
      "no-milestone",
      "no-priority",
      "milestone-past-due",
      "milestone-complete",
      "milestone-undescribed",
      "milestone-empty",
      "no-estimate",
      "in-flight-assigned-to-others",
      "ready-or-in-flight-blocked",
      "link-self",
      "link-cycle",
      "link-to-closed",
      "blocker-off-repo",
      "blocker-off-board",
    ],
  );
  // #30 is open but off the board, so no issue row names it.
  assert.deepEqual(row(inventory, "no-milestone"), {
    gap: "no-milestone",
    count: 4,
    issues: [12, 15, 20, 21],
  });
  assert.deepEqual(row(inventory, "no-priority").issues, [15]);
  assert.deepEqual(row(inventory, "milestone-past-due").milestones, [1]);
  assert.deepEqual(row(inventory, "milestone-complete").milestones, [2]);
  assert.deepEqual(row(inventory, "milestone-undescribed").milestones, [2, 3]);
  assert.deepEqual(row(inventory, "milestone-empty").milestones, [3]);
  assert.deepEqual(row(inventory, "no-estimate"), {
    gap: "no-estimate",
    count: 4,
    issues: [12, 15, 20, 21],
    covered: 1,
    total: 5,
    rollups_meaningful: false,
  });
  assert.deepEqual(row(inventory, "in-flight-assigned-to-others").issues, [21]);
  assert.deepEqual(inventory.ready, {
    column: "Ready",
    wip: 5,
    count: 1,
    free: 4,
    breach: false,
    cards: [9],
  });
});

test("gapInventory finds blocked Ready work, self links, closed links, and off-repo or off-board blockers", () => {
  const board = boardOf([
    item(1, "Ready"),
    item(2, "In review"),
    item(3, "Backlog"),
    item(4, "Backlog"),
    item(5, "Backlog"),
  ]);
  const issues = [
    issue(1, { blockedBy: links([link(3)]) }),
    issue(2, { blockedBy: links([link(40, "OPEN", "acme/web")]) }),
    issue(3, { blockedBy: links([link(99)]), blocking: links([link(1)]) }),
    issue(4, { parent: link(4), blockedBy: links([link(6, "CLOSED")]) }),
    issue(5, { blocking: links([link(8, "CLOSED")]) }),
  ];
  const inventory = gapInventory({ board, issues, milestones: [] }, SETTINGS);
  assert.deepEqual(row(inventory, "ready-or-in-flight-blocked").issues, [1, 2]);
  assert.deepEqual(row(inventory, "link-self").issues, [4]);
  assert.deepEqual(row(inventory, "link-to-closed").issues, [4, 5]);
  assert.deepEqual(row(inventory, "blocker-off-repo").issues, [2]);
  assert.deepEqual(row(inventory, "blocker-off-board").issues, [3]);
  assert.deepEqual(row(inventory, "link-cycle"), {
    gap: "link-cycle",
    count: 0,
    issues: [],
    cycles: [],
  });
});

test("gapInventory reports each blockedBy cycle once, whichever side declared the link", () => {
  const board = boardOf([1, 2, 3, 4, 5, 6, 7].map((n) => item(n, "Backlog")));
  const issues = [
    // 1 -> 2 -> 3 -> 1, a three-issue cycle declared through blockedBy.
    issue(1, { blockedBy: links([link(2)]) }),
    issue(2, { blockedBy: links([link(3)]) }),
    issue(3, { blockedBy: links([link(1)]) }),
    // 4 blocked by 5, and 4 declared as blocking 5: a two-issue cycle.
    issue(4, { blockedBy: links([link(5)]), blocking: links([link(5)]) }),
    issue(5),
    // 6 blocked by 7 alone is a chain, not a cycle.
    issue(6, { blockedBy: links([link(7)]) }),
    issue(7),
  ];
  const inventory = gapInventory({ board, issues, milestones: [] }, SETTINGS);
  assert.deepEqual(row(inventory, "link-cycle"), {
    gap: "link-cycle",
    count: 5,
    issues: [1, 2, 3, 4, 5],
    cycles: [
      [1, 2, 3],
      [4, 5],
    ],
  });
});

test("gapInventory omits the link rows when links were unavailable", () => {
  const linkFields = ["blockedBy", "blocking", "parent", "subIssues"];
  const issues = [issue(9), issue(12)].map((full) =>
    Object.fromEntries(Object.entries(full).filter(([key]) => !linkFields.includes(key))),
  );
  const inventory = gapInventory({ board: BOARD, issues, milestones: [] }, SETTINGS);
  assert.equal(inventory.links, "unavailable");
  assert.ok(!inventory.rows.some((r) => r.gap.startsWith("link-") || r.gap.startsWith("blocker-")));
});

test("gapInventory marks estimate rollups meaningful at a third coverage", () => {
  const board = boardOf([
    item(1, "Backlog", { estimate: 2 }),
    item(2, "Backlog"),
    item(3, "Backlog"),
  ]);
  const inventory = gapInventory(
    { board, issues: [issue(1), issue(2), issue(3)], milestones: [] },
    SETTINGS,
  );
  assert.equal(row(inventory, "no-estimate").rollups_meaningful, true);
});

test("gap-inventory.mjs prints the inventory for a run cache", (t) => {
  const env = setup(t, {
    files: { "board.json": BOARD, "issues.json": [issue(9), issue(12)], "milestones.json": [] },
  });
  const result = runNode("gap-inventory.mjs", [
    env.runDir,
    "--ready",
    "Ready",
    "--wip",
    "1",
    "--login",
    "acme-bot",
    "--in-flight",
    "In progress",
    "--in-flight",
    "In review",
    "--today",
    "2026-10-21",
  ]);
  assert.equal(result.status, 0, result.stderr);
  const inventory = JSON.parse(result.stdout);
  assert.equal(inventory.today, "2026-10-21");
  assert.deepEqual(inventory.ready, {
    column: "Ready",
    wip: 1,
    count: 1,
    free: 0,
    breach: false,
    cards: [9],
  });
  assert.deepEqual(row(inventory, "no-priority").issues, []);
});

test("gap-inventory.mjs and ready-slots.mjs exit 2 on a usage fault", () => {
  for (const args of [
    [],
    ["run"],
    ["run", "--ready", "Ready", "--wip", "5", "--login", "me"],
    ["run", "--ready", "Ready", "--wip", "five", "--login", "me", "--in-flight", "Doing"],
    [
      "run",
      "--ready",
      "Ready",
      "--wip",
      "5",
      "--login",
      "me",
      "--in-flight",
      "Doing",
      "--today",
      "May",
    ],
    [
      "run",
      "--ready",
      "Ready",
      "--ready",
      "Next",
      "--wip",
      "5",
      "--login",
      "me",
      "--in-flight",
      "Doing",
    ],
    [
      "run",
      "--ready",
      "Ready",
      "--wip",
      "5",
      "--login",
      "me",
      "--in-flight",
      "Doing",
      "--bogus",
      "x",
    ],
  ]) {
    const result = runNode("gap-inventory.mjs", args);
    assert.equal(result.status, 2, JSON.stringify(args));
    assert.match(result.stderr, /^gap-inventory\.mjs: usage: /);
  }
  for (const args of [[], ["run", "--ready", "Ready"], ["run", "--wip", "5", "--ready", "Ready"]]) {
    const result = runNode("ready-slots.mjs", args);
    assert.equal(result.status, 2, JSON.stringify(args));
    assert.match(result.stderr, /^ready-slots\.mjs: usage: /);
  }
});

test("gap-inventory.mjs and ready-slots.mjs exit 1 on a missing, malformed, or multi-repository cache", (t) => {
  const args = ["--ready", "Ready", "--wip", "5", "--login", "me", "--in-flight", "Doing"];
  let env = setup(t, { files: { "board.json": BOARD, "issues.json": [] } });
  let result = runNode("gap-inventory.mjs", [env.runDir, ...args]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /cannot read .*milestones\.json/);

  env = setup(t, {
    files: { "board.json": "{not json", "issues.json": [], "milestones.json": [] },
  });
  result = runNode("gap-inventory.mjs", [env.runDir, ...args]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /board\.json is not JSON/);
  result = runNode("ready-slots.mjs", [env.runDir, "--ready", "Ready", "--wip", "5"]);
  assert.equal(result.status, 1);

  const multi = boardOf([
    item(1, "Backlog"),
    { ...item(2, "Backlog"), content: { type: "Issue", number: 2, repository: "acme/web" } },
  ]);
  env = setup(t, { files: { "board.json": multi, "issues.json": [], "milestones.json": [] } });
  result = runNode("gap-inventory.mjs", [env.runDir, ...args]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /spans 2 repositories/);
});

test("ready-slots.mjs prints the Ready column's occupancy", (t) => {
  const env = setup(t, { files: { "board.json": BOARD } });
  const result = runNode("ready-slots.mjs", [env.runDir, "--ready", "Ready", "--wip", "5"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    column: "Ready",
    wip: 5,
    count: 1,
    free: 4,
    breach: false,
    cards: [9],
  });
});

// --- set-status.sh --------------------------------------------------------------------

const FIELDS = {
  fields: [
    { id: "PVTF_title", name: "Title" },
    {
      id: "PVTSSF_status",
      name: "Status",
      options: [
        { id: "f75ad846", name: "Backlog" },
        { id: "61e4505c", name: "Ready" },
      ],
    },
  ],
  totalCount: 2,
};

function statusRoutes({ fresh = BOARD, landed = "Ready" } = {}) {
  return [
    { match: "^project item-list 5 --owner acme ", ...reply(fresh) },
    { match: "^project view 5 --owner acme --format json --jq .id$", ...reply("PVT_project\n") },
    { match: "^project field-list 5 ", ...reply(FIELDS) },
    { match: "^api graphql -f query=mutation", ...reply('{"data":{}}') },
    { match: "^api graphql -f query=query", ...reply(`${landed}\n`) },
  ];
}

const SET = (env, extra = []) => [env.runDir, "5", "acme", REPO, "12", "Ready", ...extra];

test("set-status.sh refuses bad arguments with 64 before any gh call", (t) => {
  const env = setup(t, { files: { "board.json": BOARD } });
  for (const args of [
    [env.runDir, "5", "acme", REPO, "12"],
    [env.runDir, "5", "acme", "acme", "12", "Ready"],
    [env.runDir, "5", "acme", REPO, "#12", "Ready"],
    [env.runDir, "5", "acme", REPO, "12", "--Ready"],
    [env.runDir, "5", "acme", REPO, "12", "Ready", "--wip-limit", "x"],
    [env.dir, "5", "acme", REPO, "12", "Ready"],
  ]) {
    const result = run(env, "set-status.sh", args);
    assert.equal(result.status, 64, JSON.stringify(args));
  }
  assert.deepEqual(run(env, "set-status.sh", []).ghCalls, []);
});

test("set-status.sh moves a card with string ids and verifies the Status read back", (t) => {
  const env = setup(t, { routes: statusRoutes(), files: { "board.json": BOARD } });
  const result = run(env, "set-status.sh", SET(env, ["--wip-limit", "5"]));
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.lines, ["moved #12 Ready"]);
  const mutation = result.ghCalls.find((call) => call[3]?.startsWith("query=mutation"));
  assert.deepEqual(mutation.slice(4), [
    "-f",
    "project=PVT_project",
    "-f",
    "item=PVTI_12",
    "-f",
    "field=PVTSSF_status",
    "-f",
    "option=61e4505c",
  ]);
});

test("set-status.sh leaves a card already in the column alone", (t) => {
  const moved = boardOf(
    BOARD.items.map((i) => (i.id === "PVTI_12" ? { ...i, status: "Ready" } : i)),
  );
  const env = setup(t, { routes: statusRoutes({ fresh: moved }), files: { "board.json": BOARD } });
  const result = run(env, "set-status.sh", SET(env));
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.lines, ["already #12 Ready"]);
  assert.equal(result.ghCalls.length, 1);
});

test("set-status.sh skips with 10 a card that changed or left the board, or a full column", (t) => {
  const changed = boardOf(
    BOARD.items.map((i) => (i.id === "PVTI_12" ? { ...i, status: "In progress" } : i)),
  );
  const gone = boardOf(BOARD.items.filter((i) => i.id !== "PVTI_12"));
  for (const [fresh, extra, line] of [
    [changed, [], "skipped #12 changed-since-load"],
    [gone, [], "skipped #12 left-board"],
    [BOARD, ["--wip-limit", "1"], "skipped #12 wip-limit"],
  ]) {
    const env = setup(t, { routes: statusRoutes({ fresh }), files: { "board.json": BOARD } });
    const result = run(env, "set-status.sh", SET(env, extra));
    assert.equal(result.status, 10, line);
    assert.deepEqual(result.lines, [line]);
    assert.ok(!result.ghCalls.some((call) => call[0] === "api"), "nothing is written");
  }
});

test("set-status.sh exits 4 for an issue off the cached board or a column that is not an option", (t) => {
  let env = setup(t, { routes: statusRoutes(), files: { "board.json": BOARD } });
  let result = run(env, "set-status.sh", [env.runDir, "5", "acme", REPO, "77", "Ready"]);
  assert.equal(result.status, 4);
  assert.deepEqual(result.ghCalls, []);

  env = setup(t, { routes: statusRoutes(), files: { "board.json": BOARD } });
  result = run(env, "set-status.sh", [env.runDir, "5", "acme", REPO, "12", "Doing"]);
  assert.equal(result.status, 4);
  assert.match(result.stderr, /Doing is not an option of the Status field/);
  assert.ok(!result.ghCalls.some((call) => call[0] === "api"));
});

test("set-status.sh exits 1 when the Status does not read back as the column", (t) => {
  const env = setup(t, {
    routes: statusRoutes({ landed: "Backlog" }),
    files: { "board.json": BOARD },
  });
  const result = run(env, "set-status.sh", SET(env));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /reads 'Backlog' after the write, not 'Ready'/);
  assert.equal(result.stdout, "");
});

// --- link-blocked-by.sh ---------------------------------------------------------------

const LINK_ISSUES = [issue(12), issue(15)];

function linkRoutes({ blocked = issue(12), blocker = issue(15), after } = {}) {
  return [
    {
      match: "^issue view 12 --repo acme/api --json state,body,blockedBy$",
      ...reply(blocked),
    },
    {
      match: "^issue view 15 --repo acme/api --json state,body,blockedBy$",
      ...reply(blocker),
    },
    { match: "^api repos/acme/api/issues/15 --jq .id$", ...reply("2045\n") },
    {
      match: "^api --method POST repos/acme/api/issues/12/dependencies/blocked_by",
      ...reply("{}"),
    },
    {
      match: "^issue view 12 --repo acme/api --json blockedBy$",
      ...reply(after ?? { blockedBy: links([link(15)]) }),
    },
  ];
}

function linkEnv(t, routes, issues = LINK_ISSUES) {
  return setup(t, { routes, files: { "board.json": BOARD, "issues.json": issues } });
}

test("link-blocked-by.sh refuses a self link or bad arguments with 64 before any gh call", (t) => {
  const env = linkEnv(t, linkRoutes());
  for (const args of [
    [env.runDir, REPO, "12", "12"],
    [env.runDir, REPO, "12"],
    [env.runDir, REPO, "12", "7/../../x"],
    [env.dir, REPO, "12", "15"],
  ]) {
    const result = run(env, "link-blocked-by.sh", args);
    assert.equal(result.status, 64, JSON.stringify(args));
    assert.deepEqual(result.ghCalls, []);
  }
});

test("link-blocked-by.sh exits 4 when an endpoint is off the cached board", (t) => {
  const env = linkEnv(t, linkRoutes());
  const result = run(env, "link-blocked-by.sh", [env.runDir, REPO, "12", "77"]);
  assert.equal(result.status, 4);
  assert.match(result.stderr, /#77 in acme\/api is not on the cached board/);
  assert.deepEqual(result.ghCalls, []);
});

test("link-blocked-by.sh posts the blocker's database id from the blocked issue and verifies it", (t) => {
  const env = linkEnv(t, linkRoutes());
  const result = run(env, "link-blocked-by.sh", [env.runDir, REPO, "12", "15"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.lines, ["linked #12 blocked-by #15"]);
  const post = result.ghCalls.find((call) => call.includes("POST"));
  assert.deepEqual(post, [
    "api",
    "--method",
    "POST",
    "repos/acme/api/issues/12/dependencies/blocked_by",
    "-F",
    "issue_id=2045",
  ]);
});

test("link-blocked-by.sh leaves an existing link alone", (t) => {
  const env = linkEnv(t, linkRoutes({ blocked: issue(12, { blockedBy: links([link(15)]) }) }));
  const result = run(env, "link-blocked-by.sh", [env.runDir, REPO, "12", "15"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.lines, ["already #12 blocked-by #15"]);
  assert.ok(!result.ghCalls.some((call) => call.includes("POST")));
});

test("link-blocked-by.sh skips with 10 a closed or changed endpoint, or a link that closes a cycle", (t) => {
  const cases = [
    [linkRoutes({ blocker: issue(15, { state: "CLOSED" }) }), LINK_ISSUES, "closed"],
    [
      linkRoutes({ blocked: issue(12, { body: "Edited since the load" }) }),
      LINK_ISSUES,
      "changed-since-load",
    ],
    // Fresh: 15 is already blocked by 12.
    [
      linkRoutes({ blocker: issue(15, { blockedBy: links([link(12)]) }) }),
      LINK_ISSUES,
      "would-cycle",
    ],
    // Cached: 15 waits on 9, which waits on 12, so 12 waiting on 15 closes the loop.
    [
      linkRoutes(),
      [
        issue(12),
        issue(15, { blockedBy: links([link(9)]) }),
        issue(9, { blockedBy: links([link(12)]) }),
      ],
      "would-cycle",
    ],
  ];
  for (const [routes, issues, reason] of cases) {
    const env = linkEnv(t, routes, issues);
    const result = run(env, "link-blocked-by.sh", [env.runDir, REPO, "12", "15"]);
    assert.equal(result.status, 10, reason);
    assert.deepEqual(result.lines, [`skipped #12 blocked-by #15 ${reason}`]);
    assert.ok(!result.ghCalls.some((call) => call.includes("POST")));
  }
});

test("link-blocked-by.sh exits 1 when the link does not read back from the blocked issue", (t) => {
  const env = linkEnv(t, linkRoutes({ after: { blockedBy: links([]) } }));
  const result = run(env, "link-blocked-by.sh", [env.runDir, REPO, "12", "15"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /does not read back from #12/);
});

// --- close-issue.sh -------------------------------------------------------------------

const EVIDENCE = "Closing as not planned: the premise of this issue no longer holds.\n";
const CACHED_COMMENTS = [{ id: 1, body: "first" }];

function closeRoutes({ before = {}, status = "Backlog", comments = CACHED_COMMENTS, after } = {}) {
  const fresh = {
    state: "OPEN",
    stateReason: null,
    body: "Body of 12",
    labels: [{ name: "enhancement" }],
    updatedAt: "x",
    ...before,
  };
  const posted = [...comments, { id: 2, body: EVIDENCE }];
  return [
    {
      match: "^issue view 12 --repo acme/api --json state,stateReason,body,labels,updatedAt$",
      ...reply(fresh),
    },
    {
      match: "^api --paginate repos/acme/api/issues/12/comments\\?per_page=100 --jq .\\[\\]$",
      replies: [
        { stdout: comments.map((c) => JSON.stringify(c)).join("\n") },
        { stdout: posted.map((c) => JSON.stringify(c)).join("\n") },
      ],
    },
    { match: "^api graphql -f query=query", ...reply(`${status}\n`) },
    { match: "^api --method POST repos/acme/api/issues/12/comments -F body=@", ...reply("{}") },
    { match: "^issue edit 12 --repo acme/api --add-label wontfix$", ...reply("") },
    { match: "^issue close 12 --repo acme/api --reason not planned$", ...reply("") },
    {
      match: "^issue view 12 --repo acme/api --json state,stateReason,labels$",
      ...reply(
        after ?? {
          state: "CLOSED",
          stateReason: "NOT_PLANNED",
          labels: [{ name: "enhancement" }, { name: "wontfix" }],
        },
      ),
    },
  ];
}

function closeEnv(t, routes, { evidence = EVIDENCE, files = {} } = {}) {
  return setup(t, {
    routes,
    files: {
      "board.json": BOARD,
      "issues.json": [issue(12)],
      "comments-12.json": CACHED_COMMENTS,
      "closure-evidence-12.md": evidence,
      ...files,
    },
  });
}

const CLOSE = (env) => [env.runDir, REPO, "12", "wontfix"];

test("close-issue.sh refuses bad arguments or a missing evidence file with 64 before any gh call", (t) => {
  let env = closeEnv(t, closeRoutes());
  for (const args of [
    [env.runDir, REPO, "12"],
    [env.runDir, REPO, "12", "--force"],
    [env.runDir, REPO, "x", "wontfix"],
  ]) {
    assert.equal(run(env, "close-issue.sh", args).status, 64, JSON.stringify(args));
  }
  env = closeEnv(t, closeRoutes(), { evidence: "" });
  const result = run(env, "close-issue.sh", CLOSE(env));
  assert.equal(result.status, 64);
  assert.match(result.stderr, /no approved evidence comment/);
  assert.deepEqual(result.ghCalls, []);
});

test("close-issue.sh exits 4 for an issue off the cached board", (t) => {
  const env = closeEnv(t, closeRoutes(), {
    files: { "closure-evidence-77.md": EVIDENCE, "comments-77.json": [] },
  });
  const result = run(env, "close-issue.sh", [env.runDir, REPO, "77", "wontfix"]);
  assert.equal(result.status, 4);
  assert.deepEqual(result.ghCalls, []);
});

test("close-issue.sh posts the evidence by file, labels additively, closes as not planned, and verifies", (t) => {
  const env = closeEnv(t, closeRoutes());
  const result = run(env, "close-issue.sh", CLOSE(env));
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.lines, [
    `pre-image ${join(env.runDir, "pre-close-12.json")}`,
    "comment posted",
    "label wontfix",
    "closed #12",
    "verified #12",
  ]);
  const post = result.ghCalls.find((call) => call.includes("POST"));
  assert.equal(post.at(-1), `body=@${join(env.runDir, "closure-evidence-12.md")}`);
  assert.equal(readJsonFile(join(env.runDir, "pre-close-12.json")).state, "OPEN");
});

test("close-issue.sh skips with 10 an issue that closed, was edited, moved, or drew a new comment", (t) => {
  const cases = [
    [closeRoutes({ before: { state: "CLOSED" } }), "closed"],
    [closeRoutes({ before: { body: "Edited body" } }), "body-edited"],
    [closeRoutes({ status: "In progress" }), "status-changed"],
    [
      closeRoutes({ comments: [...CACHED_COMMENTS, { id: 5, body: "wait, still needed" }] }),
      "new-comment",
    ],
  ];
  for (const [routes, reason] of cases) {
    const env = closeEnv(t, routes);
    const result = run(env, "close-issue.sh", CLOSE(env));
    assert.equal(result.status, 10, reason);
    assert.equal(result.lines.at(-1), `skipped #12 ${reason}`);
    assert.ok(
      !result.ghCalls.some(
        (call) => call.includes("POST") || call[1] === "close" || call[1] === "edit",
      ),
    );
  }
});

test("close-issue.sh re-run after a failed close does not re-post the evidence comment", (t) => {
  const withEvidence = [...CACHED_COMMENTS, { id: 2, body: EVIDENCE.trimEnd() }];
  const env = closeEnv(t, closeRoutes({ comments: withEvidence }));
  const result = run(env, "close-issue.sh", CLOSE(env));
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.lines.includes("comment exists"));
  assert.ok(result.lines.includes("closed #12"));
  assert.ok(!result.ghCalls.some((call) => call.includes("POST")));
});

test("close-issue.sh only verifies an issue already closed with its evidence comment", (t) => {
  const withEvidence = [...CACHED_COMMENTS, { id: 2, body: EVIDENCE }];
  const env = closeEnv(
    t,
    closeRoutes({ before: { state: "CLOSED", body: "Edited later" }, comments: withEvidence }),
  );
  const result = run(env, "close-issue.sh", CLOSE(env));
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.lines.includes("already-closed #12"));
  assert.ok(!result.ghCalls.some((call) => call[1] === "close"));
});

test("close-issue.sh exits 1 when a pre-existing label is lost or the close reason is wrong", (t) => {
  for (const after of [
    { state: "CLOSED", stateReason: "NOT_PLANNED", labels: [{ name: "wontfix" }] },
    {
      state: "CLOSED",
      stateReason: "COMPLETED",
      labels: [{ name: "enhancement" }, { name: "wontfix" }],
    },
  ]) {
    const env = closeEnv(t, closeRoutes({ after }));
    const result = run(env, "close-issue.sh", CLOSE(env));
    assert.equal(result.status, 1);
    assert.match(result.stderr, /not closed as not planned with its labels intact/);
    assert.equal(result.lines.at(-1), "closed #12", "the landed steps are printed");
  }
});

test("close-issue.sh stops with 1 and the landed prefix when the close fails", (t) => {
  const routes = closeRoutes();
  routes.unshift({ match: "^issue close 12", replies: [{ stderr: "HTTP 403\n", exit: 1 }] });
  const env = closeEnv(t, routes);
  const result = run(env, "close-issue.sh", CLOSE(env));
  assert.equal(result.status, 1);
  assert.deepEqual(result.lines.slice(1), ["comment posted", "label wontfix"]);
  assert.match(result.stderr, /could not close #12/);
});
