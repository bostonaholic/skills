// Exercises scripts/sync-shared.mjs against the repository and temporary fixtures.
// Checks synchronization, missing inputs, drift detection, and stale-copy removal.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const REPO = resolve(".");
const SYNC = resolve("scripts/sync-shared.mjs");
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };

function runSync(cwd, ...args) {
  assert.ok(existsSync(SYNC), `missing ${SYNC}`);
  const run = spawnSync(process.execPath, [SYNC, ...args], { cwd, env: GIT_ENV, encoding: "utf8" });
  return { status: run.status, output: run.stdout + run.stderr };
}

function fixtureRepo(t, files) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "shared-sync-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  for (const args of [["init", "-q"], ["add", "--", "shared", "skills"]]) {
    const run = spawnSync("git", args, { cwd: root, env: GIT_ENV, encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
  }
  return root;
}

const RULE_ONE =
  "<!-- Canonical file: shared/rule-one.md at the repository root. Edit it there, then run npm run sync-shared. -->\n# Rule one\n\nKeep it short.\n";
const OLD_RULE =
  "<!-- Canonical file: shared/old-rule.md at the repository root. Edit it there, then run npm run sync-shared. -->\n# Old rule\n\nKeep it old.\n";

// ---------------------------------------------------------------------------------------------
// The repository

test("sync-shared --check passes: every copy equals its canonical bytes and the copy set equals the derived set", () => {
  const run = runSync(REPO, "--check");
  assert.equal(run.status, 0, run.output);
  assert.equal(run.output, "");
});

// ---------------------------------------------------------------------------------------------
// The CLI on fixture repositories

test("write mode exits 1 naming the link and the file when a linked canonical file is missing", (t) => {
  const root = fixtureRepo(t, {
    "shared/rule-one.md": RULE_ONE,
    "skills/widget/SKILL.md": "---\nname: widget\ndescription: Use for fixture checks.\n---\n\nRead the [absent rule](shared/absent-rule.md) first.\n",
  });
  const run = runSync(root);
  assert.equal(run.status, 1, run.output);
  assert.ok(run.output.includes("skills/widget/SKILL.md:6"), run.output);
  assert.ok(run.output.includes("shared/absent-rule.md"), run.output);
});

test("--check exits 1 naming the link and the file when a linked canonical file is missing", (t) => {
  const root = fixtureRepo(t, {
    "shared/rule-one.md": RULE_ONE,
    "skills/widget/SKILL.md": "---\nname: widget\ndescription: Use for fixture checks.\n---\n\nRead the [absent rule](shared/absent-rule.md) first.\n",
  });
  const run = runSync(root, "--check");
  assert.equal(run.status, 1, run.output);
  assert.ok(run.output.includes("skills/widget/SKILL.md:6"), run.output);
  assert.ok(run.output.includes("shared/absent-rule.md"), run.output);
});

test("--check exits 1 naming a copy that differs from its canonical file by one byte", (t) => {
  const root = fixtureRepo(t, {
    "shared/rule-one.md": RULE_ONE,
    "skills/widget/SKILL.md": "---\nname: widget\ndescription: Use for fixture checks.\n---\n\nRead [rule one](shared/rule-one.md) first.\n",
    "skills/widget/shared/rule-one.md": RULE_ONE,
  });
  assert.equal(runSync(root, "--check").status, 0, "the unedited fixture must pass --check");

  writeFileSync(join(root, "skills/widget/shared/rule-one.md"), RULE_ONE.replace("Keep it short.", "Keep it shorT."));
  const run = runSync(root, "--check");
  assert.equal(run.status, 1, run.output);
  assert.ok(run.output.includes("skills/widget/shared/rule-one.md"), run.output);
});

test("write mode removes a stale shared/ directory from a skill that links no shared rule", (t) => {
  const root = fixtureRepo(t, {
    "shared/old-rule.md": OLD_RULE,
    "skills/widget/SKILL.md": "---\nname: widget\ndescription: Use for fixture checks.\n---\n\nThis skill reads no shared rule.\n",
    "skills/widget/shared/old-rule.md": OLD_RULE,
    "skills/gadget/SKILL.md": "---\nname: gadget\ndescription: Use for fixture checks.\n---\n\nRead the [old rule](shared/old-rule.md) first.\n",
    "skills/gadget/shared/old-rule.md": OLD_RULE,
  });
  const run = runSync(root);
  assert.equal(run.status, 0, run.output);
  assert.equal(existsSync(join(root, "skills/widget/shared")), false, "skills/widget/shared/ survived write mode");
  assert.equal(readFileSync(join(root, "skills/gadget/shared/old-rule.md"), "utf8"), OLD_RULE);
});
