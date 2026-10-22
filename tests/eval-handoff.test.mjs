// Fails when scripts/eval-handoff.mjs misreports a stage-2 metric, spends past a stop rule, leaks a
// plugin or skill into a run, passes a hidden test that never ran, or reads anything but the
// committed tree. Every runHandoff case drives a fake claude executable on a synthetic fixture, and
// the CLI cases put a stub claude first on PATH, so no case calls a model.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test, { describe } from "node:test";
import { pathToFileURL } from "node:url";

const REPO = resolve(".");
const SCRIPT = resolve("scripts/eval-handoff.mjs");
const FIXTURE = resolve("evals/engineering/making-code-agent-friendly/handoff");
const RESULTS = resolve("evals/results");
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
const SKILL = "making-code-agent-friendly";

// A missing script fails each test on this assertion instead of an import crash.
async function handoff() {
  assert.ok(existsSync(SCRIPT), `missing ${SCRIPT}`);
  return import(pathToFileURL(SCRIPT).href);
}

function tempDir(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "eval-handoff-test-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function isUsageError(error) {
  return error instanceof Error && error.constructor.name === "UsageError";
}

function usageErrorNaming(text) {
  return (error) => isUsageError(error) && error.message.includes(text);
}

function writeFiles(root, files) {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), content);
  }
}

function gitIn(gitDir, args, extraEnv = {}) {
  const run = spawnSync(
    "git",
    [
      `--git-dir=${gitDir}`,
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "-c",
      "commit.gpgsign=false",
      ...args,
    ],
    { env: { ...GIT_ENV, ...extraEnv }, encoding: "utf8" },
  );
  assert.equal(run.status, 0, `git ${args.join(" ")}: ${run.stderr}`);
  return run.stdout.trim();
}

// ---------------------------------------------------------------------------------------------
// Fake claude. It answers --version, then performs one scripted action per run, in call order.
// Each action can write, remove, or symlink workspace files, set the exit code, shape the result
// event (cost, tokens, is_error, subtype, text), omit the result, pad the transcript, sleep, emit a
// non-JSON line, or patch the init event. The init event lists the three builtin plugins, and adds
// "<name>@inline" and "<name>:making-code-agent-friendly" only when argv holds --plugin-dir.
const FAKE_CLAUDE = String.raw`
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, writeSync } from "node:fs";
import { dirname, join } from "node:path";

const [scenarioPath, ...args] = process.argv.slice(2);
if (args.includes("--version")) {
  writeSync(1, "2.1.303 (Claude Code)\n");
  process.exit(0);
}
try {
  readFileSync(0);
} catch {}
const counterPath = join(dirname(scenarioPath), "counter");
const index = Number(readFileSync(counterPath, "utf8"));
writeFileSync(counterPath, String(index + 1));
const action = JSON.parse(readFileSync(scenarioPath, "utf8"))[index];
if (action === undefined) {
  writeSync(2, "fake claude: no scripted action for run " + (index + 1) + "\n");
  process.exit(97);
}

for (const [path, content] of Object.entries(action.write ?? {})) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}
for (const path of action.remove ?? []) rmSync(path, { force: true });
for (const [path, target] of Object.entries(action.symlink ?? {})) symlinkSync(target, path);

const plugins = [
  "cc-plugin-agents-md@builtin",
  "cc-plugin-telemetry@builtin",
  "cc-plugin-plugin-authoring@builtin",
].map((source) => ({ name: source.split("@")[0], path: "<builtin>", source }));
const skills = ["init", "review"];
const pluginDirAt = args.indexOf("--plugin-dir");
if (pluginDirAt !== -1) {
  const pluginDir = args[pluginDirAt + 1];
  const manifest = JSON.parse(readFileSync(join(pluginDir, ".claude-plugin", "plugin.json"), "utf8"));
  plugins.push({ name: manifest.name, path: pluginDir, source: manifest.name + "@inline", version: manifest.version });
  skills.push(manifest.name + ":making-code-agent-friendly");
}
const init = {
  type: "system",
  subtype: "init",
  cwd: process.cwd(),
  model: "claude-sonnet-5-5",
  mcp_servers: [],
  plugins,
  skills,
  ...action.initPatch,
};
if (!action.noInit) writeSync(1, JSON.stringify(init) + "\n");
if (action.padBytes) {
  const text = "x".repeat(action.padBytes);
  writeSync(1, JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text }] } }) + "\n");
}
if (action.badLine) writeSync(1, "this line is not JSON\n");
if (action.stderrBytes) writeSync(2, "e".repeat(action.stderrBytes));
if (action.sleepSeconds) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, action.sleepSeconds * 1000);
if (!action.noResult) {
  const [inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens] = action.tokens ?? [1, 1, 1, 1];
  const cost = "cost" in action ? action.cost : 0.01;
  const result = {
    type: "result",
    subtype: action.subtype ?? (action.isError ? "error_during_execution" : "success"),
    is_error: action.isError ?? false,
    result: action.text ?? "Done.",
    total_cost_usd: cost,
    modelUsage: {
      "claude-sonnet-5-5": { inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens, costUSD: cost },
    },
  };
  writeSync(1, JSON.stringify(result) + "\n");
}
process.exit(action.exit ?? 0);
`;

function fakeClaude(t, scenario) {
  const dir = tempDir(t);
  const script = join(dir, "fake-claude.mjs");
  const scenarioPath = join(dir, "scenario.json");
  const wrapper = join(dir, "claude");
  writeFileSync(script, FAKE_CLAUDE);
  writeFileSync(scenarioPath, JSON.stringify(scenario));
  writeFileSync(join(dir, "counter"), "0");
  // exec lets the claude timeout's SIGTERM reach the Node process itself.
  writeFileSync(
    wrapper,
    `#!/bin/sh\nexec "${process.execPath}" "${script}" "${scenarioPath}" "$@"\n`,
  );
  chmodSync(wrapper, 0o755);
  return { path: wrapper, runs: () => Number(readFileSync(join(dir, "counter"), "utf8")) };
}

// ---------------------------------------------------------------------------------------------
// Synthetic fixture: a kind list, one migration, one agent test, and the four accept files. The
// scaffold appends to scaffoldLog, so a test can tell whether it ran.
const KINDS_AS_LIST = 'export const kinds = ["invoice"];\n';
const KINDS_AS_DIRECTORY_SCAN =
  'import { readdirSync } from "node:fs";\n\n' +
  'export const kinds = readdirSync(new URL("../kinds/", import.meta.url)).sort();\n';

function syntheticFixture(t) {
  const root = tempDir(t);
  const repoRoot = join(root, "repo");
  const fixtureDir = join(repoRoot, "fixture");
  const skillDir = join(repoRoot, "skill");
  const resultsRoot = join(root, "results");
  const scaffoldLog = join(root, "scaffold-ran.log");
  mkdirSync(resultsRoot);
  writeFiles(repoRoot, {
    ".claude-plugin/plugin.json": JSON.stringify({ name: "fixture-plugin", version: "0.0.0" }),
  });
  writeFiles(skillDir, {
    "SKILL.md": "---\nname: making-code-agent-friendly\n---\n\n# Synthetic skill\n",
    "references/principles.md": "# Principles\n",
  });
  writeFiles(fixtureDir, {
    "scaffold.sh": [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      `echo ran >>'${scaffoldLog}'`,
      "mkdir -p src migrations test",
      "cat >package.json <<'EOF'",
      '{ "type": "module", "scripts": { "test": "node --test" } }',
      "EOF",
      "cat >src/kinds.js <<'EOF'",
      KINDS_AS_LIST.trimEnd(),
      "EOF",
      "cat >migrations/0001_init.sql <<'EOF'",
      "CREATE TABLE invoices (id INTEGER PRIMARY KEY);",
      "EOF",
      "cat >test/kinds.test.js <<'EOF'",
      'import assert from "node:assert/strict";',
      'import test from "node:test";',
      'import { kinds } from "../src/kinds.js";',
      "",
      'test("lists the invoice kind", () => {',
      '  assert.ok(kinds.includes("invoice"));',
      "});",
      "EOF",
      "",
    ].join("\n"),
    "refactor.md": "Refactor so each new kind is its own file.\n",
    "tasks/invoice-reopen.md": "Add the invoice-reopen kind.\n",
    "tasks/payment-chargeback.md": "Add the payment-chargeback kind.\n",
    "accept/baseline.test.mjs": [
      'import assert from "node:assert/strict";',
      'import { readdirSync } from "node:fs";',
      'import test from "node:test";',
      'import { kinds } from "../src/kinds.js";',
      "",
      'test("baseline: the invoice kind is listed", () => {',
      '  assert.ok(kinds.includes("invoice"));',
      "});",
      "",
      'test("baseline: migration versions are unique", () => {',
      '  const names = readdirSync(new URL("../migrations/", import.meta.url));',
      "  const versions = names.map((name) => name.slice(0, 4));",
      "  assert.equal(new Set(versions).size, versions.length);",
      "});",
      "",
    ].join("\n"),
    "accept/stage1.test.mjs": [
      'import assert from "node:assert/strict";',
      'import { readdirSync } from "node:fs";',
      'import test from "node:test";',
      "",
      'test("stage1: the migration list is exactly the original", () => {',
      '  assert.deepEqual(readdirSync(new URL("../migrations/", import.meta.url)), ["0001_init.sql"]);',
      "});",
      "",
    ].join("\n"),
    "accept/invoice-reopen.test.mjs": [
      'import assert from "node:assert/strict";',
      'import test from "node:test";',
      'import { kinds } from "../src/kinds.js";',
      "",
      'test("invoice-reopen: the invoice-reopen kind is listed", () => {',
      '  assert.ok(kinds.includes("invoice-reopen"));',
      "});",
      "",
    ].join("\n"),
    "accept/payment-chargeback.test.mjs": [
      'import assert from "node:assert/strict";',
      'import test from "node:test";',
      'import { kinds } from "../src/kinds.js";',
      "",
      'test("payment-chargeback: the payment-chargeback kind is listed", () => {',
      '  assert.ok(kinds.includes("payment-chargeback"));',
      "});",
      "",
    ].join("\n"),
  });
  return { repoRoot, fixtureDir, skillDir, resultsRoot, scaffoldLog };
}

