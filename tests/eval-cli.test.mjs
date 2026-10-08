// Fails when scripts/eval.mjs drops a flag the eval docs require, grants Bash or Edit to readonly
// cases, picks the wrong cases or cap, or misses a bad grader regex. Each case uses a synthetic
// evals tree or --dry-run, so no case calls a model.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  badGraderRegexes,
  discoverCases,
  parseArgs,
  planCommands,
  selectCases,
  withMissingCases,
} from "../scripts/eval.mjs";

const CLI = resolve("scripts/eval.mjs");

function tempDir(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "eval-cli-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeCase(root, skill, name, tags, graders = {}) {
  const dir = join(root, "engineering", skill, name);
  mkdirSync(join(dir, "graders"), { recursive: true });
  writeFileSync(join(dir, "prompt.md"), `---\ntags: [${tags.join(", ")}]\n---\n\nPrompt.\n`);
  for (const [file, body] of Object.entries(graders))
    writeFileSync(join(dir, "graders", file), body);
  return dir;
}

function syntheticSuite(t) {
  const root = tempDir(t);
  writeCase(root, "alpha", "alpha-trigger", ["readonly", "no-agent"]);
  writeCase(root, "alpha", "alpha-core", ["bash"]);
  writeCase(root, "beta", "beta-guard", ["readonly", "agent"]);
  mkdirSync(join(root, "results", "old-run"), { recursive: true });
  return discoverCases(root);
}

const STAMP = "STAMP";

test("defaults to Sonnet, --runs 1, and -j 4 for the whole suite", () => {
  assert.deepEqual(parseArgs([]), {
    model: "sonnet",
    jobs: 4,
    check: false,
    dryRun: false,
    passthrough: [],
    runs: 1,
  });
});

test("defaults to --runs 3 when a target is named", () => {
  assert.equal(parseArgs(["alpha"]).runs, 3);
});

test("passes arguments after -- through unchanged", () => {
  assert.deepEqual(parseArgs(["--", "--trust-plugin", "--verbose"]).passthrough, [
    "--trust-plugin",
    "--verbose",
  ]);
});

test("rejects --runs other than 1 or 3, two targets, and an unknown model with no cap", () => {
  assert.throws(() => parseArgs(["--runs", "2"]), /--runs must be 1 or 3/);
  assert.throws(() => parseArgs(["alpha", "beta"]), /one target only/);
  assert.throws(() => parseArgs(["--model", "claude-x"]), /pass --max-cost-usd/);
  assert.equal(parseArgs(["--model", "claude-x", "--max-cost-usd", "3"]).cap, 3);
});

test("discovers cases with their tags and skips the results directory", (t) => {
  const cases = syntheticSuite(t);
  assert.deepEqual(
    cases.map(({ name, skill, tags }) => ({ name, skill, tags })),
    [
      { name: "alpha-core", skill: "alpha", tags: ["bash"] },
      { name: "alpha-trigger", skill: "alpha", tags: ["readonly", "no-agent"] },
      { name: "beta-guard", skill: "beta", tags: ["readonly", "agent"] },
    ],
  );
});

test("selects by case name, then by skill name, and rejects an unknown target", (t) => {
  const cases = syntheticSuite(t);
  assert.equal(selectCases(cases, "alpha-core").caseGlob, "alpha-core");
  const bySkill = selectCases(cases, "alpha");
  assert.equal(bySkill.caseGlob, "alpha-*");
  assert.deepEqual(
    bySkill.selected.map((c) => c.name),
    ["alpha-core", "alpha-trigger"],
  );
  assert.throws(() => selectCases(cases, "gamma"), /no skill or case named gamma/);
});

