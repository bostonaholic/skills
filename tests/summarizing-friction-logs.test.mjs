// Fails when collect-friction.mjs resolves the wrong workspace, scans a worktree, mislabels the
// global log, bounds or sorts entries differently from the dashboard rules, renders a header,
// table, or footer that drifts from them, runs any frog command but `list`, or misses an exit code.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const SCRIPT = fileURLToPath(
  new URL(
    "../skills/engineering/summarizing-friction-logs/scripts/collect-friction.mjs",
    import.meta.url,
  ),
);
const LOG = join(".agents", "friction-log");

function scratch(t) {
  const root = mkdtempSync(join(tmpdir(), "friction-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function writeEntry(scopeDir, { id, title, severity, target }) {
  const dir = join(scopeDir, LOG, id);
  mkdirSync(dir, { recursive: true });
  const targetLine = target ? `target: ${target}\n` : "";
  writeFileSync(
    join(dir, "friction.md"),
    `---\ntitle: "${title}"\nseverity: ${severity}\n${targetLine}---\n\nBody of ${id}.\n`,
  );
}

// A fake frog that answers `list --cwd <dir> --format json` from <dir>/frog.json, exits 3
// when <dir>/frog.fail exists, and appends every argv to <bin>/calls.log.
function fakeFrog(root) {
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  const script = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
fs.appendFileSync(path.join(__dirname, "calls.log"), JSON.stringify(args) + "\\n");
const dir = args[args.indexOf("--cwd") + 1];
if (fs.existsSync(path.join(dir, "frog.fail"))) { process.stderr.write("boom\\n"); process.exit(3); }
process.stdout.write(fs.readFileSync(path.join(dir, "frog.json"), "utf8"));
`;
  writeFileSync(join(bin, "frog"), script);
  chmodSync(join(bin, "frog"), 0o755);
  return bin;
}

function run(args, { cwd, pathDirs = [] } = {}) {
  const PATH = [...pathDirs, dirname(process.execPath), "/usr/bin", "/bin"].join(delimiter);
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd,
    encoding: "utf8",
    env: { PATH, HOME: process.env.HOME, GIT_CONFIG_NOSYSTEM: "1" },
  });
  return {
    status: result.status,
    stderr: result.stderr,
    json: result.status === 0 ? JSON.parse(result.stdout) : null,
  };
}

function entries(count, { severity = "minor", start = 1 } = {}) {
  return Array.from({ length: count }, (_, i) => ({
    id: `202609${String(start + i).padStart(2, "0")}120000-e${start + i}`,
    title: `Entry ${start + i}`,
    severity,
  }));
}

test("renders header, sorted table, and gist slots from friction.md frontmatter", (t) => {
  const ws = scratch(t);
  writeEntry(join(ws, "api"), {
    id: "20260819110930-a",
    title: "Lint is slow",
    severity: "minor",
  });
  writeEntry(join(ws, "api"), {
    id: "20260912093005-b",
    title: "Deploys fail | sometimes",
    severity: "blocker",
  });
  writeEntry(join(ws, "web"), {
    id: "20261001120015-c",
    title: "Port clash",
    severity: "major",
    target: "acme/base",
  });
  writeEntry(ws, { id: "20260916190244-g", title: "Slow shell", severity: "major" });
  mkdirSync(join(ws, "docs", LOG), { recursive: true });
  mkdirSync(join(ws, "plain-dir"));

  const { status, json } = run(["--workspace", ws, "--no-frog"]);

  assert.equal(status, 0);
  assert.equal(json.workspace, ws);
  assert.equal(json.header, "3 entries across 2 repos + 1 global: 1 blocker · 2 major · 1 minor");
  assert.equal(
    json.table,
    [
      "| Sev | Scope | Entry | State | Logged |",
      "| --- | --- | --- | --- | --- |",
      "| 🔴 blocker | api | Deploys fail \\| sometimes | unknown | Sep 12 |",
      "| 🟠 major | web | Port clash (upstream: acme/base) | unknown | Oct 1 |",
      "| 🟠 major | global | Slow shell | unknown | Sep 16 |",
      "| 🟡 minor | api | Lint is slow | unknown | Aug 19 |",
    ].join("\n"),
  );
  assert.equal(
    json.footer,
    [
      "- No entries: docs",
      "- frog not used: read friction.md frontmatter, which carries no state",
    ].join("\n"),
  );
  assert.deepEqual(
    json.gist_slots.map((slot) => [slot.scope, slot.id]),
    [
      ["api", "20260912093005-b"],
      ["api", "20260819110930-a"],
      ["web", "20261001120015-c"],
      ["global", "20260916190244-g"],
    ],
  );
  assert.equal(json.gist_slots[3].path, join(ws, LOG, "20260916190244-g", "friction.md"));
});

test("bounds a scope over 15 entries to its top 10 and counts the rest", (t) => {
  const ws = scratch(t);
  const big = [
    ...entries(2, { severity: "blocker", start: 1 }),
    ...entries(10, { severity: "major", start: 3 }),
    ...entries(6, { severity: "minor", start: 13 }),
  ];
  for (const entry of big) writeEntry(join(ws, "api"), entry);
  for (const entry of entries(15, { start: 1 })) writeEntry(ws, entry);

  const { status, json } = run(["--workspace", ws, "--no-frog"]);

  assert.equal(status, 0);
  assert.equal(
    json.header,
    "18 entries across 1 repo + 15 global: 2 blocker · 10 major · 21 minor (bounded: api 18→10)",
  );
  const apiSlots = json.gist_slots.filter((slot) => slot.scope === "api").map((slot) => slot.id);
  assert.deepEqual(apiSlots, [
    "20260902120000-e2",
    "20260901120000-e1",
    "20260912120000-e12",
    "20260911120000-e11",
    "20260910120000-e10",
    "20260909120000-e9",
    "20260908120000-e8",
    "20260907120000-e7",
    "20260906120000-e6",
    "20260905120000-e5",
  ]);
  assert.equal(json.gist_slots.filter((slot) => slot.scope === "global").length, 15);
  assert.match(json.footer, /^- api: 18 entries; \+ 8 more \(2 major, 6 minor\) not rendered$/m);
  assert.doesNotMatch(json.footer, /global:/);
});

test("reads entries through frog list, keeps state, and runs no other frog command", (t) => {
  const ws = scratch(t);
  const bin = fakeFrog(ws);
  mkdirSync(join(ws, "api", LOG), { recursive: true });
  writeFileSync(
    join(ws, "api", "frog.json"),
    JSON.stringify([
      { id: "20260930142211-x", title: "Hangs", severity: "blocker", state: "pending" },
      {
        id: "20260923090218-y",
        title: "No arm64",
        severity: "major",
        state: "linked",
        target: "acme/base-images",
      },
    ]),
  );
  mkdirSync(join(ws, LOG), { recursive: true });
  writeFileSync(join(ws, "frog.json"), "[]");

  const { status, json } = run(["--workspace", ws], { pathDirs: [bin] });

  assert.equal(status, 0);
  assert.equal(json.header, "2 entries across 1 repo + 0 global: 1 blocker · 1 major · 0 minor");
  assert.match(json.table, /\| 🔴 blocker \| api \| Hangs \| pending \| Sep 30 \|/);
  assert.match(json.table, /\| No arm64 \(upstream: acme\/base-images\) \| linked \| Sep 23 \|/);
  assert.equal(json.footer, "- No entries: global");
  const calls = readFileSync(join(bin, "calls.log"), "utf8").trim().split("\n").map(JSON.parse);
  assert.deepEqual(calls, [
    ["list", "--cwd", join(ws, "api"), "--format", "json"],
    ["list", "--cwd", ws, "--format", "json"],
  ]);
});

test("--no-frog reads frontmatter even with frog on PATH", (t) => {
  const ws = scratch(t);
  const bin = fakeFrog(ws);
  writeEntry(join(ws, "api"), { id: "20260930142211-x", title: "Hangs", severity: "blocker" });

  const { status, json } = run(["--workspace", ws, "--no-frog"], { pathDirs: [bin] });

  assert.equal(status, 0);
  assert.match(json.table, /\| Hangs \| unknown \|/);
  assert.throws(() => readFileSync(join(bin, "calls.log")));
});

test("names an unreadable scope in the footer and still renders the rest", (t) => {
  const ws = scratch(t);
  const bin = fakeFrog(ws);
  mkdirSync(join(ws, "api", LOG), { recursive: true });
  writeFileSync(join(ws, "api", "frog.fail"), "");
  mkdirSync(join(ws, "web", LOG), { recursive: true });
  writeFileSync(
    join(ws, "web", "frog.json"),
    JSON.stringify([
      { id: "20261001120015-c", title: "Port", severity: "minor", state: "pending" },
    ]),
  );

  const { status, json, stderr } = run(["--workspace", ws], { pathDirs: [bin] });

  assert.equal(status, 0);
  assert.equal(json.header, "1 entry across 1 repo + 0 global: 0 blocker · 0 major · 1 minor");
  assert.equal(json.footer, "- Could not read api: frog list exited 3: boom");
  assert.match(stderr, /cannot read api: frog list exited 3: boom/);
});

test("rejects frog output that is not a valid entry array", (t) => {
  const ws = scratch(t);
  const bin = fakeFrog(ws);
  const cases = {
    a: "not json",
    b: '{"entries": []}',
    c: JSON.stringify([{ id: "20260101000000-x", title: "T", severity: "huge" }]),
    d: JSON.stringify([{ id: "no-timestamp", title: "T", severity: "minor" }]),
  };
  for (const [name, output] of Object.entries(cases)) {
    mkdirSync(join(ws, name, LOG), { recursive: true });
    writeFileSync(join(ws, name, "frog.json"), output);
  }

  const { status, stderr } = run(["--workspace", ws], { pathDirs: [bin] });

  assert.equal(status, 2);
  assert.match(stderr, /cannot read a: frog list printed invalid JSON/);
  assert.match(stderr, /cannot read b: frog list did not print a JSON array/);
  assert.match(stderr, /cannot read c: frog list entry 0: severity must be one of/);
  assert.match(stderr, /cannot read d: frog list entry 0: id must start with/);
  assert.match(stderr, /no friction log could be read/);
});

test("exits 2 naming a malformed friction.md when every log fails without frog", (t) => {
  const ws = scratch(t);
  const dir = join(ws, "api", LOG, "20260930142211-x");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "friction.md"), "no frontmatter here\n");
  mkdirSync(join(ws, LOG, "20260930142211-y"), { recursive: true });

  const { status, stderr } = run(["--workspace", ws, "--no-frog"]);

  assert.equal(status, 2);
  assert.match(
    stderr,
    new RegExp(`cannot read api: .*20260930142211-x.*friction\\.md: no frontmatter`),
  );
  assert.match(stderr, /cannot read global: cannot read .*20260930142211-y.*friction\.md/);
});

test("never scans worktrees under .claude/worktrees", (t) => {
  const ws = scratch(t);
  writeEntry(join(ws, "api"), { id: "20260930142211-x", title: "Hangs", severity: "blocker" });
  writeEntry(join(ws, "api", ".claude", "worktrees", "wt"), {
    id: "20260930142211-x",
    title: "Hangs",
    severity: "blocker",
  });

  const { json } = run(["--workspace", ws, "--no-frog"]);

  assert.equal(json.gist_slots.length, 1);
});

test("defaults the workspace to the parent of the main clone, from a linked worktree too", (t) => {
  const ws = scratch(t);
  const repo = join(ws, "api");
  mkdirSync(repo);
  const git = (args, cwd) => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  };
  git(["init", "-q"], repo);
  const linked = join(repo, ".claude", "worktrees", "wt");
  git(["worktree", "add", "-q", "--orphan", "-b", "wt", linked], repo);
  writeEntry(repo, { id: "20260930142211-x", title: "Hangs", severity: "blocker" });

  for (const cwd of [repo, linked]) {
    const { status, json } = run(["--no-frog"], { cwd });
    assert.equal(status, 0);
    assert.equal(json.workspace, realpathSync(ws));
  }
});

test("exits 1 outside a repository without --workspace", (t) => {
  const { status, stderr } = run(["--no-frog"], { cwd: scratch(t) });
  assert.equal(status, 1);
  assert.match(stderr, /not in a git repository; pass --workspace <dir>/);
});

test("exits 1 when the workspace holds no friction log or is not a directory", (t) => {
  const ws = scratch(t);
  mkdirSync(join(ws, "api"));

  const none = run(["--workspace", ws]);
  assert.equal(none.status, 1);
  assert.match(none.stderr, new RegExp(`no \\.agents/friction-log directory under ${ws}`));

  const missing = run(["--workspace", join(ws, "nope")]);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /workspace is not a directory/);
});

test("exits 1 on a usage error", () => {
  for (const args of [["--bogus"], ["--workspace"]]) {
    const { status, stderr } = run(args);
    assert.equal(status, 1);
    assert.match(stderr, /^collect-friction\.mjs: usage: collect-friction\.mjs /);
  }
});