// Runs one runHandoff command on a fresh synthetic fixture. Returns its exit code, its stdout
// lines, the results file, and the number of claude runs the fake saw.
async function runScenario(t, { options, scenario, ...timeouts }) {
  const { runHandoff } = await handoff();
  const fixture = syntheticFixture(t);
  const claude = fakeClaude(t, scenario);
  const log = t.mock.method(console, "log", () => {});
  t.mock.method(console, "error", () => {});
  const code = await runHandoff({
    options,
    fixtureDir: fixture.fixtureDir,
    skillDir: fixture.skillDir,
    repoRoot: fixture.repoRoot,
    resultsRoot: fixture.resultsRoot,
    claude: claude.path,
    ...timeouts,
  });
  const lines = log.mock.calls.map((call) => call.arguments.join(" "));
  return { code, lines, results: readResults(t, fixture.resultsRoot), claudeRuns: claude.runs() };
}

function readResults(t, resultsRoot) {
  const dirs = readdirSync(resultsRoot);
  assert.equal(dirs.length, 1, `expected one results directory, found ${dirs.join(", ")}`);
  assert.match(dirs[0], /-handoff$/);
  const results = JSON.parse(
    readFileSync(join(resultsRoot, dirs[0], "handoff-result.json"), "utf8"),
  );
  // The script keeps run roots and scratch git directories on purpose, so each test removes its
  // own.
  t.after(() => {
    for (const dir of [results.runRoot, results.scratchGitDir])
      if (typeof dir === "string" && dir.includes("eval-handoff-"))
        rmSync(dir, { recursive: true, force: true });
  });
  return results;
}

const runLines = (lines) => lines.filter((line) => /^(with|without) \d+: /.test(line));
const summaryLines = (lines) => lines.filter((line) => /^(with|without): /.test(line));

// Runs the hidden files the way the script's hidden test run does: Node's test runner under the
// permission model, limited to dir, with a TAP report. Spelled out here because the script exports
// no command builder.
function nodeTestRun(dir, hiddenFiles) {
  const run = spawnSync(
    process.execPath,
    [
      "--permission",
      `--allow-fs-read=${dir}`,
      `--allow-fs-write=${dir}`,
      "--test",
      "--experimental-test-isolation=none",
      "--test-reporter=tap",
      ...hiddenFiles.map((file) => `eval-hidden/${file}`),
    ],
    { cwd: dir, env: { PATH: process.env.PATH }, encoding: "utf8" },
  );
  return { status: run.status, signal: run.signal, tap: run.stdout };
}

// Copies the base into a fresh test directory and adds the given accept files to eval-hidden/.
function hiddenTestDir(base, dest, acceptFiles) {
  cpSync(base, dest, { recursive: true });
  mkdirSync(join(dest, "eval-hidden"));
  for (const file of acceptFiles)
    cpSync(join(FIXTURE, "accept", file), join(dest, "eval-hidden", file));
  return dest;
}

