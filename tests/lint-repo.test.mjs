// Exercises scripts/lint-repo.mjs against temporary fixture repositories. Fails when a compliant
// repository gets a report, when a changelog bullet without a matching PR link (rule 7), an em
// dash in repo-level prose (rule 10), or a package script or workflow line that runs the eval
// suite outside the eval and eval:handoff npm scripts (rule 11) goes unreported, or when an
// argument or a missing package.json does not exit non-zero.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { README_END, README_START, REPO_URL } from "../scripts/catalog.mjs";

const LINT = resolve("scripts/lint-repo.mjs");
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };

const CHANGELOG = `# Changelog\n\n## [Unreleased]\n\n## [0.2.0] - 2026-01-02\n\n- Report each widget defect with its file and line, so a reviewer can open the\n  failing widget directly. [#12](${REPO_URL}/pull/12)\n`;
const README = `# Skills\n\nThe skills I use.\n\n${README_START}\n- reviewing-widgets — reviews widgets\n${README_END}\n`;
const CI_WORKFLOW =
  "name: CI\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm test\n";

function packageJson(scripts) {
  return `${JSON.stringify({ name: "fixture", private: true, scripts }, null, 2)}\n`;
}

const SCRIPTS = {
  test: "node --test tests/*.test.mjs",
  eval: "node scripts/eval.mjs",
  "eval:handoff": "node scripts/eval-handoff.mjs",
};

function compliant(overrides = {}) {
  return {
    "CHANGELOG.md": CHANGELOG,
    "README.md": README,
    "docs/plans/2026-01-01-widgets/1-task.md": "# Task\n\nQuoted evidence — kept as written.\n",
    ".github/workflows/ci.yml": CI_WORKFLOW,
    "package.json": packageJson(SCRIPTS),
    ...overrides,
  };
}

function runLintRepo(t, files, ...args) {
  assert.ok(existsSync(LINT), `missing ${LINT}`);
  const root = realpathSync(mkdtempSync(join(tmpdir(), "lint-repo-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  for (const gitArgs of [
    ["init", "-q"],
    ["add", "-A"],
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

test("lint-repo passes a compliant repository with no output", (t) => {
  const run = runLintRepo(t, compliant());
  assert.deepEqual(run, { status: 0, output: "" });
});

test("lint-repo reports each violation as path: rule N line L", async (t) => {
  const summary = '1 problem(s). See AGENTS.md "Rules for changes".\n';

  await t.test("a #NNN bullet", (t) => {
    const run = runLintRepo(
      t,
      compliant({
        "CHANGELOG.md": `# Changelog\n\n## [Unreleased]\n\n- Fix the widget. [#NNN](${REPO_URL}/pull/NNN)\n`,
      }),
    );
    assert.equal(run.status, 1, run.output);
    assert.equal(
      run.output,
      `CHANGELOG.md: rule 7 line 5: end the bullet with [#NNN](https://github.com/bostonaholic/skills/pull/NNN), the PR number in both places\n${summary}`,
    );
  });

  await t.test("a bullet whose label and URL numbers differ", (t) => {
    const run = runLintRepo(
      t,
      compliant({
        "CHANGELOG.md": `# Changelog\n\n## [Unreleased]\n\n- Fix the widget. [#12](${REPO_URL}/pull/13)\n`,
      }),
    );
    assert.equal(run.status, 1, run.output);
    assert.equal(
      run.output,
      `CHANGELOG.md: rule 7 line 5: end the bullet with [#NNN](https://github.com/bostonaholic/skills/pull/NNN), the PR number in both places\n${summary}`,
    );
  });

  await t.test("no tracked CHANGELOG.md", (t) => {
    const files = compliant();
    delete files["CHANGELOG.md"];
    const run = runLintRepo(t, files);
    assert.equal(run.status, 1, run.output);
    assert.equal(run.output, `CHANGELOG.md: rule 7: not tracked\n${summary}`);
  });

  await t.test("an em dash in docs/guide.md", (t) => {
    const run = runLintRepo(
      t,
      compliant({ "docs/guide.md": "# Guide\n\nRun the check — then read it.\n" }),
    );
    assert.equal(run.status, 1, run.output);
    assert.equal(run.output, `docs/guide.md: rule 10 line 3: replace the em dash\n${summary}`);
  });

  await t.test("an em dash in README.md outside the generated block", (t) => {
    const run = runLintRepo(
      t,
      compliant({
        "README.md": `# Skills\n\nThe skills I use — daily.\n\n${README_START}\n- reviewing-widgets — reviews widgets\n${README_END}\n`,
      }),
    );
    assert.equal(run.status, 1, run.output);
    assert.equal(run.output, `README.md: rule 10 line 3: replace the em dash\n${summary}`);
  });

  await t.test("a README with no generated markers", (t) => {
    const run = runLintRepo(
      t,
      compliant({
        "README.md": "# Skills\n\nThe skills I use.\n\n- reviewing-widgets — reviews widgets\n",
      }),
    );
    assert.equal(run.status, 1, run.output);
    assert.equal(run.output, `README.md: rule 10 line 5: replace the em dash\n${summary}`);
  });

  // packageJson puts the first script key on line 5.
  await t.test("a pretest script that runs npm run eval", (t) => {
    const run = runLintRepo(
      t,
      compliant({
        "package.json": packageJson({ pretest: "npm run eval -- --check", ...SCRIPTS }),
      }),
    );
    assert.equal(run.status, 1, run.output);
    assert.equal(
      run.output,
      `package.json: rule 11 line 5: only the eval and eval:handoff npm scripts may run the eval suite (EVAL_SCRIPTS)\n${summary}`,
    );
  });

  await t.test("a posttest script that runs node scripts/eval-handoff.mjs", (t) => {
    const run = runLintRepo(
      t,
      compliant({
        "package.json": packageJson({ posttest: "node scripts/eval-handoff.mjs", ...SCRIPTS }),
      }),
    );
    assert.equal(run.status, 1, run.output);
    assert.equal(
      run.output,
      `package.json: rule 11 line 5: only the eval and eval:handoff npm scripts may run the eval suite (EVAL_SCRIPTS)\n${summary}`,
    );
  });

  await t.test("a .yaml workflow line that runs scripts/eval.mjs", (t) => {
    const run = runLintRepo(
      t,
      compliant({
        ".github/workflows/nightly.yaml":
          "name: Nightly\non: push\njobs:\n  evals:\n    runs-on: ubuntu-latest\n    steps:\n      - run: node scripts/eval.mjs --check\n",
      }),
    );
    assert.equal(run.status, 1, run.output);
    assert.equal(
      run.output,
      `.github/workflows/nightly.yaml: rule 11 line 7: only the eval and eval:handoff npm scripts may run the eval suite (EVAL_SCRIPTS)\n${summary}`,
    );
  });
});

test("lint-repo exits non-zero on an argument or a missing package.json", async (t) => {
  await t.test("an argument exits 1 with a usage line", (t) => {
    const run = runLintRepo(t, compliant(), "--fix");
    assert.equal(run.status, 1, run.output);
    assert.match(run.output, /^usage: node scripts\/lint-repo\.mjs/);
  });

  await t.test("a missing package.json exits non-zero with Node's error", (t) => {
    const files = compliant();
    delete files["package.json"];
    const run = runLintRepo(t, files);
    assert.notEqual(run.status, 0, run.output);
    assert.match(run.output, /ENOENT[^\n]*package\.json/);
  });
});