test("whole-suite run uses the recorded-run caps and grants Edit and git only to bash", (t) => {
  const { selected, caseGlob } = selectCases(syntheticSuite(t), undefined);
  const [readonly, bash] = planCommands(parseArgs([]), selected, caseGlob, STAMP);
  assert.deepEqual(readonly.args, [
    "plugin",
    "eval",
    ".",
    "--tag",
    "readonly",
    "--runs",
    "1",
    "--threshold",
    "0",
    "--model",
    "sonnet",
    "--judge-model",
    "haiku",
    "-j",
    "4",
    "--scaffold",
    "--keep-temp",
    "--max-cost-usd",
    "85",
    "--no-publish",
    "--output-dir",
    join("evals", "results", "STAMP-sonnet-readonly"),
  ]);
  assert.deepEqual(readonly.cases, ["alpha-trigger", "beta-guard"]);
  assert.ok(!readonly.args.includes("--allow-tools"));
  const grant = bash.args.indexOf("--allow-tools");
  assert.deepEqual(bash.args.slice(grant, grant + 4), [
    "--allow-tools",
    "Edit",
    "Bash(git status:*)",
    "Bash(git diff:*)",
  ]);
  assert.equal(bash.args[bash.args.indexOf("--max-cost-usd") + 1], "10");
});

test("a scoped run uses the before-and-after cap and skips a tag with no selected case", (t) => {
  const { selected, caseGlob } = selectCases(syntheticSuite(t), "beta");
  const commands = planCommands(parseArgs(["beta", "--model", "opus"]), selected, caseGlob, STAMP);
  assert.deepEqual(
    commands.map((c) => c.tag),
    ["readonly"],
  );
  const { args } = commands[0];
  assert.equal(args[args.indexOf("--case") + 1], "beta-*");
  assert.equal(args[args.indexOf("--runs") + 1], "3");
  assert.equal(args[args.indexOf("--max-cost-usd") + 1], "30");
});

test("--max-cost-usd overrides the default cap", (t) => {
  const { selected, caseGlob } = selectCases(syntheticSuite(t), undefined);
  const commands = planCommands(parseArgs(["--max-cost-usd", "2"]), selected, caseGlob, STAMP);
  for (const { args } of commands) assert.equal(args[args.indexOf("--max-cost-usd") + 1], "2");
});

test("--check plans $0 load-check commands with no model, scaffold, or grants", (t) => {
  const { selected, caseGlob } = selectCases(syntheticSuite(t), "alpha");
  const commands = planCommands(parseArgs(["alpha", "--check"]), selected, caseGlob, STAMP);
  assert.deepEqual(
    commands.map((c) => c.args),
    [
      ["plugin", "eval", ".", "--tag", "readonly", "--case", "alpha-*", "--runs", "1"].concat([
        "--max-cost-usd",
        "0",
        "--no-publish",
      ]),
      ["plugin", "eval", ".", "--tag", "bash", "--case", "alpha-*", "--runs", "1"].concat([
        "--max-cost-usd",
        "0",
        "--no-publish",
      ]),
    ],
  );
});

test("reports a grader regex that does not compile and accepts quoted ones", (t) => {
  const root = tempDir(t);
  const dir = writeCase(root, "alpha", "alpha-core", ["readonly"], {
    "good.md": "---\ntype: tool_used\ninput_match: '\"skill\"\\s*:\\s*\"alpha''s\"'\n---\n",
    "bad.md": "---\ntype: regex\npattern: '(unclosed'\n---\n",
  });
  const problems = badGraderRegexes([dir]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /bad\.md: pattern: /);
});

test("adds an incomplete line for each selected case with no verdict line", () => {
  assert.deepEqual(withMissingCases(["b 1/1 excluded 0 pass"], ["a", "b"]), [
    "a - incomplete",
    "b 1/1 excluded 0 pass",
  ]);
});

test("--dry-run prints claude commands for a real skill and exits 0", () => {
  const run = spawnSync(process.execPath, [CLI, "reviewing-code", "--dry-run"], {
    encoding: "utf8",
  });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^claude plugin eval \. --tag readonly --case 'reviewing-code-\*' /);
});

test("a bad argument exits 2 with one stderr line", () => {
  const run = spawnSync(process.execPath, [CLI, "--runs", "5"], { encoding: "utf8" });
  assert.equal(run.status, 2);
  assert.equal(run.stdout, "");
  assert.match(run.stderr, /^eval\.mjs: --runs must be 1 or 3\n$/);
});
