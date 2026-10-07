// Fails when retro's prompt-driven modes stop holding their contracts: a named
// transcript file must normalize into the run cache's sources/ without
// overwriting another source, an unreadable one must fail by name, and an
// arbitrary repo path must pass the allowlist and containment guard.
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { isValidRepoPath } from "../skills/productivity/running-retros/scripts/write-target.mjs";

const SCRIPTS = resolve("skills/productivity/running-retros/scripts");

function scratchDir(t) {
  const root = mkdtempSync(join(tmpdir(), "retro-resources-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function run(script, args) {
  return spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { encoding: "utf8" });
}

const CLAUDE_CODE_LINES = [
  { type: "user", sessionId: "abc", message: { role: "user", content: "find the config loader" } },
  {
    type: "assistant",
    sessionId: "abc",
    message: { role: "assistant", content: [{ type: "text", text: "searching" }] },
  },
]
  .map((r) => JSON.stringify(r))
  .join("\n");

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
  const records = readFileSync(out, "utf8")
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    records.map((r) => r.text),
    ["find the config loader", "searching"],
  );
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

test("resolve-transcript.mjs --file keeps two sources that share a basename", (t) => {
  const dir = scratchDir(t);
  mkdirSync(join(dir, "a"));
  mkdirSync(join(dir, "b"));
  writeFileSync(join(dir, "a", "abc.jsonl"), CLAUDE_CODE_LINES);
  writeFileSync(join(dir, "b", "abc.jsonl"), CLAUDE_CODE_LINES.split("\n")[0]);
  const runDir = join(dir, "run");

  const first = run("resolve-transcript.mjs", [runDir, "--file", join(dir, "a", "abc.jsonl")]);
  const second = run("resolve-transcript.mjs", [runDir, "--file", join(dir, "b", "abc.jsonl")]);

  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.match(
    second.stdout,
    new RegExp(`^normalized: ${join(runDir, "sources", "abc-2.jsonl")}$`, "m"),
  );
  assert.equal(readFileSync(join(runDir, "sources", "abc.jsonl"), "utf8").split("\n").length, 2);
  assert.equal(readFileSync(join(runDir, "sources", "abc-2.jsonl"), "utf8").split("\n").length, 1);
});

test("resolve-transcript.mjs --file reuses the path when the normalized bytes match", (t) => {
  const dir = scratchDir(t);
  const transcript = join(dir, "abc.jsonl");
  writeFileSync(transcript, CLAUDE_CODE_LINES);
  const runDir = join(dir, "run");

  const first = run("resolve-transcript.mjs", [runDir, "--file", transcript]);
  const again = run("resolve-transcript.mjs", [runDir, "--file", transcript]);

  assert.equal(first.status, 0, first.stderr);
  assert.equal(again.status, 0, again.stderr);
  assert.match(
    again.stdout,
    new RegExp(`^normalized: ${join(runDir, "sources", "abc.jsonl")}$`, "m"),
  );
  assert.deepEqual(readdirSync(join(runDir, "sources")), ["abc.jsonl"]);
});

test("resolve-transcript.mjs --file reports bytes as UTF-8 bytes", (t) => {
  const dir = scratchDir(t);
  const transcript = join(dir, "abc.jsonl");
  const text = JSON.stringify({
    type: "user",
    sessionId: "abc",
    message: { role: "user", content: "café ✓" },
  });
  writeFileSync(transcript, text);

  const result = run("resolve-transcript.mjs", [join(dir, "run"), "--file", transcript]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`^bytes: ${Buffer.byteLength(text, "utf8")}$`, "m"));
});

test("resolve-transcript.mjs --file names a missing or directory transcript", (t) => {
  const dir = scratchDir(t);
  for (const path of [join(dir, "absent.jsonl"), dir]) {
    const result = run("resolve-transcript.mjs", [join(dir, "run"), "--file", path]);
    assert.equal(result.status, 1, path);
    assert.match(result.stderr, /^unreadable-transcript$/m, path);
    assert.doesNotMatch(result.stderr, /\n\s+at /, path);
  }
});

test("resolve-transcript.mjs --file without a path reaches its usage error", (t) => {
  const result = run("resolve-transcript.mjs", [join(scratchDir(t), "run"), "--file"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^usage: resolve-transcript\.mjs </);
});

test("isValidRepoPath admits plain relative paths only", () => {
  for (const ok of [
    "CODING_STANDARDS.md",
    "docs/coding-standards/naming.md",
    ".claude/skills/x/SKILL.md",
  ]) {
    assert.equal(isValidRepoPath(ok), true, ok);
  }
  for (const bad of [
    "",
    "/etc/passwd",
    "../sibling/README.md",
    "docs/../../x",
    "-rf",
    "a b.md",
    "a;b",
    "docs//x.md",
    "docs/",
    42,
  ]) {
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