// ---------------------------------------------------------------------------------------------
describe("slice 1: run both stages per arm and report the four stage-2 metrics", () => {
  test("runHandoff reports stage-2 metrics per arm on a synthetic fixture", async (t) => {
    const reopenAsList = 'export const kinds = ["invoice", "invoice-reopen"];\n';
    const chargebackAsList = 'export const kinds = ["invoice", "payment-chargeback"];\n';
    const { code, lines, results, claudeRuns } = await runScenario(t, {
      options: { model: "sonnet", runs: 3, capUsd: 36, runBudgetUsd: 2, dryRun: false },
      scenario: [
        // with 1: a refactor to a directory scan, two new kind files, a clean merge.
        {
          write: { "src/kinds.js": KINDS_AS_DIRECTORY_SCAN, "kinds/invoice": "" },
          cost: 0.5,
        },
        {
          write: { "kinds/invoice-reopen": "" },
          tokens: [10, 200, 3000, 40000],
          cost: 0.25,
          padBytes: 1_200_000,
        },
        { write: { "kinds/payment-chargeback": "" }, tokens: [20, 300, 4000, 50000], cost: 0.25 },
        // without 1: no refactor, both tasks edit the same line, a conflict.
        { cost: 0.4 },
        { write: { "src/kinds.js": reopenAsList }, tokens: [50, 600, 7000, 80000], cost: 0.3 },
        { write: { "src/kinds.js": chargebackAsList }, tokens: [60, 700, 8000, 90000], cost: 0.3 },
        // with 2: two tasks take migration 0002, so the text-clean merge fails the baseline.
        {
          write: { "src/kinds.js": KINDS_AS_DIRECTORY_SCAN, "kinds/invoice": "" },
          cost: 0.5,
        },
        {
          write: { "kinds/invoice-reopen": "", "migrations/0002_reopen.sql": "-- reopen\n" },
          tokens: [30, 400, 5000, 60000],
          cost: 0.2,
        },
        {
          write: { "kinds/payment-chargeback": "", "migrations/0002_chargeback.sql": "-- cb\n" },
          tokens: [40, 500, 6000, 70000],
          cost: 0.3,
        },
        // without 2: stage 1 drops the original kind and edits the agent suite to match.
        {
          write: {
            "src/kinds.js": 'export const kinds = ["receipt"];\n',
            "test/kinds.test.js":
              'import assert from "node:assert/strict";\nimport test from "node:test";\n' +
              'import { kinds } from "../src/kinds.js";\n\n' +
              'test("lists the receipt kind", () => {\n  assert.ok(kinds.includes("receipt"));\n});\n',
          },
          cost: 0.75,
        },
        // with 3: the stage-1 claude run fails.
        { exit: 1, isError: true, cost: 0.1 },
        // without 3: one task run fails.
        { cost: 0.2 },
        { write: { "src/kinds.js": reopenAsList }, tokens: [5, 5, 5, 5], cost: 0.2 },
        { exit: 1, isError: true, tokens: [1, 2, 3, 4], cost: 0.05 },
      ],
    });

    assert.deepEqual(runLines(lines), [
      "with 1: stage1 ok files 2 | invoice-reopen pass tokens 43210 files 1 | payment-chargeback pass tokens 54320 files 1 | merge clean | $1.00 complete",
      "without 1: stage1 ok files 0 | invoice-reopen pass tokens 87650 files 1 | payment-chargeback pass tokens 98760 files 1 | merge conflict | $1.00 complete",
      "with 2: stage1 ok files 2 | invoice-reopen pass tokens 65430 files 2 | payment-chargeback pass tokens 76540 files 2 | merge broken | $1.00 complete",
      "without 2: stage1 fail files 2 | invoice-reopen skipped | payment-chargeback skipped | merge n/a | $0.75 incomplete",
      "with 3: stage1 error: exit 1 files 0 | invoice-reopen skipped | payment-chargeback skipped | merge n/a | $0.10 incomplete",
      "without 3: stage1 ok files 0 | invoice-reopen pass tokens 20 files 1 | payment-chargeback error: exit 1 tokens 10 files 0 | merge n/a | $0.45 incomplete",
    ]);
    assert.deepEqual(summaryLines(lines), [
      "with: complete 2/3, both passed 2/2, merged clean 1/2 (conflict 0, broken 1), tokens 97530-141970 median 119750, files 2-4 median 3, cost $2.10",
      "without: complete 1/3, both passed 1/1, merged clean 0/1 (conflict 1, broken 0), tokens 186410-186410 median 186410, files 2-2 median 2, cost $2.20",
    ]);
    assert.equal(code, 1);
    assert.equal(claudeRuns, 14);

    assert.equal(results.finished, true);
    assert.equal(results.stopped, null);
    assert.ok(Math.abs(results.costUsd - 4.3) < 1e-9, `costUsd ${results.costUsd}`);
    const with1 = results.runs[0];
    assert.equal(with1.costUsd, 1);
    assert.deepEqual(with1.stage1.paths, ["kinds/invoice", "src/kinds.js"]);
    assert.equal(with1.tasks[0].name, "invoice-reopen");
    assert.equal(with1.tasks[0].tokens, 43210);
    assert.equal(with1.tasks[0].costUsd, 0.25);
    assert.deepEqual(with1.tasks[0].paths, ["kinds/invoice-reopen"]);
    // The commit ids let the maintainer read each diff in the scratch git directory, which sits
    // outside the run root that the agent workspaces share.
    const scratch = results.scratchGitDir;
    assert.equal(typeof scratch, "string");
    assert.ok(!scratch.startsWith(`${results.runRoot}/`), `${scratch} is inside the run root`);
    assert.equal(
      gitIn(scratch, ["diff", "--name-only", with1.stage1.commit, with1.tasks[0].commit]),
      "kinds/invoice-reopen",
    );
  });

  test("real handoff fixture passes on its base and fails each task test", async (t) => {
    const { judgeTestRun } = await handoff();
    assert.ok(existsSync(join(FIXTURE, "scaffold.sh")), `missing ${FIXTURE}/scaffold.sh`);
    const root = tempDir(t);
    const base = join(root, "base");
    mkdirSync(base);
    const scaffold = spawnSync("bash", [join(FIXTURE, "scaffold.sh")], {
      cwd: base,
      encoding: "utf8",
    });
    assert.equal(scaffold.status, 0, scaffold.stderr);

    await t.test("the base passes its own suite", () => {
      const dir = join(root, "suite");
      cpSync(base, dir, { recursive: true });
      const run = nodeTestRun(dir, []);
      assert.equal(judgeTestRun({ ...run, hiddenPrefixes: [] }).passed, true, run.tap);
    });

    await t.test("the base passes the baseline and stage1 hidden tests", () => {
      const files = ["baseline.test.mjs", "stage1.test.mjs"];
      const dir = hiddenTestDir(base, join(root, "stage1-hidden"), files);
      const run = nodeTestRun(dir, files);
      const verdict = judgeTestRun({ ...run, hiddenPrefixes: ["baseline", "stage1"] });
      assert.equal(verdict.passed, true, run.tap);
    });

    await t.test("the invoice-reopen task test fails on the base", () => {
      const files = ["baseline.test.mjs", "invoice-reopen.test.mjs"];
      const dir = hiddenTestDir(base, join(root, "reopen-hidden"), files);
      const run = nodeTestRun(dir, files);
      const verdict = judgeTestRun({ ...run, hiddenPrefixes: ["baseline", "invoice-reopen"] });
      assert.equal(verdict.passed, false, run.tap);
      assert.match(run.tap, /^not ok \d+ - invoice-reopen: /m);
    });

    await t.test("the payment-chargeback task test fails on the base", () => {
      const files = ["baseline.test.mjs", "payment-chargeback.test.mjs"];
      const dir = hiddenTestDir(base, join(root, "chargeback-hidden"), files);
      const run = nodeTestRun(dir, files);
      const verdict = judgeTestRun({ ...run, hiddenPrefixes: ["baseline", "payment-chargeback"] });
      assert.equal(verdict.passed, false, run.tap);
      assert.match(run.tap, /^not ok \d+ - payment-chargeback: /m);
    });

    await t.test("a listMigrations with no duplicate check fails only the duplicate test", () => {
      const dir = hiddenTestDir(base, join(root, "stub-hidden"), ["baseline.test.mjs"]);
      writeFileSync(
        join(dir, "src", "migrations.js"),
        'import { readdirSync } from "node:fs";\n\n' +
          'export function listMigrations(dir = new URL("../migrations/", import.meta.url)) {\n' +
          '  return readdirSync(dir).filter((name) => name.endsWith(".sql")).sort();\n' +
          "}\n",
      );
      const run = nodeTestRun(dir, ["baseline.test.mjs"]);
      assert.equal(judgeTestRun({ ...run, hiddenPrefixes: ["baseline"] }).passed, false, run.tap);
      const failures = run.tap.match(/^not ok .*/gm) ?? [];
      assert.equal(failures.length, 1, failures.join("\n"));
      assert.match(failures[0], /^not ok \d+ - baseline: .*duplicate/i);
    });

    await t.test("two new 0044 migrations fail the baseline", () => {
      const dir = hiddenTestDir(base, join(root, "af3-hidden"), ["baseline.test.mjs"]);
      writeFiles(dir, {
        "migrations/0044_add_invoices_reopened_at.sql":
          "ALTER TABLE invoices ADD COLUMN reopened_at TEXT;\n",
        "migrations/0044_add_payments_charged_back_at.sql":
          "ALTER TABLE payments ADD COLUMN charged_back_at TEXT;\n",
      });
      const run = nodeTestRun(dir, ["baseline.test.mjs"]);
      assert.equal(judgeTestRun({ ...run, hiddenPrefixes: ["baseline"] }).passed, false, run.tap);
      assert.match(run.tap, /^not ok \d+ - baseline: /m);
    });
  });

  test("parseArgs applies defaults, per-model caps, and the per-run budget", async (t) => {
    const { parseArgs } = await handoff();

    await t.test("no flags give sonnet, 3 runs, a $36 cap, and $2 per claude run", () => {
      const { model, runs, capUsd, runBudgetUsd } = parseArgs([]);
      assert.deepEqual(
        { model, runs, capUsd, runBudgetUsd },
        {
          model: "sonnet",
          runs: 3,
          capUsd: 36,
          runBudgetUsd: 2,
        },
      );
    });

    await t.test("haiku at one run gives a $6 cap and $1 per claude run", () => {
      const { capUsd, runBudgetUsd } = parseArgs(["--model", "haiku", "--runs", "1"]);
      assert.deepEqual({ capUsd, runBudgetUsd }, { capUsd: 6, runBudgetUsd: 1 });
    });

    await t.test("an explicit cap divides by 6 x --runs and rounds down to the cent", () => {
      const { capUsd, runBudgetUsd } = parseArgs(["--max-cost-usd", "10", "--runs", "1"]);
      assert.deepEqual({ capUsd, runBudgetUsd }, { capUsd: 10, runBudgetUsd: 1.66 });
    });

    await t.test("the cent floor survives float error", () => {
      // 1.74 / 6 is 0.29, but 0.29 * 100 is 28.999999999999996 in floating point.
      assert.equal(parseArgs(["--max-cost-usd", "1.74", "--runs", "1"]).runBudgetUsd, 0.29);
    });

    await t.test("--runs 0 is a usage error", () => {
      assert.throws(() => parseArgs(["--runs", "0"]), isUsageError);
    });

    await t.test("--runs 6 is a usage error", () => {
      assert.throws(() => parseArgs(["--runs", "6"]), isUsageError);
    });

    await t.test("--runs 2.5 is a usage error", () => {
      assert.throws(() => parseArgs(["--runs", "2.5"]), isUsageError);
    });

    await t.test("an unknown flag is a usage error", () => {
      assert.throws(() => parseArgs(["--bogus"]), isUsageError);
    });

    await t.test("a flag with no value is a usage error", () => {
      assert.throws(() => parseArgs(["--model"]), isUsageError);
    });

    await t.test("an unknown model with no cap is a usage error", () => {
      assert.throws(() => parseArgs(["--model", "claude-x"]), isUsageError);
    });

    await t.test("a zero cap is a usage error", () => {
      assert.throws(() => parseArgs(["--max-cost-usd", "0"]), isUsageError);
    });

    await t.test("a cap that is not a number is a usage error", () => {
      assert.throws(() => parseArgs(["--max-cost-usd", "abc"]), isUsageError);
    });

    await t.test("a cap under $0.01 per claude run is a usage error", () => {
      assert.throws(() => parseArgs(["--max-cost-usd", "0.05", "--runs", "1"]), isUsageError);
    });
  });
});

