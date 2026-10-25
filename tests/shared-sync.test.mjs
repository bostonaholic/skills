// Exercises scripts/sync-shared.mjs against the repository and temporary fixtures.
// Checks synchronization, missing inputs, drift detection, and stale-copy removal. Also fails when
// a root shared/ file has exactly one active-skill reader and SINGLE_READER does not name it, or
// when a SINGLE_READER entry no longer has exactly one reader (AGENTS.md rule 6).
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
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
  for (const args of [
    ["init", "-q"],
    ["add", "--", "shared", "skills"],
  ]) {
    const run = spawnSync("git", args, { cwd: root, env: GIT_ENV, encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
  }
  return root;
}

const RULE_ONE =
  "<!-- Canonical file: shared/rule-one.md at the repository root. Edit it there, then run npm run sync-shared. -->\n# Rule one\n\nKeep it short.\n";
const OLD_RULE =
  "<!-- Canonical file: shared/old-rule.md at the repository root. Edit it there, then run npm run sync-shared. -->\n# Old rule\n\nKeep it old.\n";

test("sync writes both active categories and preserves frozen archived copies", (t) => {
  const entry = "Read [rule one](shared/rule-one.md).\n";
  const root = fixtureRepo(t, {
    "shared/rule-one.md": RULE_ONE,
    "skills/engineering/widget/SKILL.md": entry,
    "skills/productivity/gadget/SKILL.md": entry,
    "skills/deprecated/old/SKILL.md.disabled": entry,
    "skills/deprecated/old/shared/rule-one.md": OLD_RULE,
  });
  const run = runSync(root);
  assert.equal(run.status, 0, run.output);
  for (const dir of ["engineering/widget", "productivity/gadget"]) {
    assert.equal(readFileSync(join(root, "skills", dir, "shared/rule-one.md"), "utf8"), RULE_ONE);
  }
  assert.equal(
    readFileSync(join(root, "skills/deprecated/old/shared/rule-one.md"), "utf8"),
    OLD_RULE,
  );
  assert.equal(runSync(root, "--check").status, 0);
});

// ---------------------------------------------------------------------------------------------
// The repository

test("sync-shared --check passes: every copy equals its canonical bytes and the copy set equals the derived set", () => {
  const run = runSync(REPO, "--check");
  assert.equal(run.status, 0, run.output);
  assert.equal(run.output, "");
});

// Root shared/ files that exactly one active skill copies, each with why it is not yet in that
// skill's references/. Only the real-tree test below reads these entries; no synthetic fixture
// depends on them, and that test fails on an entry that no longer has exactly one reader.
const SINGLE_READER = Object.freeze({
  "shared/human-control.md":
    "read only by grooming-backlogs; moving it into that skill's references/ is deferred",
});

test("every root shared/ file has more than one reader unless SINGLE_READER names it", () => {
  const tracked = (pathspec) =>
    execFileSync("git", ["ls-files", "-z", "--", pathspec], { cwd: REPO, encoding: "utf8" })
      .split("\0")
      .filter(Boolean);
  const readers = Object.groupBy(
    tracked("skills")
      .map((path) => path.match(/^skills\/(?:engineering|productivity)\/([^/]+)\/(shared\/.+)$/))
      .filter(Boolean),
    ([, , copy]) => copy,
  );
  const readerNames = (path) => (readers[path] ?? []).map(([, skill]) => skill);
  const singles = tracked("shared")
    .filter((path) => readerNames(path).length === 1 && !(path in SINGLE_READER))
    .map(
      (path) =>
        `AGENTS.md rule 6: ${path} has one reader (${readerNames(path)[0]}). Move it to that skill's references/, or add it to SINGLE_READER with a reason`,
    );
  const stale = Object.keys(SINGLE_READER)
    .filter((path) => readerNames(path).length !== 1)
    .map(
      (path) =>
        `AGENTS.md rule 6: SINGLE_READER names ${path}, which has ${readerNames(path).length} readers. Delete its entry.`,
    );
  assert.deepEqual([...singles, ...stale], []);
});

// ---------------------------------------------------------------------------------------------
// The CLI on fixture repositories

test("write mode exits 1 naming the link and the file when a linked canonical file is missing", (t) => {
  const root = fixtureRepo(t, {
    "shared/rule-one.md": RULE_ONE,
    "skills/engineering/widget/SKILL.md":
      "---\nname: widget\ndescription: Use for fixture checks.\n---\n\nRead the [absent rule](shared/absent-rule.md) first.\n",
  });
  const run = runSync(root);
  assert.equal(run.status, 1, run.output);
  assert.ok(run.output.includes("skills/engineering/widget/SKILL.md:6"), run.output);
  assert.ok(run.output.includes("shared/absent-rule.md"), run.output);
});

test("--check exits 1 naming the link and the file when a linked canonical file is missing", (t) => {
  const root = fixtureRepo(t, {
    "shared/rule-one.md": RULE_ONE,
    "skills/engineering/widget/SKILL.md":
      "---\nname: widget\ndescription: Use for fixture checks.\n---\n\nRead the [absent rule](shared/absent-rule.md) first.\n",
  });
  const run = runSync(root, "--check");
  assert.equal(run.status, 1, run.output);
  assert.ok(run.output.includes("skills/engineering/widget/SKILL.md:6"), run.output);
  assert.ok(run.output.includes("shared/absent-rule.md"), run.output);
});

test("--check exits 1 naming a copy that differs from its canonical file by one byte", (t) => {
  const root = fixtureRepo(t, {
    "shared/rule-one.md": RULE_ONE,
    "skills/engineering/widget/SKILL.md":
      "---\nname: widget\ndescription: Use for fixture checks.\n---\n\nRead [rule one](shared/rule-one.md) first.\n",
    "skills/engineering/widget/shared/rule-one.md": RULE_ONE,
  });
  assert.equal(runSync(root, "--check").status, 0, "the unedited fixture must pass --check");

  writeFileSync(
    join(root, "skills/engineering/widget/shared/rule-one.md"),
    RULE_ONE.replace("Keep it short.", "Keep it shorT."),
  );
  const run = runSync(root, "--check");
  assert.equal(run.status, 1, run.output);
  assert.ok(run.output.includes("skills/engineering/widget/shared/rule-one.md"), run.output);
});

test("write mode removes a stale shared/ directory from a skill that links no shared rule", (t) => {
  const root = fixtureRepo(t, {
    "shared/old-rule.md": OLD_RULE,
    "skills/engineering/widget/SKILL.md":
      "---\nname: widget\ndescription: Use for fixture checks.\n---\n\nThis skill reads no shared rule.\n",
    "skills/engineering/widget/shared/old-rule.md": OLD_RULE,
    "skills/engineering/gadget/SKILL.md":
      "---\nname: gadget\ndescription: Use for fixture checks.\n---\n\nRead the [old rule](shared/old-rule.md) first.\n",
    "skills/engineering/gadget/shared/old-rule.md": OLD_RULE,
  });
  const run = runSync(root);
  assert.equal(run.status, 0, run.output);
  assert.equal(
    existsSync(join(root, "skills/engineering/widget/shared")),
    false,
    "skills/engineering/widget/shared/ survived write mode",
  );
  assert.equal(
    readFileSync(join(root, "skills/engineering/gadget/shared/old-rule.md"), "utf8"),
    OLD_RULE,
  );
});

// ---------------------------------------------------------------------------------------------
// Shared scripts

const SCRIPT_TEXT = "#!/usr/bin/env node\nconsole.log('fetch');\n";
const SCRIPT_RULE =
  "# Rule with a script\n\nRun [`scripts/fetch.mjs`](scripts/fetch.mjs). Also see `scripts/other.mjs`.\n";

function scriptFixture(t, extra = {}) {
  const root = fixtureRepo(t, {
    "shared/rule-script.md": SCRIPT_RULE,
    "shared/scripts/fetch.mjs": SCRIPT_TEXT,
    "shared/scripts/other.mjs": SCRIPT_TEXT,
    "shared/scripts/unused.mjs": SCRIPT_TEXT,
    "skills/engineering/widget/SKILL.md": "Read [the rule](shared/rule-script.md).\n",
    ...extra,
  });
  chmodSync(join(root, "shared/scripts/fetch.mjs"), 0o755);
  return root;
}

test("sync copies each script a canonical file names into the skill's shared/scripts/ with its mode", (t) => {
  const root = scriptFixture(t);
  const run = runSync(root);
  assert.equal(run.status, 0, run.output);
  const scripts = join(root, "skills/engineering/widget/shared/scripts");
  assert.deepEqual(readdirSync(scripts).sort(), ["fetch.mjs", "other.mjs"]);
  assert.equal(readFileSync(join(scripts, "fetch.mjs"), "utf8"), SCRIPT_TEXT);
  assert.equal(statSync(join(scripts, "fetch.mjs")).mode & 0o111, 0o111);
  assert.equal(statSync(join(scripts, "other.mjs")).mode & 0o111, 0);
  assert.equal(runSync(root, "--check").status, 0);
});

test("sync copies a script a skill file names as shared/scripts/<f>.mjs", (t) => {
  const root = fixtureRepo(t, {
    "shared/scripts/fetch.mjs": SCRIPT_TEXT,
    "skills/engineering/widget/SKILL.md": "Run `shared/scripts/fetch.mjs`.\n",
  });
  const run = runSync(root);
  assert.equal(run.status, 0, run.output);
  assert.equal(
    readFileSync(join(root, "skills/engineering/widget/shared/scripts/fetch.mjs"), "utf8"),
    SCRIPT_TEXT,
  );
});

test("--check names a script copy whose content or executable bit drifted", (t) => {
  const root = scriptFixture(t);
  assert.equal(runSync(root).status, 0);
  const copy = join(root, "skills/engineering/widget/shared/scripts/fetch.mjs");
  const stale = "stale: skills/engineering/widget/shared/scripts/fetch.mjs";
  chmodSync(copy, 0o644);
  let run = runSync(root, "--check");
  assert.equal(run.status, 1, run.output);
  assert.ok(run.output.includes(stale), run.output);
  chmodSync(copy, 0o755);
  writeFileSync(copy, `${SCRIPT_TEXT}// edited\n`);
  run = runSync(root, "--check");
  assert.equal(run.status, 1, run.output);
  assert.ok(run.output.includes(stale), run.output);
});

test("--check names an extra script copy and write mode removes it with its empty directory", (t) => {
  const root = scriptFixture(t, {
    "skills/engineering/gadget/SKILL.md": "No shared rule.\n",
    "skills/engineering/gadget/shared/scripts/fetch.mjs": SCRIPT_TEXT,
  });
  const check = runSync(root, "--check");
  assert.equal(check.status, 1, check.output);
  assert.ok(
    check.output.includes("extra: skills/engineering/gadget/shared/scripts/fetch.mjs"),
    check.output,
  );
  assert.equal(runSync(root).status, 0);
  assert.equal(existsSync(join(root, "skills/engineering/gadget/shared")), false);
});

test("a canonical file naming a missing script exits 1 naming the file and line", (t) => {
  const root = fixtureRepo(t, {
    "shared/rule-script.md": "# Rule\n\nRun `scripts/absent.mjs`.\n",
    "skills/engineering/widget/SKILL.md": "Read [the rule](shared/rule-script.md).\n",
  });
  const run = runSync(root);
  assert.equal(run.status, 1, run.output);
  assert.ok(run.output.includes("shared/rule-script.md:3"), run.output);
  assert.ok(run.output.includes("shared/scripts/absent.mjs"), run.output);
});
