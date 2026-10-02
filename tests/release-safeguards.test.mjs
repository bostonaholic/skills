// Runs the real npm scripts and synchronization code in staged fixture repositories.
// Changesets is replaced with a recorder: these tests never commit, tag, or publish.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const REPO = resolve(".");
const SCRIPTS = JSON.parse(readFileSync("package.json", "utf8")).scripts;
const ENV = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
const RULE = "# Fixture rule\n\nCurrent bytes.\n";
const COPY = "skills/engineering/widget/shared/rule.md";

function fixture(t, overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "release-safeguards-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const files = {
    "package.json": JSON.stringify({ name: "fixture", version: "0.1.0", private: true, scripts: SCRIPTS }),
    ".claude-plugin/plugin.json": JSON.stringify({ name: "fixture", version: "0.1.0" }),
    ".gitignore": "node_modules/\n",
    "shared/rule.md": RULE,
    "skills/engineering/widget/SKILL.md": "Read [the fixture rule](shared/rule.md).\n",
    [COPY]: RULE,
    ...overrides,
  };
  for (const [path, content] of Object.entries(files)) {
    if (content === null) continue;
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  mkdirSync(join(root, "scripts"));
  for (const script of ["sync-shared.mjs", "sync-plugin-version.mjs"]) {
    copyFileSync(join(REPO, "scripts", script), join(root, "scripts", script));
  }
  const changeset = join(root, "node_modules/.bin/changeset");
  mkdirSync(dirname(changeset), { recursive: true });
  writeFileSync(changeset, `#!/usr/bin/env node
const fs = require("node:fs");
const operation = process.argv[2];
fs.writeFileSync("changeset-call.json", JSON.stringify({ operation, copy: fs.readFileSync(${JSON.stringify(COPY)}, "utf8") }));
if (operation === "version") {
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  pkg.version = "0.2.0";
  fs.writeFileSync("package.json", JSON.stringify(pkg));
}
`);
  chmodSync(changeset, 0o755);
  for (const args of [["init", "-q"], ["add", "."]]) {
    execFileSync("git", args, { cwd: root, env: ENV });
  }
  return root;
}

function run(root, script) {
  const result = spawnSync("npm", ["run", script], { cwd: root, env: ENV, encoding: "utf8" });
  return { status: result.status, output: result.stdout + result.stderr };
}

test("version preparation repairs forgotten copies before versioning and syncs the plugin version", (t) => {
  const root = fixture(t, {
    [COPY]: "Outdated bytes.\n",
    "skills/engineering/widget/shared/unused.md": "Unused copy.\n",
  });
  const result = run(root, "version");
  assert.equal(result.status, 0, result.output);
  assert.deepEqual(JSON.parse(readFileSync(join(root, "changeset-call.json"), "utf8")), { operation: "version", copy: RULE });
  assert.equal(existsSync(join(root, "skills/engineering/widget/shared/unused.md")), false);
  assert.equal(JSON.parse(readFileSync(join(root, ".claude-plugin/plugin.json"), "utf8")).version, "0.2.0");
});

test("version preparation stops before versioning when a canonical rule is missing", (t) => {
  const root = fixture(t, { "shared/rule.md": null });
  const result = run(root, "version");
  assert.notEqual(result.status, 0, result.output);
  assert.match(result.output, /no canonical file/);
  assert.equal(existsSync(join(root, "changeset-call.json")), false);
  assert.equal(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version, "0.1.0");
});

for (const [problem, overrides] of [
  ["stale", { [COPY]: "Outdated bytes.\n" }],
  ["missing", { [COPY]: null }],
  ["extra", { "skills/engineering/widget/shared/unused.md": "Unused copy.\n" }],
]) {
  test(`release refuses ${problem} copies without invoking Changesets or repairing files`, (t) => {
    const root = fixture(t, overrides);
    const result = run(root, "release:tag");
    assert.notEqual(result.status, 0, result.output);
    assert.ok(result.output.includes(`${problem}:`), result.output);
    assert.equal(existsSync(join(root, "changeset-call.json")), false);
    for (const [path, content] of Object.entries(overrides)) {
      if (content === null) assert.equal(existsSync(join(root, path)), false);
      else assert.equal(readFileSync(join(root, path), "utf8"), content);
    }
  });
}

test("release reaches Changesets tagging when shared copies are synchronized", (t) => {
  const root = fixture(t);
  const result = run(root, "release:tag");
  assert.equal(result.status, 0, result.output);
  assert.deepEqual(JSON.parse(readFileSync(join(root, "changeset-call.json"), "utf8")), { operation: "tag", copy: RULE });
});
