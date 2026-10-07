// Fails when scripts/sync-shared.mjs follows a symlink under a skill's path or the root shared/,
// so write mode could copy or delete outside the repository, or copy outside bytes into a skill. Each case runs the real CLI in a temporary
// repository built with `git init` plus `git add`, never a commit, beside an outside directory
// whose files must survive.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const SYNC = resolve("scripts/sync-shared.mjs");
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
const RULE = "# Rule one\n\nKeep it short.\n";
const SENTINEL = "outside the repository\n";
const skill = (file) =>
  `---\nname: widget\ndescription: Use for fixture checks.\n---\n\nRead [the rule](shared/${file}) first.\n`;

// Builds <tmp>/repo (staged, uncommitted) and <tmp>/outside/sentinel.md. `links` maps a repo path
// to the outside path its symlink points at; a linked path replaces the file the fixture would
// write there. The skill links shared/<rule>. With `moveSkills`, skills/ moves to <tmp>/outside
// after staging and a symlink takes its place, so the index still lists the skill.
function fixture(t, links, { rule = "rule-one.md", moveSkills = false } = {}) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "sync-containment-")));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const repo = join(base, "repo");
  const outside = join(base, "outside");
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(outside, "sentinel.md"), SENTINEL);
  for (const [path, text] of Object.entries({
    "shared/rule-one.md": RULE,
    "skills/engineering/widget/SKILL.md": skill(rule),
  })) {
    if (Object.keys(links).some((link) => path === link || path.startsWith(`${link}/`))) continue;
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), text);
  }
  for (const [path, target] of Object.entries(links)) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    symlinkSync(join(outside, target), join(repo, path));
  }
  for (const args of [
    ["init", "-q"],
    ["add", "--", "shared", "skills"],
  ]) {
    const run = spawnSync("git", args, { cwd: repo, env: GIT_ENV, encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
  }
  if (moveSkills) {
    renameSync(join(repo, "skills"), join(outside, "skills"));
    symlinkSync(join(outside, "skills"), join(repo, "skills"));
  }
  return { repo, outside, sentinel: join(outside, "sentinel.md") };
}

// True when some output line starts with `<path>: `, the script's refusal form.
function refuses(output, path) {
  return output.split("\n").some((line) => line.startsWith(`${path}: `));
}

// The contents of every file in the skill's copy directory, read without following a link.
function skillCopies(repo) {
  const dir = join(repo, "skills", "engineering", "widget", "shared");
  if (!lstatSync(dir, { throwIfNoEntry: false })?.isDirectory()) return [];
  return readdirSync(dir).map((file) => readFileSync(join(dir, file), "utf8"));
}

function runSync(cwd, ...args) {
  assert.ok(existsSync(SYNC), `missing ${SYNC}`);
  const run = spawnSync(process.execPath, [SYNC, ...args], { cwd, env: GIT_ENV, encoding: "utf8" });
  return { status: run.status, output: run.stdout + run.stderr };
}

for (const args of [[], ["--check"]]) {
  const mode = args.length ? "--check" : "write mode";

  test(`${mode} refuses a skill whose shared/ is a symlink and leaves the outside directory intact`, (t) => {
    const { repo, sentinel } = fixture(t, { "skills/engineering/widget/shared": "." });
    const run = runSync(repo, ...args);
    assert.equal(run.status, 1, run.output);
    assert.match(run.output, /skills\/engineering\/widget\/shared\b.*symlink/, run.output);
    assert.equal(readFileSync(sentinel, "utf8"), SENTINEL);
  });

  test(`${mode} refuses a symlinked file inside shared/ and leaves its outside target intact`, (t) => {
    const { repo, sentinel } = fixture(t, {
      "skills/engineering/widget/shared/rule-one.md": "sentinel.md",
    });
    const run = runSync(repo, ...args);
    assert.equal(run.status, 1, run.output);
    assert.match(
      run.output,
      /skills\/engineering\/widget\/shared\/rule-one\.md\b.*symlink/,
      run.output,
    );
    assert.equal(readFileSync(sentinel, "utf8"), SENTINEL);
  });

  test(`${mode} refuses a skill reached through a symlinked skills/ before its shared/ exists`, (t) => {
    const { repo, outside } = fixture(t, {}, { moveSkills: true });
    const run = runSync(repo, ...args);
    assert.equal(run.status, 1, run.output);
    assert.ok(refuses(run.output, "skills/engineering/widget"), run.output);
    assert.equal(
      existsSync(join(outside, "skills", "engineering", "widget", "shared")),
      false,
      "created a shared/ outside the repository",
    );
  });

  test(`${mode} refuses a root shared/ that is a symlink and copies none of its bytes`, (t) => {
    const { repo } = fixture(t, { shared: "." }, { rule: "sentinel.md" });
    const run = runSync(repo, ...args);
    assert.equal(run.status, 1, run.output);
    assert.ok(refuses(run.output, "shared"), run.output);
    assert.deepEqual(
      skillCopies(repo).filter((text) => text === SENTINEL),
      [],
    );
  });

  test(`${mode} refuses a symlinked category before creating shared copies`, (t) => {
    const { repo, outside } = fixture(t, {});
    renameSync(join(repo, "skills/engineering"), join(outside, "engineering"));
    symlinkSync(join(outside, "engineering"), join(repo, "skills/engineering"));
    const run = runSync(repo, ...args);
    assert.equal(run.status, 1, run.output);
    assert.ok(refuses(run.output, "skills/engineering/widget"), run.output);
    assert.equal(existsSync(join(outside, "engineering/widget/shared")), false);
  });

  test(`${mode} refuses a tracked skill file that is a symlink before reading it`, (t) => {
    const { repo } = fixture(t, { "skills/engineering/widget/references/notes.md": "sentinel.md" });
    const run = runSync(repo, ...args);
    assert.equal(run.status, 1, run.output);
    assert.ok(refuses(run.output, "skills/engineering/widget/references/notes.md"), run.output);
  });

  test(`${mode} refuses a symlinked file in the root shared/ and copies none of its bytes`, (t) => {
    const { repo } = fixture(t, { "shared/rule-one.md": "sentinel.md" });
    const run = runSync(repo, ...args);
    assert.equal(run.status, 1, run.output);
    assert.ok(refuses(run.output, "shared/rule-one.md"), run.output);
    assert.deepEqual(
      skillCopies(repo).filter((text) => text === SENTINEL),
      [],
    );
  });
}
