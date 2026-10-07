// Exercises scripts/lint-skills.mjs against temporary fixture repositories: a compliant skill
// passes, and each mechanical rule from docs/skill-authoring.md reports its own ID.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const LINT = resolve("scripts/lint-skills.mjs");
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
const SKILL = "skills/engineering/reviewing-widgets";
const DESCRIPTION = "Reviews widgets for defects. Use when the user asks to review a widget.";
const LINKS =
  "Read [the guide](references/guide.md) before reviewing. Follow [the rule](shared/rule.md).\n";
const LONG_GUIDE = `# Guide\n\n## Contents\n\n- Steps\n\n## Steps\n\n${"Step.\n".repeat(100)}`;

function skillFile({ name = "reviewing-widgets", description = DESCRIPTION, body = LINKS } = {}) {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n# Reviewing widgets\n\n${body}`;
}

function compliant(overrides = {}) {
  return {
    [`${SKILL}/SKILL.md`]: skillFile(),
    [`${SKILL}/references/guide.md`]: LONG_GUIDE,
    [`${SKILL}/shared/rule.md`]: "# Rule\n\nKeep it short.\n",
    ...overrides,
  };
}

function runLint(t, files, ...args) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "lint-skills-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  for (const gitArgs of [
    ["init", "-q"],
    ["add", "--", "skills"],
  ]) {
    const run = spawnSync("git", gitArgs, { cwd: root, env: GIT_ENV, encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
  }
  const run = spawnSync(process.execPath, [LINT, ...args], {
    cwd: root,
    env: GIT_ENV,
    encoding: "utf8",
  });
  return { status: run.status, output: run.stdout + run.stderr };
}

function assertReports(t, files, id, pattern) {
  const run = runLint(t, files);
  assert.equal(run.status, 1, run.output);
  assert.match(run.output, new RegExp(`: ${id} .*${pattern.source}`), run.output);
}

test("a compliant skill passes with no output", (t) => {
  const run = runLint(t, compliant());
  assert.deepEqual(run, { status: 0, output: "" });
});

test("archived skills under skills/deprecated are skipped", (t) => {
  const run = runLint(
    t,
    compliant({
      "skills/deprecated/old/SKILL.md": skillFile({
        name: "Old_Skill",
        description: "Use for old things.",
      }),
    }),
  );
  assert.deepEqual(run, { status: 0, output: "" });
});

test("A1 reports a name with invalid characters or a reserved word", (t) => {
  assertReports(
    t,
    compliant({ [`${SKILL}/SKILL.md`]: skillFile({ name: "Reviewing_Widgets" }) }),
    "A1",
    /name "Reviewing_Widgets" must be lowercase/,
  );
  assertReports(
    t,
    compliant({ [`${SKILL}/SKILL.md`]: skillFile({ name: "using-claude" }) }),
    "A1",
    /reserved word/,
  );
});

test("A2 reports a name that does not start with a gerund", (t) => {
  assertReports(
    t,
    compliant({ [`${SKILL}/SKILL.md`]: skillFile({ name: "review-widgets" }) }),
    "A2",
    /must start with a gerund/,
  );
});

test("A3 reports an overlong description and one containing an XML tag", (t) => {
  const long = `${DESCRIPTION} ${"word ".repeat(220)}`;
  assertReports(
    t,
    compliant({ [`${SKILL}/SKILL.md`]: skillFile({ description: long }) }),
    "A3",
    /description is \d+ characters; the limit is 1024/,
  );
  assertReports(
    t,
    compliant({
      [`${SKILL}/SKILL.md`]: skillFile({ description: `${DESCRIPTION} Emits <report>.` }),
    }),
    "A3",
    /XML tag/,
  );
});

test("A4 reports a description that opens without a third-person verb or addresses you", (t) => {
  assertReports(
    t,
    compliant({ [`${SKILL}/SKILL.md`]: skillFile({ description: "Use when reviewing widgets." }) }),
    "A4",
    /opens with "Use"/,
  );
  assertReports(
    t,
    compliant({
      [`${SKILL}/SKILL.md`]: skillFile({
        description: "This skill reviews widgets. Use when asked.",
      }),
    }),
    "A4",
    /opens with "This"/,
  );
  assertReports(
    t,
    compliant({
      [`${SKILL}/SKILL.md`]: skillFile({ description: "Reviews your widgets. Use when asked." }),
    }),
    "A4",
    /addresses I or you/,
  );
});

test("A4 does not read a hyphenated name such as oh-my-zsh as first person", (t) => {
  const description = "Configures oh-my-zsh plugins. Use when editing zsh configuration.";
  const run = runLint(t, compliant({ [`${SKILL}/SKILL.md`]: skillFile({ description }) }));
  assert.deepEqual(run, { status: 0, output: "" });
});

test("A5 reports a description without a Use when clause", (t) => {
  assertReports(
    t,
    compliant({
      [`${SKILL}/SKILL.md`]: skillFile({ description: "Reviews widgets for defects." }),
    }),
    "A5",
    /"Use when \.\.\." clause/,
  );
});

test("C1 reports a SKILL.md body of 500 lines or more", (t) => {
  const body = `${LINKS}${"Line.\n".repeat(499)}`;
  assertReports(
    t,
    compliant({ [`${SKILL}/SKILL.md`]: skillFile({ body }) }),
    "C1",
    /body is \d+ lines; keep it under 500/,
  );
});

test("C3 reports a bundled file that SKILL.md names only in a code span", (t) => {
  const body = "Read `references/guide.md` first. Follow [the rule](shared/rule.md).\n";
  assertReports(
    t,
    compliant({ [`${SKILL}/SKILL.md`]: skillFile({ body }) }),
    "C3",
    /references\/guide\.md is not linked from SKILL\.md/,
  );
});

test("C3 accepts links written with ./ and an anchor", (t) => {
  const body = "Read [steps](./references/guide.md#steps). Follow [the rule](shared/rule.md).\n";
  const run = runLint(t, compliant({ [`${SKILL}/SKILL.md`]: skillFile({ body }) }));
  assert.deepEqual(run, { status: 0, output: "" });
});

test("C4 reports a file over 100 lines whose first section is not Contents", (t) => {
  const guide = `# Guide\n\n## Steps\n\n${"Step.\n".repeat(100)}`;
  assertReports(
    t,
    compliant({ [`${SKILL}/references/guide.md`]: guide }),
    "C4",
    /open with a "## Contents" section/,
  );
});

test("C5 reports a backslash path", (t) => {
  const body = `${LINKS}See [the guide](references\\guide.md).\n`;
  assertReports(
    t,
    compliant({ [`${SKILL}/SKILL.md`]: skillFile({ body }) }),
    "C5",
    /use forward slashes in "references\\guide\.md"/,
  );
});

test("an argument exits 1 with a usage line", (t) => {
  const run = runLint(t, compliant(), "--fix");
  assert.equal(run.status, 1);
  assert.match(run.output, /^usage: node scripts\/lint-skills\.mjs/);
});
