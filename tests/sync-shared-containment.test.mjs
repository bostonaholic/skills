// Fails when scripts/sync-shared.mjs follows a symlink under a skill's shared/ path, so write mode
// could copy or delete outside the repository. Each case runs the real CLI in a temporary
// repository built with `git init` plus `git add`, never a commit, beside an outside directory
// whose files must survive.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const SYNC = resolve("scripts/sync-shared.mjs");
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
const RULE = "# Rule one\n\nKeep it short.\n";
const SENTINEL = "outside the repository\n";
const SKILL = "---\nname: widget\ndescription: Use for fixture checks.\n---\n\nRead [rule one](shared/rule-one.md) first.\n";

// Builds <tmp>/repo (staged, uncommitted) and <tmp>/outside/sentinel.md. `links` maps a repo path
// to the outside path its symlink points at.
function fixture(t, links) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "sync-containment-")));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const repo = join(base, "repo");
  const outside = join(base, "outside");
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(outside, "sentinel.md"), SENTINEL);
  for (const [path, text] of Object.entries({ "shared/rule-one.md": RULE, "skills/widget/SKILL.md": SKILL })) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), text);
  }
  for (const [path, target] of Object.entries(links)) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    symlinkSync(join(outside, target), join(repo, path));
  }
  for (const args of [["init", "-q"], ["add", "--", "shared", "skills"]]) {
    const run = spawnSync("git", args, { cwd: repo, env: GIT_ENV, encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
  }
  return { repo, sentinel: join(outside, "sentinel.md") };
}

function runSync(cwd, ...args) {
  assert.ok(existsSync(SYNC), `missing ${SYNC}`);
  const run = spawnSync(process.execPath, [SYNC, ...args], { cwd, env: GIT_ENV, encoding: "utf8" });
  return { status: run.status, output: run.stdout + run.stderr };
}

for (const args of [[], ["--check"]]) {
  const mode = args.length ? "--check" : "write mode";

  test(`${mode} refuses a skill whose shared/ is a symlink and leaves the outside directory intact`, (t) => {
    const { repo, sentinel } = fixture(t, { "skills/widget/shared": "." });
    const run = runSync(repo, ...args);
    assert.equal(run.status, 1, run.output);
    assert.match(run.output, /skills\/widget\/shared\b.*symlink/, run.output);
    assert.equal(readFileSync(sentinel, "utf8"), SENTINEL);
  });

  test(`${mode} refuses a symlinked file inside shared/ and leaves its outside target intact`, (t) => {
    const { repo, sentinel } = fixture(t, { "skills/widget/shared/rule-one.md": "sentinel.md" });
    const run = runSync(repo, ...args);
    assert.equal(run.status, 1, run.output);
    assert.match(run.output, /skills\/widget\/shared\/rule-one\.md\b.*symlink/, run.output);
    assert.equal(readFileSync(sentinel, "utf8"), SENTINEL);
  });
}
