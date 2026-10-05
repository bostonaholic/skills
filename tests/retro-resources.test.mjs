// Fails when retro's prompt-driven modes stop holding their contracts: a named
// transcript file must normalize into the run cache's sources/, and an
// arbitrary repo path must pass the allowlist and containment guard.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { isValidRepoPath } from "../skills/productivity/retro/resources/write-target.mjs";

const RESOURCES = resolve("skills/productivity/retro/resources");

function scratchDir(t) {
  const root = mkdtempSync(join(tmpdir(), "retro-resources-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function run(script, args) {
  return spawnSync(process.execPath, [join(RESOURCES, script), ...args], { encoding: "utf8" });
}

const CLAUDE_CODE_LINES = [
  { type: "user", sessionId: "abc", message: { role: "user", content: "find the config loader" } },
  { type: "assistant", sessionId: "abc", message: { role: "assistant", content: [{ type: "text", text: "searching" }] } },
].map((r) => JSON.stringify(r)).join("\n");

test("resolve-transcript.mjs --file normalizes a named transcript into sources/", (t) => {
  const dir = scratchDir(t);
  const transcript = join(dir, "abc.jsonl");
  writeFileSync(transcript, CLAUDE_CODE_LINES);
  const runDir = join(dir, "run");

  const result = run("resolve-transcript.mjs", [runDir, "--file", transcript]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^format: claude-code$/m);
  assert.match(result.stdout, /^records: 2$/m);
  const out = join(runDir, "sources", "abc.jsonl");
  assert.match(result.stdout, new RegExp(`^normalized: ${out}$`, "m"));
  const records = readFileSync(out, "utf8").split("\n").map((line) => JSON.parse(line));
  assert.deepEqual(records.map((r) => r.text), ["find the config loader", "searching"]);
});

test("resolve-transcript.mjs --file refuses a file no supported host writes", (t) => {
  const dir = scratchDir(t);
  const transcript = join(dir, "notes.jsonl");
  writeFileSync(transcript, JSON.stringify({ hello: "world" }));

  const result = run("resolve-transcript.mjs", [join(dir, "run"), "--file", transcript]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /^unsupported-format$/m);
  assert.equal(existsSync(join(dir, "run", "sources")), false);
});

test("resolve-transcript.mjs --file without a path reaches its usage error", (t) => {
  const result = run("resolve-transcript.mjs", [join(scratchDir(t), "run"), "--file"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^usage: resolve-transcript\.mjs </);
});

test("isValidRepoPath admits plain relative paths only", () => {
  for (const ok of ["CODING_STANDARDS.md", "docs/coding-standards/naming.md", ".claude/skills/x/SKILL.md"]) {
    assert.equal(isValidRepoPath(ok), true, ok);
  }
  for (const bad of ["", "/etc/passwd", "../sibling/README.md", "docs/../../x", "-rf", "a b.md", "a;b", "docs//x.md", "docs/", 42]) {
    assert.equal(isValidRepoPath(bad), false, String(bad));
  }
});

test("write-target.mjs --path prints a contained target and whether it exists", (t) => {
  const repo = scratchDir(t);
  writeFileSync(join(repo, "CODING_STANDARDS.md"), "# Standards\n");

  const existing = run("write-target.mjs", [repo, "--path", "CODING_STANDARDS.md"]);
  assert.equal(existing.status, 0, existing.stderr);
  assert.match(existing.stdout, /^target exists: true$/m);

  const created = run("write-target.mjs", [repo, "--path", "docs/standards/naming.md"]);
  assert.equal(created.status, 0, created.stderr);
  assert.match(created.stdout, /^target exists: false$/m);
});

test("write-target.mjs --path refuses traversal and symlinks out of the repo", (t) => {
  const repo = scratchDir(t);
  const outside = scratchDir(t);
  mkdirSync(join(repo, "docs"));
  symlinkSync(outside, join(repo, "docs", "escape"));

  const traversal = run("write-target.mjs", [repo, "--path", "../x.md"]);
  assert.equal(traversal.status, 1);
  assert.match(traversal.stderr, /^refusing: /);

  const symlinked = run("write-target.mjs", [repo, "--path", "docs/escape/x.md"]);
  assert.equal(symlinked.status, 1);
  assert.match(symlinked.stderr, /outside the repository/);
});
