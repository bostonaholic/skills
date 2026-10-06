// Fails when the retro write-target guard cannot locate a skill nested one
// category level down, guesses between same-named skills, or lets a nested
// target escape the repository.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { resolveEditTarget } from "../skills/productivity/running-retros/resources/write-target.mjs";

const SCRIPT = resolve("skills/productivity/running-retros/resources/write-target.mjs");

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
  assert.match(result.stdout, new RegExp(`^edit target: ${join(repo, "skills", "engineering", "alpha", "SKILL.md")}$`, "m"));
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
