// Fails when the retro write-target guard cannot locate a skill nested one
// category level down, guesses between same-named skills, lets a nested
// target escape the repository, misses a copy under the other skills root, or
// lets a name or path read through --name-file or --path-file skip validation.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  resolveEditTarget,
  shadowedCopies,
} from "../skills/productivity/running-retros/scripts/write-target.mjs";

const SCRIPT = resolve("skills/productivity/running-retros/scripts/write-target.mjs");

function scratchDir(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "write-target-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function pluginRepo(t) {
  const repo = join(scratchDir(t), "repo");
  mkdirSync(join(repo, ".claude-plugin"), { recursive: true });
  writeFileSync(join(repo, ".claude-plugin", "plugin.json"), "{}\n");
  return repo;
}

function addSkill(dir) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), "---\nname: x\n---\n");
}

function run(repo, name) {
  return spawnSync(process.execPath, [SCRIPT, repo, name], { encoding: "utf8" });
}

test("resolveEditTarget finds a skill one category level down", (t) => {
  const editRoot = join(pluginRepo(t), "skills");
  addSkill(join(editRoot, "engineering", "alpha"));
  assert.deepEqual(resolveEditTarget({ editRoot, name: "alpha" }), {
    status: "found",
    target: join(editRoot, "engineering", "alpha", "SKILL.md"),
  });
});

test("resolveEditTarget still finds a flat skill", (t) => {
  const editRoot = join(pluginRepo(t), "skills");
  addSkill(join(editRoot, "alpha"));
  assert.deepEqual(resolveEditTarget({ editRoot, name: "alpha" }), {
    status: "found",
    target: join(editRoot, "alpha", "SKILL.md"),
  });
});

test("resolveEditTarget reports the flat path for a missing skill", (t) => {
  const editRoot = join(pluginRepo(t), "skills");
  mkdirSync(join(editRoot, "engineering"), { recursive: true });
  assert.deepEqual(resolveEditTarget({ editRoot, name: "alpha" }), {
    status: "missing",
    target: join(editRoot, "alpha", "SKILL.md"),
  });
});

test("resolveEditTarget treats a missing edit root as missing", (t) => {
  const editRoot = join(scratchDir(t), "absent");
  assert.equal(resolveEditTarget({ editRoot, name: "alpha" }).status, "missing");
});

test("resolveEditTarget ignores a deprecated entrypoint", (t) => {
  const editRoot = join(pluginRepo(t), "skills");
  const archived = join(editRoot, "deprecated", "alpha");
  mkdirSync(archived, { recursive: true });
  writeFileSync(join(archived, "SKILL.md.disabled"), "");
  addSkill(join(editRoot, "engineering", "alpha"));
  assert.equal(resolveEditTarget({ editRoot, name: "alpha" }).status, "found");
});

test("resolveEditTarget refuses a name held by two categories", (t) => {
  const editRoot = join(pluginRepo(t), "skills");
  addSkill(join(editRoot, "engineering", "alpha"));
  addSkill(join(editRoot, "productivity", "alpha"));
  assert.deepEqual(resolveEditTarget({ editRoot, name: "alpha" }), {
    status: "ambiguous",
    matches: [
      join(editRoot, "engineering", "alpha", "SKILL.md"),
      join(editRoot, "productivity", "alpha", "SKILL.md"),
    ],
  });
});

test("resolveEditTarget refuses a name both flat and nested", (t) => {
  const editRoot = join(pluginRepo(t), "skills");
  addSkill(join(editRoot, "alpha"));
  addSkill(join(editRoot, "engineering", "alpha"));
  assert.equal(resolveEditTarget({ editRoot, name: "alpha" }).status, "ambiguous");
});

test("CLI reports a nested skill as an existing edit target", (t) => {
  const repo = pluginRepo(t);
  addSkill(join(repo, "skills", "engineering", "alpha"));
  const result = run(repo, "alpha");
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    new RegExp(`^edit target: ${join(repo, "skills", "engineering", "alpha", "SKILL.md")}$`, "m"),
  );
  assert.match(result.stdout, /^edit target exists: true$/m);
});

test("CLI refuses a name held by two categories and names both paths", (t) => {
  const repo = pluginRepo(t);
  addSkill(join(repo, "skills", "engineering", "alpha"));
  addSkill(join(repo, "skills", "productivity", "alpha"));
  const result = run(repo, "alpha");
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^refusing: 'alpha' names more than one skill: /);
  assert.ok(result.stderr.includes(join(repo, "skills", "engineering", "alpha", "SKILL.md")));
  assert.ok(result.stderr.includes(join(repo, "skills", "productivity", "alpha", "SKILL.md")));
});

test("CLI refuses a nested target reached through a category symlinked outside the repo", (t) => {
  const repo = pluginRepo(t);
  const outside = join(scratchDir(t), "outside");
  addSkill(join(outside, "alpha"));
  mkdirSync(join(repo, "skills"), { recursive: true });
  symlinkSync(outside, join(repo, "skills", "escape"));
  const result = run(repo, "alpha");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^refusing: edit target resolves outside the repository$/m);
});