// ---------------------------------------------------------------------------------------------
describe("slice 2: stop the command on budget, missing cost, or a failed first run", () => {
  const init = JSON.stringify({ type: "system", subtype: "init", mcp_servers: [], plugins: [] });
  const usage = (inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens) => ({
    inputTokens,
    outputTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens,
  });

  test("readStreamResult reads tokens, cost, and errors from a transcript", async (t) => {
    const { readStreamResult } = await handoff();

    await t.test("a success sums modelUsage over every model and reads total_cost_usd", () => {
      const result = JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: false,
        result: "Done.",
        total_cost_usd: 0.4321,
        modelUsage: {
          "claude-sonnet-5-5": usage(100, 20, 3000, 400),
          "claude-haiku-5-5": usage(5, 6, 7, 8),
        },
      });
      const read = readStreamResult(`${init}\n${result}\n`);
      assert.equal(read.tokens, 3546);
      assert.equal(read.costUsd, 0.4321);
      assert.equal(read.errorReason ?? null, null);
    });

    await t.test("subtype error_max_budget_usd reads budget", () => {
      const result = JSON.stringify({
        type: "result",
        subtype: "error_max_budget_usd",
        is_error: true,
        total_cost_usd: 0.53,
        modelUsage: { "claude-haiku-5-5": usage(4, 421, 16168, 4250) },
      });
      assert.equal(readStreamResult(`${init}\n${result}\n`).errorReason, "budget");
    });

    await t.test("a transcript with no result event has no cost", () => {
      const assistant = JSON.stringify({ type: "assistant", message: { content: [] } });
      assert.equal(readStreamResult(`${init}\n${assistant}\n`).costUsd, null);
    });

    await t.test("a missing total_cost_usd gives no cost", () => {
      const result = '{"type":"result","subtype":"success","is_error":false,"modelUsage":{}}';
      assert.equal(readStreamResult(`${init}\n${result}\n`).costUsd, null);
    });

    await t.test("a null total_cost_usd gives no cost", () => {
      const result = '{"type":"result","subtype":"success","is_error":false,"total_cost_usd":null}';
      assert.equal(readStreamResult(`${init}\n${result}\n`).costUsd, null);
    });

    await t.test("a string total_cost_usd gives no cost", () => {
      const result =
        '{"type":"result","subtype":"success","is_error":false,"total_cost_usd":"0.5"}';
      assert.equal(readStreamResult(`${init}\n${result}\n`).costUsd, null);
    });

    await t.test("a negative total_cost_usd gives no cost", () => {
      const result = '{"type":"result","subtype":"success","is_error":false,"total_cost_usd":-1}';
      assert.equal(readStreamResult(`${init}\n${result}\n`).costUsd, null);
    });

    await t.test("an infinite total_cost_usd gives no cost", () => {
      const result =
        '{"type":"result","subtype":"success","is_error":false,"total_cost_usd":1e999}';
      assert.equal(readStreamResult(`${init}\n${result}\n`).costUsd, null);
    });

    await t.test("a line that is not JSON reads bad output", () => {
      const result = '{"type":"result","subtype":"success","is_error":false,"total_cost_usd":0.1}';
      const read = readStreamResult(`${init}\nthis line is not JSON\n${result}\n`);
      assert.equal(read.errorReason, "bad output");
    });

    await t.test("an is_error result about a usage limit reads limit", () => {
      const result = JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: true,
        result: "Claude AI usage limit reached",
        total_cost_usd: 0.01,
      });
      assert.equal(readStreamResult(`${init}\n${result}\n`).errorReason, "limit");
    });
  });

  test("runHandoff stops on each stop rule", async (t) => {
    const haikuCap3 = { model: "haiku", runs: 1, capUsd: 3, runBudgetUsd: 0.5, dryRun: false };

    await t.test("budget: a first run over budget ends with Caller example 3", async (t) => {
      const { code, lines, results, claudeRuns } = await runScenario(t, {
        options: haikuCap3,
        scenario: [
          {
            write: {
              "a.txt": "a\n",
              "b.txt": "b\n",
              "c.txt": "c\n",
              "d.txt": "d\n",
              "e.txt": "e\n",
            },
            exit: 1,
            isError: true,
            subtype: "error_max_budget_usd",
            cost: 0.53,
          },
        ],
      });
      assert.match(lines.at(-1), /^== results: .*\/handoff-result\.json$/);
      assert.deepEqual(lines.slice(-5, -1), [
        "with 1: stage1 error: budget files 5 | invoice-reopen skipped | payment-chargeback skipped | merge n/a | $0.53 incomplete",
        "== stopped: budget. with 1 stage1 spent $0.53, above its $0.50 budget. Raise --max-cost-usd.",
        "with: complete 0/1, both passed 0/0, merged clean 0/0 (conflict 0, broken 0), tokens n/a, files n/a, cost $0.53",
        "without: complete 0/1, both passed 0/0, merged clean 0/0 (conflict 0, broken 0), tokens n/a, files n/a, cost $0.00",
      ]);
      assert.deepEqual(results.stopped, {
        rule: "budget",
        detail: "with 1 stage1 spent $0.53, above its $0.50 budget. Raise --max-cost-usd.",
      });
      assert.deepEqual(
        results.runs[0].tasks.map((task) => task.status),
        ["skipped", "skipped"],
      );
      assert.equal(results.runs[0].merge.status, "n/a");
      assert.equal(results.finished, true);
      assert.equal(code, 1);
      assert.equal(claudeRuns, 1);
    });

    await t.test(
      "budget: a run at its budget goes on and a later run above it stops",
      async (t) => {
        const { code, lines, results, claudeRuns } = await runScenario(t, {
          options: haikuCap3,
          scenario: [{ cost: 0.5 }, { cost: 0.51 }],
        });
        assert.deepEqual(runLines(lines), [
          "with 1: stage1 ok files 0 | invoice-reopen error: budget tokens 4 files 0 | payment-chargeback skipped | merge n/a | $1.01 incomplete",
        ]);
        assert.ok(
          lines.includes(
            "== stopped: budget. with 1 invoice-reopen spent $0.51, above its $0.50 budget. Raise --max-cost-usd.",
          ),
          lines.join("\n"),
        );
        assert.equal(results.stopped.rule, "budget");
        assert.equal(results.finished, true);
        assert.equal(code, 1);
        assert.equal(claudeRuns, 2);
      },
    );

    await t.test("no cost: a later run with no result event stops", async (t) => {
      const { code, lines, results, claudeRuns } = await runScenario(t, {
        options: haikuCap3,
        scenario: [{ cost: 0.3 }, { noResult: true }],
      });
      assert.deepEqual(runLines(lines), [
        "with 1: stage1 ok files 0 | invoice-reopen error: no result tokens n/a files 0 | payment-chargeback skipped | merge n/a | $0.30+unknown incomplete",
      ]);
      assert.ok(
        lines.includes("== stopped: no cost. with 1 invoice-reopen reported no usable cost."),
        lines.join("\n"),
      );
      assert.deepEqual(results.stopped, {
        rule: "no cost",
        detail: "with 1 invoice-reopen reported no usable cost.",
      });
      assert.equal(results.finished, true);
      assert.equal(code, 1);
      assert.equal(claudeRuns, 2);
    });

    await t.test("no cost: a later run with a null total_cost_usd stops", async (t) => {
      const { code, lines, results, claudeRuns } = await runScenario(t, {
        options: haikuCap3,
        scenario: [{ cost: 0.3 }, { cost: null }],
      });
      assert.deepEqual(runLines(lines), [
        "with 1: stage1 ok files 0 | invoice-reopen error: no cost tokens 4 files 0 | payment-chargeback skipped | merge n/a | $0.30+unknown incomplete",
      ]);
      assert.ok(
        lines.includes("== stopped: no cost. with 1 invoice-reopen reported no usable cost."),
        lines.join("\n"),
      );
      assert.equal(results.stopped.rule, "no cost");
      assert.equal(results.finished, true);
      assert.equal(code, 1);
      assert.equal(claudeRuns, 2);
    });

    await t.test("first run: a first run that exits 1 under its budget stops", async (t) => {
      const { code, lines, results, claudeRuns } = await runScenario(t, {
        options: haikuCap3,
        scenario: [{ exit: 1, isError: true, cost: 0.1 }],
      });
      assert.deepEqual(runLines(lines), [
        "with 1: stage1 error: exit 1 files 0 | invoice-reopen skipped | payment-chargeback skipped | merge n/a | $0.10 incomplete",
      ]);
      assert.ok(
        lines.includes(
          "== stopped: first run. with 1 stage1 failed with error: exit 1. Check the claude login and flags.",
        ),
        lines.join("\n"),
      );
      assert.equal(results.stopped.rule, "first run");
      assert.equal(results.finished, true);
      assert.equal(code, 1);
      assert.equal(claudeRuns, 1);
    });

    await t.test("no cost: a claude run past its timeout reads error: timeout", async (t) => {
      const { code, lines, results, claudeRuns } = await runScenario(t, {
        options: haikuCap3,
        scenario: [{ sleepSeconds: 5 }],
        claudeTimeoutSeconds: 1,
      });
      assert.match(runLines(lines)[0], /^with 1: stage1 error: timeout /);
      assert.ok(
        lines.includes("== stopped: no cost. with 1 stage1 reported no usable cost."),
        lines.join("\n"),
      );
      assert.equal(results.stopped.rule, "no cost");
      assert.equal(results.finished, true);
      assert.equal(code, 1);
      assert.equal(claudeRuns, 1);
    });

    await t.test("isolation: a later init that fails the guard stops (slice 3)", async (t) => {
      const { code, lines, results, claudeRuns } = await runScenario(t, {
        options: haikuCap3,
        scenario: [
          { cost: 0.1 },
          {
            write: { "kinds/leak": "" },
            initPatch: { mcp_servers: [{ name: "github", status: "connected" }] },
            cost: 0.1,
          },
        ],
      });
      assert.equal(runLines(lines).length, 1, lines.join("\n"));
      assert.match(runLines(lines)[0], /\| invoice-reopen error: isolation /);
      assert.match(runLines(lines)[0], /\| payment-chargeback skipped \|/);
      assert.ok(
        lines.some((line) =>
          line.startsWith("== stopped: isolation. with 1 invoice-reopen init: "),
        ),
        lines.join("\n"),
      );
      assert.equal(results.stopped.rule, "isolation");
      assert.equal(results.finished, true);
      assert.equal(code, 1);
      assert.equal(claudeRuns, 2);
    });

    await t.test("isolation: a first run that fails the guard and exits 1 (slice 3)", async (t) => {
      const { code, lines, results, claudeRuns } = await runScenario(t, {
        options: haikuCap3,
        scenario: [{ initPatch: { skills: ["init", "review"] }, exit: 1, isError: true }],
      });
      assert.ok(
        lines.some((line) => line.startsWith("== stopped: isolation. with 1 stage1 init: ")),
        lines.join("\n"),
      );
      assert.equal(results.stopped.rule, "isolation");
      assert.equal(code, 1);
      assert.equal(claudeRuns, 1);
    });

    await t.test("first run: a first run that exits 1 before its init event stops", async (t) => {
      const { code, lines, results, claudeRuns } = await runScenario(t, {
        options: haikuCap3,
        scenario: [{ noInit: true, noResult: true, exit: 1 }],
      });
      assert.ok(
        lines.includes(
          "== stopped: first run. with 1 stage1 failed with error: exit 1. Check the claude login and flags.",
        ),
        lines.join("\n"),
      );
      assert.equal(results.stopped.rule, "first run");
      assert.equal(code, 1);
      assert.equal(claudeRuns, 1);
    });
  });

  test("summary lines print ranges, medians, and unknown cost", async (t) => {
    const { summarizeArm, formatSummary, formatRunLine } = await handoff();
    const stage = (fields) => ({
      status: "ok",
      error: null,
      costUsd: 0.1,
      tokens: 1000,
      files: 0,
      paths: [],
      commit: null,
      trace: null,
      ...fields,
    });
    const skipped = (name) =>
      stage({ name, status: "skipped", costUsd: null, tokens: null, files: null });
    const armRun = (fields) => ({
      arm: "with",
      index: 1,
      complete: true,
      merge: { status: "clean", conflicts: [], error: null },
      ...fields,
    });
    const noMerge = { status: "n/a", conflicts: [], error: null };

    await t.test("an arm with no complete arm-run prints n/a ranges", () => {
      const runs = [
        armRun({
          complete: false,
          costUsd: 0.75,
          stage1: stage({ status: "fail", costUsd: 0.75 }),
          tasks: [skipped("invoice-reopen"), skipped("payment-chargeback")],
          merge: noMerge,
        }),
      ];
      assert.equal(
        formatSummary("with", summarizeArm(runs, 1)),
        "with: complete 0/1, both passed 0/0, merged clean 0/0 (conflict 0, broken 0), tokens n/a, files n/a, cost $0.75",
      );
    });

    await t.test("one complete arm-run prints one value twice", () => {
      const runs = [
        armRun({
          costUsd: 3.4,
          stage1: stage({ costUsd: 1.4 }),
          tasks: [
            stage({ name: "invoice-reopen", status: "pass", tokens: 200000, files: 2, costUsd: 1 }),
            stage({
              name: "payment-chargeback",
              status: "pass",
              tokens: 212300,
              files: 3,
              costUsd: 1,
            }),
          ],
        }),
      ];
      assert.equal(
        formatSummary("with", summarizeArm(runs, 1)),
        "with: complete 1/1, both passed 1/1, merged clean 1/1 (conflict 0, broken 0), tokens 412300-412300 median 412300, files 5-5 median 5, cost $3.40",
      );
    });

    await t.test("two complete arm-runs print the mean of the two middle values", () => {
      const runs = [
        armRun({
          costUsd: 1,
          stage1: stage({ costUsd: 0.4 }),
          tasks: [
            stage({
              name: "invoice-reopen",
              status: "pass",
              tokens: 200000,
              files: 2,
              costUsd: 0.3,
            }),
            stage({
              name: "payment-chargeback",
              status: "pass",
              tokens: 198101,
              files: 2,
              costUsd: 0.3,
            }),
          ],
          merge: { status: "conflict", conflicts: ["src/kinds.js"], error: null },
        }),
        armRun({
          index: 2,
          costUsd: 1,
          stage1: stage({ costUsd: 0.4 }),
          tasks: [
            stage({
              name: "invoice-reopen",
              status: "pass",
              tokens: 212300,
              files: 2,
              costUsd: 0.3,
            }),
            stage({
              name: "payment-chargeback",
              status: "pass",
              tokens: 200000,
              files: 3,
              costUsd: 0.3,
            }),
          ],
        }),
      ];
      assert.equal(
        formatSummary("with", summarizeArm(runs, 2)),
        "with: complete 2/2, both passed 2/2, merged clean 1/2 (conflict 1, broken 0), tokens 398101-412300 median 405200.5, files 4-5 median 4.5, cost $2.00",
      );
    });

    await t.test("the summary cost includes incomplete arm-runs", () => {
      const runs = [
        armRun({
          costUsd: 1.25,
          stage1: stage({ costUsd: 0.25 }),
          tasks: [
            stage({ name: "invoice-reopen", status: "pass", tokens: 100, files: 1, costUsd: 0.5 }),
            stage({
              name: "payment-chargeback",
              status: "pass",
              tokens: 200,
              files: 1,
              costUsd: 0.5,
            }),
          ],
        }),
        armRun({
          index: 2,
          complete: false,
          costUsd: 0.5,
          stage1: stage({ status: "fail", costUsd: 0.5 }),
          tasks: [skipped("invoice-reopen"), skipped("payment-chargeback")],
          merge: noMerge,
        }),
      ];
      assert.equal(
        formatSummary("with", summarizeArm(runs, 2)),
        "with: complete 1/2, both passed 1/1, merged clean 1/1 (conflict 0, broken 0), tokens 300-300 median 300, files 2-2 median 2, cost $1.75",
      );
    });

    await t.test("a run line with an unknown cost prints +unknown after the sum", () => {
      const run = armRun({
        complete: false,
        costUsd: 0.3,
        stage1: stage({ costUsd: 0.3 }),
        tasks: [
          stage({
            name: "invoice-reopen",
            status: "error",
            error: "no result",
            costUsd: null,
            tokens: null,
          }),
          skipped("payment-chargeback"),
        ],
        merge: noMerge,
      });
      assert.equal(
        formatRunLine(run),
        "with 1: stage1 ok files 0 | invoice-reopen error: no result tokens n/a files 0 | payment-chargeback skipped | merge n/a | $0.30+unknown incomplete",
      );
    });
  });
});

