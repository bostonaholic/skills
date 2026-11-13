// Fails when scripts/eval-baseline.mjs writes a baseline that eval-compare.mjs or eval-verdict.mjs
// cannot read, overwrites a recorded case with an incomplete run, or mixes models. Each case writes
// synthetic aggregate-result.json files in the shape claude plugin eval 2.1.289 writes and runs the
// real scripts. No case calls a model.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const ONE_STDERR_LINE = /^eval-baseline\.mjs: [^\n]+\n?$/;

function node(script, ...args) {
  const run = spawnSync(process.execPath, [resolve(script), ...args], { encoding: "utf8" });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

function tempDir(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "eval-baseline-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function run(passed, { error = null, cost = 0.1 } = {}) {
  return {
    score: passed ? 1 : 0,
    passed,
    turns: 3,
    costUsd: cost,
    judgeCostUsd: 0.0005,
    durationSeconds: 20,
    startedAt: "2026-11-01T12:00:00.000Z",
    error,
    tracePath: "/private/tmp/e-synthetic/out/trace.jsonl",
    skippedPaidGraders: false,
    graders: [
      {
        name: "rule",
        passed,
        weight: 1,
        explanation: "long text",
        withOnly: false,
        scored: true,
      },
    ],
  };
}

const PASS = run(true);
const FAIL = run(false);

function evalCase(name, withRuns, withoutRuns = [FAIL, FAIL, FAIL], runsPerCase = 3) {
  return {
    name,
    dir: `evals/engineering/${name}`,
    promptMarkdown: "Synthetic prompt.",
    runsPerCase,
    graders: [],
    arms: { with: withRuns, without: withoutRuns },
    aggregates: { score: 0, scoreWithout: 0, passRate: 0, passRateWithout: 0, delta: 0 },
  };
}

function aggregate(cases, { model = "sonnet", ablation = "with-without", startedAt = "T1" } = {}) {
  return {
    schemaVersion: 1,
    claudeVersion: "2.1.289",
    startedAt,
    suite: { ablation, modelOverride: model, judgeModel: "haiku" },
    cases,
  };
}

function write(dir, name, document) {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(document));
  return path;
}

test("records a trimmed baseline that eval-compare and eval-verdict read", (t) => {
  const dir = tempDir(t);
  const baseline = join(dir, "baselines", "sonnet.json");
  const before = write(dir, "before.json", aggregate([evalCase("a", [PASS, PASS, FAIL])]));
  const recorded = node("scripts/eval-baseline.mjs", baseline, before);
  assert.equal(recorded.status, 0, recorded.stderr);
  assert.equal(recorded.stdout, `wrote ${baseline}\n`);

  const written = JSON.parse(readFileSync(baseline, "utf8"));
  assert.deepEqual(written.suite, { modelOverride: "sonnet", ablation: "with-without" });
  assert.equal(written.cases[0].recordedAt, "T1");
  assert.deepEqual(Object.keys(written.cases[0].arms.with[0]).sort(), [
    "costUsd",
    "error",
    "graders",
    "passed",
    "score",
    "skippedPaidGraders",
  ]);
  assert.deepEqual(written.cases[0].arms.with[0].graders, [
    { name: "rule", passed: true, scored: true, withOnly: false },
  ]);

  const verdict = node("scripts/eval-verdict.mjs", "--runs", "3", baseline);
  assert.equal(verdict.stdout, "a 2/3 excluded 0 pass\n");
  const noSkill = node("scripts/eval-compare.mjs", baseline);
  assert.match(noSkill.stdout, /^a without 0\/3 \$0\.1000 with 2\/3 \$0\.1000 /m);
  const after = write(dir, "after.json", aggregate([evalCase("a", [PASS, PASS, PASS])]));
  const compared = node("scripts/eval-compare.mjs", baseline, after);
  assert.equal(compared.status, 0, compared.stderr);
  assert.match(
    compared.stdout,
    /^a control 2\/3 \$0\.1000 treatment 3\/3 \$0\.1000 cost 0% pass \+33\.3pts$/m,
  );
});

test("merges new cases, keeps others, and keeps an incomplete case's entry", (t) => {
  const dir = tempDir(t);
  const baseline = join(dir, "sonnet.json");
  const first = write(
    dir,
    "first.json",
    aggregate([evalCase("a", [PASS, PASS, PASS]), evalCase("b", [PASS, PASS, PASS])]),
  );
  assert.equal(node("scripts/eval-baseline.mjs", baseline, first).status, 0);

  const limited = run(false, { error: "Usage limit reached" });
  const second = write(
    dir,
    "second.json",
    aggregate([evalCase("b", [PASS, limited, limited]), evalCase("c", [FAIL, FAIL, FAIL])], {
      startedAt: "T2",
    }),
  );
  const result = node("scripts/eval-baseline.mjs", baseline, second);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^kept b: incomplete$/m);
  const written = JSON.parse(readFileSync(baseline, "utf8"));
  assert.deepEqual(
    written.cases.map(({ name, recordedAt }) => [name, recordedAt]),
    [
      ["a", "T1"],
      ["b", "T1"],
      ["c", "T2"],
    ],
  );
});

test("bad input exits 2 with one stderr line and writes nothing", async (t) => {
  const dir = tempDir(t);
  const cases = [evalCase("a", [PASS, PASS, PASS])];
  const sonnet = write(dir, "sonnet.json", aggregate(cases));
  const opus = write(dir, "opus.json", aggregate(cases, { model: "opus" }));
  const noAblation = write(dir, "none.json", aggregate(cases, { ablation: "none" }));
  const oneRun = write(dir, "one.json", aggregate([evalCase("a", [PASS], [FAIL], 1)]));
  const baseline = join(dir, "baselines", "sonnet.json");

  const failures = {
    "no results file": [baseline],
    "a flag": ["--runs", "3", baseline, sonnet],
    "results from two models": [baseline, sonnet, opus],
    "a result without the without-arm": [baseline, noAblation],
    "a result at --runs 1": [baseline, oneRun],
  };
  for (const [label, args] of Object.entries(failures)) {
    await t.test(label, () => {
      const result = node("scripts/eval-baseline.mjs", ...args);
      assert.equal(result.status, 2, result.stdout);
      assert.match(result.stderr, ONE_STDERR_LINE);
      assert.ok(!existsSync(baseline), "baseline written");
    });
  }

  await t.test("a baseline for another model", () => {
    const opusBaseline = write(dir, "opus-baseline.json", {
      schemaVersion: 1,
      suite: { modelOverride: "opus", ablation: "with-without" },
      cases: [],
    });
    const result = node("scripts/eval-baseline.mjs", opusBaseline, sonnet);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /is for model opus, results are sonnet/);
  });
});