test("shadowedCopies finds a plugin skill's copy under .claude/skills", (t) => {
  const repo = pluginRepo(t);
  addSkill(join(repo, "skills", "engineering", "alpha"));
  addSkill(join(repo, ".claude", "skills", "alpha"));
  assert.deepEqual(
    shadowedCopies({ repoRoot: repo, editRoot: join(repo, "skills"), name: "alpha" }),
    [join(repo, ".claude", "skills", "alpha", "SKILL.md")],
  );
});

test("shadowedCopies finds a project skill's copy under skills/", (t) => {
  const repo = join(scratchDir(t), "repo");
  addSkill(join(repo, ".claude", "skills", "alpha"));
  addSkill(join(repo, "skills", "tools", "alpha"));
  assert.deepEqual(
    shadowedCopies({ repoRoot: repo, editRoot: join(repo, ".claude", "skills"), name: "alpha" }),
    [join(repo, "skills", "tools", "alpha", "SKILL.md")],
  );
});

test("shadowedCopies is empty when only the edit root holds the skill", (t) => {
  const repo = pluginRepo(t);
  addSkill(join(repo, "skills", "engineering", "alpha"));
  assert.deepEqual(
    shadowedCopies({ repoRoot: repo, editRoot: join(repo, "skills"), name: "alpha" }),
    [],
  );
});

test("CLI names a shadowed copy under the other skills root", (t) => {
  const repo = pluginRepo(t);
  addSkill(join(repo, "skills", "engineering", "alpha"));
  addSkill(join(repo, ".claude", "skills", "alpha"));
  const result = run(repo, "alpha");
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    new RegExp(`^edit target: ${join(repo, "skills", "engineering", "alpha", "SKILL.md")}$`, "m"),
  );
  assert.match(
    result.stdout,
    new RegExp(`^shadowed copy: ${join(repo, ".claude", "skills", "alpha", "SKILL.md")}$`, "m"),
  );
});

test("CLI prints no shadowed copy when one root holds the skill", (t) => {
  const repo = pluginRepo(t);
  addSkill(join(repo, "skills", "engineering", "alpha"));
  const result = run(repo, "alpha");
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /^shadowed copy:/m);
});

function runArgs(...args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
}

test("CLI --name-file reads the skill name from a file, dropping trailing newlines", (t) => {
  const repo = pluginRepo(t);
  addSkill(join(repo, "skills", "engineering", "alpha"));
  const file = join(scratchDir(t), "name-1.txt");
  writeFileSync(file, "alpha\n\n");
  const result = runArgs(repo, "--name-file", file);
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    new RegExp(`^edit target: ${join(repo, "skills", "engineering", "alpha", "SKILL.md")}$`, "m"),
  );
});

test("CLI --name-file refuses a name the allowlist rejects", (t) => {
  const repo = pluginRepo(t);
  for (const value of ["", "-rf", "Alpha", "a/b", "alpha\nbeta", "alpha beta", "../x"]) {
    const file = join(scratchDir(t), "name.txt");
    writeFileSync(file, value);
    const result = runArgs(repo, "--name-file", file);
    assert.equal(result.status, 1, JSON.stringify(value));
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /^refusing: /, JSON.stringify(value));
  }
});

test("CLI --path-file reads the path from a file and reports its target", (t) => {
  const repo = pluginRepo(t);
  const file = join(scratchDir(t), "path-1.txt");
  writeFileSync(file, "docs/standards/naming.md\n");
  const result = runArgs(repo, "--path-file", file);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    result.stdout,
    `target: ${join(repo, "docs", "standards", "naming.md")}\ntarget exists: false\n`,
  );
});

test("CLI --path-file refuses a path the allowlist rejects", (t) => {
  const repo = pluginRepo(t);
  for (const value of ["", "/etc/passwd", "-x", "a/../b", "./a", "a//b", "a b", "$(id)"]) {
    const file = join(scratchDir(t), "path.txt");
    writeFileSync(file, value);
    const result = runArgs(repo, "--path-file", file);
    assert.equal(result.status, 1, JSON.stringify(value));
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /^refusing: /, JSON.stringify(value));
  }
});

test("CLI --path-file refuses a path that resolves outside the repository", (t) => {
  const repo = pluginRepo(t);
  symlinkSync(scratchDir(t), join(repo, "out"));
  const file = join(scratchDir(t), "path.txt");
  writeFileSync(file, "out/x.md");
  const result = runArgs(repo, "--path-file", file);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^refusing: target resolves outside the repository$/m);
});

test("CLI refuses an unreadable value file", (t) => {
  const repo = pluginRepo(t);
  for (const flag of ["--name-file", "--path-file"]) {
    const result = runArgs(repo, flag, join(scratchDir(t), "missing.txt"));
    assert.equal(result.status, 1, flag);
    assert.match(result.stderr, /^refusing: cannot read '.*missing\.txt' \(ENOENT\)$/m, flag);
  }
});

test("CLI exits 1 with usage when a file flag has no value", (t) => {
  const repo = pluginRepo(t);
  for (const flag of ["--name-file", "--path-file", "--path"]) {
    const result = runArgs(repo, flag);
    assert.equal(result.status, 1, flag);
    assert.match(result.stderr, /^usage: write-target\.mjs </, flag);
  }
});