// ---------------------------------------------------------------------------------------------
describe("slice 3: isolate every run and stop when a plugin or skill leaks", () => {
  // Groups each flag with its value, so the comparison ignores flag order but not pairing.
  function flagGroups(args) {
    const groups = [];
    for (const arg of args) {
      if (arg.startsWith("-")) groups.push(arg);
      else groups.push(`${groups.pop()} ${arg}`);
    }
    return groups.sort();
  }
  const SHARED = [
    "-p",
    "--restricted",
    "--strict-mcp-config",
    "--permission-mode",
    "dontAsk",
    "--no-session-persistence",
    "--output-format",
    "stream-json",
    "--verbose",
    "--model",
    "sonnet",
    "--max-budget-usd",
    "1.25",
    "--tools",
    "Read,Grep,Glob,Edit,Write,Skill,Bash",
    "--allowed-tools",
    "Read,Grep,Glob,Edit,Write,Skill,Bash(npm test:*)",
    "--settings",
    '{"sandbox":{"enabled":true,"failIfUnavailable":true,"allowUnsandboxedCommands":false,"autoAllowBashIfSandboxed":false}}',
  ];

  test("claudeArgs builds one command per arm and stage", async (t) => {
    const { claudeArgs } = await handoff();
    const pluginDir = "/run-root/with-1/plugin";

    await t.test("the with-arm stage-1 run adds the plugin and its skill directory", () => {
      const args = claudeArgs({
        arm: "with",
        stage: "stage1",
        model: "sonnet",
        budgetUsd: 1.25,
        pluginDir,
      });
      assert.deepEqual(
        flagGroups(args),
        flagGroups([
          ...SHARED,
          "--plugin-dir",
          "/run-root/with-1/plugin",
          "--add-dir",
          "/run-root/with-1/plugin/skills/making-code-agent-friendly",
        ]),
      );
    });

    await t.test("the without-arm stage-1 run has only the shared flags", () => {
      const args = claudeArgs({
        arm: "without",
        stage: "stage1",
        model: "sonnet",
        budgetUsd: 1.25,
      });
      assert.deepEqual(flagGroups(args), flagGroups(SHARED));
    });

    await t.test("a stage-2 run has only the shared flags, even in the with arm", () => {
      const args = claudeArgs({
        arm: "with",
        stage: "invoice-reopen",
        model: "sonnet",
        budgetUsd: 1.25,
        pluginDir,
      });
      assert.deepEqual(flagGroups(args), flagGroups(SHARED));
    });
  });

  test("checkIsolation accepts only the planned plugins and skills", async (t) => {
    const { checkIsolation } = await handoff();
    const builtins = [
      { name: "cc-plugin-agents-md", path: "<builtin>", source: "cc-plugin-agents-md@builtin" },
      { name: "cc-plugin-telemetry", path: "<builtin>", source: "cc-plugin-telemetry@builtin" },
      {
        name: "cc-plugin-plugin-authoring",
        path: "<builtin>",
        source: "cc-plugin-plugin-authoring@builtin",
      },
    ];
    const inline = { name: "fixture-plugin", path: "/p", source: "fixture-plugin@inline" };
    const initEvent = ({ plugins, skills, mcpServers = [] }) => ({
      type: "system",
      subtype: "init",
      mcp_servers: mcpServers,
      plugins,
      skills,
    });
    const withStage1 = { arm: "with", stage: "stage1", pluginName: "fixture-plugin" };
    const withStage2 = { arm: "with", stage: "invoice-reopen", pluginName: "fixture-plugin" };
    const withoutStage1 = { arm: "without", stage: "stage1", pluginName: "fixture-plugin" };

    await t.test("a without-arm init with the builtins passes", () => {
      const init = initEvent({ plugins: builtins, skills: ["init", "review"] });
      assert.equal(checkIsolation(init, withoutStage1), null);
    });

    await t.test("a with-arm stage-1 init with the inline plugin and its skill passes", () => {
      const init = initEvent({
        plugins: [...builtins, inline],
        skills: ["init", "review", "fixture-plugin:making-code-agent-friendly"],
      });
      assert.equal(checkIsolation(init, withStage1), null);
    });

    await t.test("a with-arm stage-2 init with the builtins passes", () => {
      const init = initEvent({ plugins: builtins, skills: ["init", "review"] });
      assert.equal(checkIsolation(init, withStage2), null);
    });

    await t.test("an installed copy of this plugin fails", () => {
      const installed = { name: "bostonaholic", path: "/cache", source: "bostonaholic@skills" };
      const init = initEvent({ plugins: [...builtins, installed], skills: ["init", "review"] });
      assert.equal(typeof checkIsolation(init, withoutStage1), "string");
    });

    await t.test("a with-arm stage-1 init without the skill fails", () => {
      const init = initEvent({ plugins: [...builtins, inline], skills: ["init", "review"] });
      assert.equal(typeof checkIsolation(init, withStage1), "string");
    });

    await t.test("an init with an MCP server fails", () => {
      const init = initEvent({
        plugins: builtins,
        skills: ["init", "review"],
        mcpServers: [{ name: "github", status: "connected" }],
      });
      assert.equal(typeof checkIsolation(init, withoutStage1), "string");
    });

    await t.test("a without-arm skill that ends in making-code-agent-friendly fails", () => {
      const init = initEvent({
        plugins: builtins,
        skills: ["init", "review", "bostonaholic:making-code-agent-friendly"],
      });
      assert.equal(typeof checkIsolation(init, withoutStage1), "string");
    });
  });

  test("buildSkillPlugin writes a fresh one-skill plugin", async (t) => {
    const { buildSkillPlugin } = await handoff();
    const root = tempDir(t);
    const skillDir = join(root, "skill");
    writeFiles(skillDir, {
      "SKILL.md": "# Synthetic skill\n",
      "references/principles.md": "# Principles\n",
      "shared/code-standards.md": "# Standards\n",
    });
    const parentDir = join(root, "run");
    mkdirSync(parentDir);
    const manifest = { name: "fixture-plugin", version: "1.2.3" };

    const first = await buildSkillPlugin(skillDir, manifest, parentDir);
    const second = await buildSkillPlugin(skillDir, manifest, parentDir);

    const copy = join(first, "skills", SKILL);
    assert.equal(readFileSync(join(copy, "SKILL.md"), "utf8"), "# Synthetic skill\n");
    assert.equal(readFileSync(join(copy, "references/principles.md"), "utf8"), "# Principles\n");
    assert.equal(readFileSync(join(copy, "shared/code-standards.md"), "utf8"), "# Standards\n");
    const written = JSON.parse(readFileSync(join(first, ".claude-plugin", "plugin.json"), "utf8"));
    assert.equal(written.name, "fixture-plugin");
    assert.equal(written.version, "1.2.3");
    assert.deepEqual(written.skills, ["./skills/making-code-agent-friendly"]);
    assert.notEqual(second, first);
    assert.ok(existsSync(join(second, "skills", SKILL, "SKILL.md")));
  });
});

