// Fails when resolve-instructions-file.sh picks the wrong file for a host and
// scope, stops following a symlink or an import-only file to its target, treats
// a file with more than one import line as import-only, loops forever on a
// symlink or import cycle, or changes an exit code.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const SCRIPT = resolve(
  "skills/productivity/learning-from-mistakes/scripts/resolve-instructions-file.sh",
);
const BASH = spawnSync("bash", ["-c", "command -v bash"], { encoding: "utf8" }).stdout.trim();

function scratch(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "learning-from-mistakes-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function gitRepo(dir) {
  mkdirSync(dir, { recursive: true });
  const init = spawnSync("git", ["init", "-q", dir], { encoding: "utf8" });
  assert.equal(init.status, 0, init.stderr);
  return dir;
}

function run(args, { home, path = process.env.PATH } = {}) {
  return spawnSync(BASH, [SCRIPT, ...args], {
    encoding: "utf8",
    env: { PATH: path, HOME: home ?? "/nonexistent-home" },
  });
}

function assertPrints(result, expected) {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `${expected}\n`);
}

test("project scope prints the repository root's CLAUDE.md or AGENTS.md by host", (t) => {
  const repo = gitRepo(join(scratch(t), "repo"));
  const sub = join(repo, "app", "models");
  mkdirSync(sub, { recursive: true });
  assertPrints(run(["claude", "project", "--cwd", sub]), join(repo, "CLAUDE.md"));
  assertPrints(run(["codex", "project", "--cwd", sub]), join(repo, "AGENTS.md"));
});

test("global scope prints the host's file under HOME, existing or not", (t) => {
  const home = scratch(t);
  assertPrints(run(["claude", "global"], { home }), join(home, ".claude", "CLAUDE.md"));
  mkdirSync(join(home, ".codex"));
  assertPrints(run(["codex", "global"], { home }), join(home, ".codex", "AGENTS.md"));
});

test("a symlinked file resolves to the file it points at, through a chain", (t) => {
  const repo = gitRepo(join(scratch(t), "repo"));
  mkdirSync(join(repo, "docs"));
  writeFileSync(join(repo, "docs", "rules.md"), "# Rules\n");
  symlinkSync("docs/link.md", join(repo, "CLAUDE.md"));
  symlinkSync("rules.md", join(repo, "docs", "link.md"));
  assertPrints(run(["claude", "project", "--cwd", repo]), join(repo, "docs", "rules.md"));
});

test("a dangling symlink resolves to its missing target", (t) => {
  const home = scratch(t);
  mkdirSync(join(home, ".claude"));
  mkdirSync(join(home, "dotfiles"));
  symlinkSync(join(home, "dotfiles", "CLAUDE.md"), join(home, ".claude", "CLAUDE.md"));
  assertPrints(run(["claude", "global"], { home }), join(home, "dotfiles", "CLAUDE.md"));
});

test("an import-only file resolves to the file it imports", (t) => {
  const repo = gitRepo(join(scratch(t), "repo"));
  writeFileSync(join(repo, "CLAUDE.md"), "\n  @AGENTS.md  \n\n");
  writeFileSync(join(repo, "AGENTS.md"), "# Agents\n\n- Run `bin/test`.\n");
  assertPrints(run(["claude", "project", "--cwd", repo]), join(repo, "AGENTS.md"));
});

test("an import of ~/ or an absolute path resolves against HOME or the root", (t) => {
  const home = scratch(t);
  mkdirSync(join(home, ".claude"));
  mkdirSync(join(home, "notes"));
  writeFileSync(join(home, ".claude", "CLAUDE.md"), "@~/notes/shared.md\n");
  writeFileSync(join(home, "notes", "shared.md"), `@${join(home, "notes", "real.md")}\n`);
  assertPrints(run(["claude", "global"], { home }), join(home, "notes", "real.md"));
});

test("a file with an import beside other content is the target itself", (t) => {
  const repo = gitRepo(join(scratch(t), "repo"));
  writeFileSync(join(repo, "CLAUDE.md"), "@AGENTS.md\n\n## Testing\n\n- Use `bin/test`.\n");
  assertPrints(run(["claude", "project", "--cwd", repo]), join(repo, "CLAUDE.md"));
  writeFileSync(join(repo, "CLAUDE.md"), "@AGENTS.md\n@docs/more.md\n");
  assertPrints(run(["claude", "project", "--cwd", repo]), join(repo, "CLAUDE.md"));
});

test("a symlink loop exits 4 and names the loop", (t) => {
  const repo = gitRepo(join(scratch(t), "repo"));
  symlinkSync("AGENTS.md", join(repo, "CLAUDE.md"));
  symlinkSync("CLAUDE.md", join(repo, "AGENTS.md"));
  const result = run(["claude", "project", "--cwd", repo]);
  assert.equal(result.status, 4);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /loop/);
});

test("an import loop exits 4", (t) => {
  const repo = gitRepo(join(scratch(t), "repo"));
  writeFileSync(join(repo, "CLAUDE.md"), "@AGENTS.md\n");
  writeFileSync(join(repo, "AGENTS.md"), "@./CLAUDE.md\n");
  const result = run(["claude", "project", "--cwd", repo]);
  assert.equal(result.status, 4);
  assert.match(result.stderr, /loop/);
});

test("project scope outside a git repository exits 2", (t) => {
  const result = run(["claude", "project", "--cwd", scratch(t)]);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /not inside a git repository/);
});

test("an unknown host exits 3", () => {
  const result = run(["cursor", "global"]);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /unknown host: cursor/);
});

test("wrong arguments or an unknown scope exit 1 with usage", () => {
  for (const args of [[], ["claude"], ["claude", "global", "--dir", "."], ["claude", "team"]]) {
    const result = run(args);
    assert.equal(result.status, 1, JSON.stringify(args));
    assert.match(result.stderr, /usage:/);
  }
});

test("project scope without git exits 69, while global scope needs no git", (t) => {
  const bin = join(scratch(t), "bin");
  mkdirSync(bin);
  for (const tool of ["dirname", "basename", "grep", "readlink"]) {
    const found = spawnSync(BASH, ["-c", `command -v ${tool}`], { encoding: "utf8" });
    symlinkSync(found.stdout.trim(), join(bin, tool));
  }
  const result = run(["claude", "project"], { path: bin });
  assert.equal(result.status, 69);
  assert.match(result.stderr, /missing required tool: git/);
  const home = scratch(t);
  assertPrints(run(["claude", "global"], { home, path: bin }), join(home, ".claude", "CLAUDE.md"));
});