// ---------------------------------------------------------------------------------------------
describe("slice 4: pass a test run only when every hidden test ran, and kill hung test runs", () => {
  // A Node TAP report with the given top-level test lines and Node's end-of-run summary.
  function tapReport(testLines, { fail = 0, cancelled = 0 } = {}) {
    return [
      "TAP version 13",
      ...testLines,
      `1..${testLines.length}`,
      `# tests ${testLines.length}`,
      "# suites 0",
      `# pass ${testLines.length - fail - cancelled}`,
      `# fail ${fail}`,
      `# cancelled ${cancelled}`,
      "# skipped 0",
      "# todo 0",
      "# duration_ms 12.5",
      "",
    ].join("\n");
  }

  test("judgeTestRun applies the TAP pass rule", async (t) => {
    const { judgeTestRun } = await handoff();
    const hidden = ["baseline", "stage1"];

    await t.test("a full pass passes", () => {
      const tap = tapReport(["ok 1 - baseline: lists invoice", "ok 2 - stage1: keeps migrations"]);
      assert.equal(
        judgeTestRun({ status: 0, signal: null, tap, hiddenPrefixes: hidden }).passed,
        true,
      );
    });

    await t.test("exit 0 with no summary fails", () => {
      const tap =
        "TAP version 13\nok 1 - baseline: lists invoice\nok 2 - stage1: keeps migrations\n";
      assert.equal(
        judgeTestRun({ status: 0, signal: null, tap, hiddenPrefixes: hidden }).passed,
        false,
      );
    });

    await t.test("a hidden prefix with no ok line fails", () => {
      const tap = tapReport(["ok 1 - baseline: lists invoice"]);
      assert.equal(
        judgeTestRun({ status: 0, signal: null, tap, hiddenPrefixes: hidden }).passed,
        false,
      );
    });

    await t.test("# fail 1 fails", () => {
      const tap = tapReport(
        ["ok 1 - baseline: lists invoice", "ok 2 - stage1: keeps migrations", "not ok 3 - agent"],
        { fail: 1 },
      );
      assert.equal(
        judgeTestRun({ status: 0, signal: null, tap, hiddenPrefixes: hidden }).passed,
        false,
      );
    });

    await t.test("# cancelled 1 fails", () => {
      const tap = tapReport(
        ["ok 1 - baseline: lists invoice", "ok 2 - stage1: keeps migrations", "not ok 3 - agent"],
        { cancelled: 1 },
      );
      assert.equal(
        judgeTestRun({ status: 0, signal: null, tap, hiddenPrefixes: hidden }).passed,
        false,
      );
    });

    await t.test("a hidden file with one passing and one skipped test fails", () => {
      const tap = tapReport([
        "ok 1 - baseline: lists invoice",
        "ok 2 - baseline: unique versions # SKIP",
        "ok 3 - stage1: keeps migrations",
      ]);
      assert.equal(
        judgeTestRun({ status: 0, signal: null, tap, hiddenPrefixes: hidden }).passed,
        false,
      );
    });

    await t.test("a hidden file whose only test is TODO fails", () => {
      const tap = tapReport([
        "ok 1 - baseline: lists invoice",
        "ok 2 - stage1: keeps migrations # TODO",
      ]);
      assert.equal(
        judgeTestRun({ status: 0, signal: null, tap, hiddenPrefixes: hidden }).passed,
        false,
      );
    });

    await t.test("a lower-case skip directive on a hidden line fails", () => {
      const tap = tapReport([
        "ok 1 - baseline: lists invoice",
        "ok 2 - baseline: unique versions # skip",
        "ok 3 - stage1: keeps migrations",
      ]);
      assert.equal(
        judgeTestRun({ status: 0, signal: null, tap, hiddenPrefixes: hidden }).passed,
        false,
      );
    });

    await t.test("a skipped agent test beside passing hidden tests passes", () => {
      const tap = tapReport([
        "ok 1 - baseline: lists invoice",
        "ok 2 - stage1: keeps migrations",
        "ok 3 - agent test for later # SKIP",
      ]);
      assert.equal(
        judgeTestRun({ status: 0, signal: null, tap, hiddenPrefixes: hidden }).passed,
        true,
      );
    });

    await t.test("a suite report with no hidden set passes on fail 0 and cancelled 0", () => {
      const tap = tapReport(["ok 1 - lists the invoice kind"]);
      assert.equal(judgeTestRun({ status: 0, signal: null, tap, hiddenPrefixes: [] }).passed, true);
    });

    await t.test("a killed run fails", () => {
      const tap = tapReport(["ok 1 - baseline: lists invoice", "ok 2 - stage1: keeps migrations"]);
      assert.equal(
        judgeTestRun({ status: null, signal: "SIGKILL", tap, hiddenPrefixes: hidden }).passed,
        false,
      );
    });
  });

  test("runHandoff survives more than 1 MiB of stderr from claude or a test run", async (t) => {
    const noisy =
      'import test from "node:test";\n\n' +
      'test("writes 2 MiB to stderr", () => {\n' +
      '  process.stderr.write("n".repeat(2 * 1024 * 1024));\n' +
      "});\n";
    const { code, lines, results, claudeRuns } = await runScenario(t, {
      options: { model: "sonnet", runs: 1, capUsd: 12, runBudgetUsd: 2, dryRun: false },
      scenario: [
        { write: { "test/noisy.test.js": noisy }, stderrBytes: 2 * 1024 * 1024 },
        {},
        {},
        {},
        {},
        {},
      ],
    });

    assert.match(runLines(lines)[0], /^with 1: stage1 ok /);
    const stderrLog = join(dirname(results.runs[0].stage1.trace), "stderr.log");
    assert.equal(statSync(stderrLog).size, 2 * 1024 * 1024);
    assert.equal(results.finished, true);
    assert.equal(code, 0);
    assert.equal(claudeRuns, 6);
  });

  test("runHandoff kills a test run that ignores SIGTERM", async (t) => {
    // The test runner exits on SIGTERM by default, so the agent test drops its listener first.
    const hang =
      'import test from "node:test";\n\n' +
      'process.removeAllListeners("SIGTERM");\n' +
      'process.on("SIGTERM", () => {});\n\n' +
      'test("waits ten seconds", () => new Promise((done) => setTimeout(done, 10_000)));\n';
    const started = performance.now();
    const { code, lines, claudeRuns } = await runScenario(t, {
      options: { model: "sonnet", runs: 1, capUsd: 12, runBudgetUsd: 2, dryRun: false },
      scenario: [
        { write: { "test/hang.test.js": hang } },
        { write: { "test/hang.test.js": hang } },
      ],
      testTimeoutSeconds: 1,
    });
    const elapsedMs = performance.now() - started;

    assert.match(runLines(lines)[0], /^with 1: stage1 fail /);
    assert.match(runLines(lines)[1], /^without 1: stage1 fail /);
    assert.ok(elapsedMs < 10_000, `took ${Math.round(elapsedMs)} ms; SIGTERM alone takes 20 s`);
    assert.equal(code, 1);
    assert.equal(claudeRuns, 2);
  });
});

// ---------------------------------------------------------------------------------------------
describe("slice 5: explain the command and fail before spending", () => {
  const CLI = SCRIPT;

  // A claude stub first on PATH, so a CLI row can never start a paid run.
  function cliEnv(t) {
    const bin = tempDir(t);
    const calls = join(bin, "claude-calls.log");
    writeFileSync(join(bin, "claude"), `#!/bin/sh\necho "$@" >>'${calls}'\nexit 1\n`);
    chmodSync(join(bin, "claude"), 0o755);
    return { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }, calls };
  }

  function listing(dir) {
    return existsSync(dir) ? readdirSync(dir).sort() : [];
  }

  test("eval-handoff CLI prints help, previews, and rejects bad input", async (t) => {
    const { env, calls } = cliEnv(t);
    const cli = (args, cwd = REPO) =>
      spawnSync(process.execPath, [CLI, ...args], { cwd, env, encoding: "utf8" });

    await t.test("--help exits 0 with the usage", () => {
      const run = cli(["--help"]);
      assert.equal(run.status, 0, run.stderr);
      assert.match(run.stdout, /^usage: npm run eval:handoff -- /);
    });

    await t.test("--help returns before the argument rules", () => {
      const run = cli(["--runs", "9", "--help"]);
      assert.equal(run.status, 0, run.stderr);
    });

    await t.test("a bad --runs exits 2 with one stderr line", () => {
      const run = cli(["--runs", "9"]);
      assert.equal(run.status, 2);
      assert.equal(run.stdout, "");
      assert.match(run.stderr, /^eval-handoff\.mjs: [^\n]+\n$/);
    });

    await t.test("an unknown model exits 2 and asks for a cap", () => {
      const run = cli(["--model", "claude-x"]);
      assert.equal(run.status, 2);
      assert.equal(
        run.stderr,
        "eval-handoff.mjs: no default cap for model claude-x; pass --max-cost-usd\n",
      );
    });

    await t.test("--dry-run prints every claude command and creates nothing", () => {
      const before = listing(RESULTS);
      const run = cli(["--dry-run"]);
      assert.equal(run.status, 0, run.stderr);
      const commands = run.stdout.split("\n").filter((line) => line.startsWith("claude "));
      assert.equal(commands.length, 6, run.stdout);
      assert.equal(commands.filter((line) => line.includes("--plugin-dir")).length, 1, run.stdout);
      assert.match(run.stdout, /refactor\.md/);
      assert.match(run.stdout, /tasks\/invoice-reopen\.md/);
      assert.match(run.stdout, /tasks\/payment-chargeback\.md/);
      assert.deepEqual(listing(RESULTS), before);
      assert.equal(existsSync(calls), false, "dry run spawned claude");
    });

    await t.test("a run outside the repository root exits 2", (t) => {
      const run = cli([], tempDir(t));
      assert.equal(run.status, 2);
      assert.match(run.stderr, /run from the repository root/);
    });
  });

  test("readFixture names the missing fixture file", async (t) => {
    const { readFixture } = await handoff();

    await t.test("a missing scaffold.sh", async (t) => {
      const { fixtureDir } = syntheticFixture(t);
      rmSync(join(fixtureDir, "scaffold.sh"));
      await assert.rejects(async () => readFixture(fixtureDir), usageErrorNaming("scaffold.sh"));
    });

    await t.test("a missing refactor.md", async (t) => {
      const { fixtureDir } = syntheticFixture(t);
      rmSync(join(fixtureDir, "refactor.md"));
      await assert.rejects(async () => readFixture(fixtureDir), usageErrorNaming("refactor.md"));
    });

    await t.test("a missing accept/baseline.test.mjs", async (t) => {
      const { fixtureDir } = syntheticFixture(t);
      rmSync(join(fixtureDir, "accept", "baseline.test.mjs"));
      await assert.rejects(
        async () => readFixture(fixtureDir),
        usageErrorNaming("accept/baseline.test.mjs"),
      );
    });

    await t.test("a missing accept/stage1.test.mjs", async (t) => {
      const { fixtureDir } = syntheticFixture(t);
      rmSync(join(fixtureDir, "accept", "stage1.test.mjs"));
      await assert.rejects(
        async () => readFixture(fixtureDir),
        usageErrorNaming("accept/stage1.test.mjs"),
      );
    });

    await t.test("one task file", async (t) => {
      const { fixtureDir } = syntheticFixture(t);
      rmSync(join(fixtureDir, "tasks", "payment-chargeback.md"));
      await assert.rejects(async () => readFixture(fixtureDir), usageErrorNaming("tasks"));
    });

    await t.test("three task files", async (t) => {
      const { fixtureDir } = syntheticFixture(t);
      writeFiles(fixtureDir, {
        "tasks/invoice-split.md": "Add the invoice-split kind.\n",
        "accept/invoice-split.test.mjs": 'import test from "node:test";\n',
      });
      await assert.rejects(async () => readFixture(fixtureDir), usageErrorNaming("tasks"));
    });

    await t.test("a task with no matching accept test", async (t) => {
      const { fixtureDir } = syntheticFixture(t);
      rmSync(join(fixtureDir, "accept", "payment-chargeback.test.mjs"));
      await assert.rejects(
        async () => readFixture(fixtureDir),
        usageErrorNaming("accept/payment-chargeback.test.mjs"),
      );
    });
  });

  test("runHandoff stops before any claude run when preflight or the scaffold fails", async (t) => {
    const { runHandoff } = await handoff();
    const options = { model: "haiku", runs: 1, capUsd: 6, runBudgetUsd: 1, dryRun: false };

    await t.test("a claude path that does not exist", async (t) => {
      const fixture = syntheticFixture(t);
      t.mock.method(console, "log", () => {});
      t.mock.method(console, "error", () => {});
      const code = await runHandoff({
        options,
        fixtureDir: fixture.fixtureDir,
        skillDir: fixture.skillDir,
        repoRoot: fixture.repoRoot,
        resultsRoot: fixture.resultsRoot,
        claude: join(fixture.repoRoot, "no-such-claude"),
      });
      assert.equal(code, 1);
      assert.deepEqual(readdirSync(fixture.resultsRoot), []);
      assert.equal(existsSync(fixture.scaffoldLog), false, "the scaffold ran");
    });

    await t.test("git 2.9.0 first on PATH, which a string comparison would pass", async (t) => {
      const fixture = syntheticFixture(t);
      const claude = fakeClaude(t, [{}]);
      const bin = tempDir(t);
      writeFileSync(join(bin, "git"), '#!/bin/sh\necho "git version 2.9.0"\n');
      chmodSync(join(bin, "git"), 0o755);
      const savedPath = process.env.PATH;
      t.after(() => {
        process.env.PATH = savedPath;
      });
      process.env.PATH = `${bin}:${savedPath}`;
      t.mock.method(console, "log", () => {});
      t.mock.method(console, "error", () => {});
      const code = await runHandoff({
        options,
        fixtureDir: fixture.fixtureDir,
        skillDir: fixture.skillDir,
        repoRoot: fixture.repoRoot,
        resultsRoot: fixture.resultsRoot,
        claude: claude.path,
      });
      process.env.PATH = savedPath;
      assert.equal(code, 1);
      assert.equal(claude.runs(), 0);
      assert.deepEqual(readdirSync(fixture.resultsRoot), []);
      assert.equal(existsSync(fixture.scaffoldLog), false, "the scaffold ran");
    });

    await t.test("a scaffold.sh that exits 1", async (t) => {
      const fixture = syntheticFixture(t);
      writeFileSync(join(fixture.fixtureDir, "scaffold.sh"), "#!/usr/bin/env bash\nexit 1\n");
      const claude = fakeClaude(t, [{}]);
      t.mock.method(console, "log", () => {});
      t.mock.method(console, "error", () => {});
      const code = await runHandoff({
        options,
        fixtureDir: fixture.fixtureDir,
        skillDir: fixture.skillDir,
        repoRoot: fixture.repoRoot,
        resultsRoot: fixture.resultsRoot,
        claude: claude.path,
      });
      assert.equal(code, 1);
      assert.equal(claude.runs(), 0);
    });
  });
});

// ---------------------------------------------------------------------------------------------
describe("slice 6: count, fill, and merge from the committed tree only", () => {
  function bareRepo(t) {
    const root = tempDir(t);
    const gitDir = join(root, "scratch.git");
    const init = spawnSync("git", ["init", "-q", "--bare", gitDir], { env: GIT_ENV });
    assert.equal(init.status, 0);
    return { root, gitDir };
  }

  test("scratch git helpers count and fill only the committed tree", async (t) => {
    const { commitWorkspace, changedPaths, fillFromTree } = await handoff();

    await t.test("a file the agent deleted is a changed path of a child commit", (t) => {
      const { root, gitDir } = bareRepo(t);
      const workspace = join(root, "workspace");
      writeFiles(workspace, { "a.txt": "a\n", "b.txt": "b\n" });
      const parent = commitWorkspace(gitDir, null, workspace);
      rmSync(join(workspace, "b.txt"));
      const child = commitWorkspace(gitDir, parent, workspace);
      assert.deepEqual(changedPaths(gitDir, parent, child), ["b.txt"]);
      assert.equal(gitIn(gitDir, ["rev-parse", `${child}^`]), parent);
    });

    await t.test("a repo-local core.fsmonitor hook never runs", (t) => {
      const { root, gitDir } = bareRepo(t);
      const marker = join(root, "fsmonitor-ran");
      const hook = join(root, "fsmonitor.sh");
      writeFileSync(hook, `#!/bin/sh\necho ran >>'${marker}'\n`);
      chmodSync(hook, 0o755);
      gitIn(gitDir, ["config", "core.fsmonitor", hook]);
      const workspace = join(root, "workspace");
      writeFiles(workspace, { "a.txt": "a\n" });
      const parent = commitWorkspace(gitDir, null, workspace);
      writeFiles(workspace, { "b.txt": "b\n" });
      commitWorkspace(gitDir, parent, workspace);
      assert.equal(existsSync(marker), false);
    });

    await t.test("a fill keeps an export-ignore file and the 755 mode", (t) => {
      const { root, gitDir } = bareRepo(t);
      const workspace = join(root, "workspace");
      writeFiles(workspace, { ".gitattributes": "* export-ignore\n", "run.sh": "#!/bin/sh\n" });
      chmodSync(join(workspace, "run.sh"), 0o755);
      const commit = commitWorkspace(gitDir, null, workspace);
      const dest = join(root, "fill");
      mkdirSync(dest);
      fillFromTree(gitDir, commit, dest);
      assert.equal(readFileSync(join(dest, ".gitattributes"), "utf8"), "* export-ignore\n");
      assert.equal(readFileSync(join(dest, "run.sh"), "utf8"), "#!/bin/sh\n");
      assert.equal(statSync(join(dest, "run.sh")).mode & 0o777, 0o755);
    });

    await t.test("a path with a tab fills under its full name", (t) => {
      const { root, gitDir } = bareRepo(t);
      const workspace = join(root, "workspace");
      writeFiles(workspace, { "dir\twith tab/a\tb.txt": "tab\n" });
      const commit = commitWorkspace(gitDir, null, workspace);
      const dest = join(root, "fill");
      mkdirSync(dest);
      fillFromTree(gitDir, commit, dest);
      assert.equal(readFileSync(join(dest, "dir\twith tab", "a\tb.txt"), "utf8"), "tab\n");
    });

    await t.test("a file an agent .gitignore excludes is neither counted nor filled", (t) => {
      const { root, gitDir } = bareRepo(t);
      const workspace = join(root, "workspace");
      writeFiles(workspace, { "a.txt": "a\n" });
      const parent = commitWorkspace(gitDir, null, workspace);
      writeFiles(workspace, { ".gitignore": "x.log\n", "x.log": "noise\n" });
      const child = commitWorkspace(gitDir, parent, workspace);
      const dest = join(root, "fill");
      mkdirSync(dest);
      fillFromTree(gitDir, child, dest);
      assert.deepEqual(changedPaths(gitDir, parent, child), [".gitignore"]);
      assert.deepEqual(readdirSync(dest).sort(), [".gitignore", "a.txt"]);
    });

    await t.test("a committed symlink fails the fill with symlink", (t) => {
      const { root, gitDir } = bareRepo(t);
      const workspace = join(root, "workspace");
      writeFiles(workspace, { "a.txt": "a\n" });
      symlinkSync("/etc/hosts", join(workspace, "link"));
      const commit = commitWorkspace(gitDir, null, workspace);
      const dest = join(root, "fill");
      mkdirSync(dest);
      assert.throws(() => fillFromTree(gitDir, commit, dest), /symlink/);
    });

    await t.test("a gitlink entry fails the fill with mode 160000", (t) => {
      const { root, gitDir } = bareRepo(t);
      const workspace = join(root, "workspace");
      writeFiles(workspace, { "a.txt": "a\n" });
      const base = commitWorkspace(gitDir, null, workspace);
      const index = { GIT_INDEX_FILE: join(root, "gitlink.index") };
      gitIn(gitDir, ["read-tree", base], index);
      gitIn(gitDir, ["update-index", "--add", "--cacheinfo", `160000,${base},sub`], index);
      const tree = gitIn(gitDir, ["write-tree"], index);
      const commit = gitIn(gitDir, ["commit-tree", tree, "-p", base, "-m", "gitlink"]);
      const dest = join(root, "fill");
      mkdirSync(dest);
      assert.throws(() => fillFromTree(gitDir, commit, dest), /mode 160000/);
    });
  });

  test("mergeCheck records conflict paths and git errors", async (t) => {
    const { mergeCheck } = await handoff();
    const root = tempDir(t);
    const repo = join(root, "repo");
    const git = (...args) => gitIn(join(repo, ".git"), [`--work-tree=${repo}`, ...args]);
    mkdirSync(repo);
    spawnSync("git", ["init", "-q", repo], { env: GIT_ENV });
    writeFiles(repo, { "src/kinds.js": "base\n" });
    git("add", "-A");
    git("commit", "-q", "-m", "base");
    const base = git("rev-parse", "HEAD");
    writeFiles(repo, { "src/kinds.js": "reopen\n" });
    git("commit", "-q", "-am", "reopen");
    const reopen = git("rev-parse", "HEAD");
    git("reset", "-q", "--hard", base);
    writeFiles(repo, { "src/kinds.js": "chargeback\n" });
    git("commit", "-q", "-am", "chargeback");
    const chargeback = git("rev-parse", "HEAD");
    const gitDir = join(repo, ".git");

    await t.test("same-line edits give conflict with the conflicting path", async () => {
      const merge = await mergeCheck(gitDir, reopen, chargeback);
      assert.equal(merge.status, "conflict");
      assert.deepEqual(merge.conflicts, ["src/kinds.js"]);
    });

    await t.test("a missing commit id gives error with git's stderr unchanged", async () => {
      const missing = "0123456789abcdef0123456789abcdef01234567";
      const expected = spawnSync(
        "git",
        [`--git-dir=${gitDir}`, "merge-tree", "--write-tree", "--name-only", reopen, missing],
        { env: GIT_ENV, encoding: "utf8" },
      ).stderr;
      const merge = await mergeCheck(gitDir, reopen, missing);
      assert.equal(merge.status, "error");
      assert.equal(merge.error, expected);
    });
  });

  test("runHandoff marks a stage with a committed symlink as error: symlink", async (t) => {
    const { code, lines, claudeRuns } = await runScenario(t, {
      options: { model: "sonnet", runs: 1, capUsd: 12, runBudgetUsd: 2, dryRun: false },
      scenario: [{ symlink: { link: "/etc/hosts" } }, {}, {}, {}],
    });
    assert.match(runLines(lines)[0], /^with 1: stage1 error: symlink .* incomplete$/);
    assert.match(runLines(lines)[1], /^without 1: stage1 ok /);
    assert.equal(code, 1);
    assert.equal(claudeRuns, 4);
  });
});
