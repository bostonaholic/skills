// Fails when scripts/eval-baseline.mjs drifts from its contract: a pass-to-fail case that does not
// exit 1, a without-arm run judged on withOnly graders, an incomplete case that overwrites its
// entry, or a baseline written for the wrong model. Each case writes synthetic aggregate-result.json
// files in the shape claude plugin eval 2.1.289 writes, and runs the real script. No case calls a model.
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

const BASELINE = resolve("scripts/eval-baseline.mjs");
const ONE_STDERR_LINE = /^eval-baseline\.mjs: [^\n]+\n?$/;

function baseline(...args) {
  const run = spawnSync(process.execPath, [BASELINE, ...args], { encoding: "utf8" });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

function tempDir(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "eval-baseline-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function grader(name, passed, withOnly = false) {
  return { name, passed, weight: 1, explanation: "", withOnly, scored: !withOnly };
}

// A run whose graders pass or fail by the given map of grader name to passed.
function run(graders, error = null) {
  return {
    score: 1,
    passed: true,
    turns: 3,
    costUsd: 0.02,
    judgeCostUsd: 0.0005,
    durationSeconds: 20,
    startedAt: "2026-10-07T12:00:00.000Z",
    error,
    tracePath: "/private/tmp/e-synthetic/out/trace.jsonl",
    skippedPaidGraders: false,
    graders: Object.entries(graders).map(([name, passed]) => grader(name, passed)),
  };
}

const PASS = run({ rule: true });
const FAIL = run({ rule: false });

function evalCase(name, withRuns, withoutRuns) {
  return {
    name,
    dir: `evals/engineering/${name}`,
    runsPerCase: withRuns.length,
    arms: { with: withRuns, without: withoutRuns },
    aggregates: { score: 0.6666, scoreWithout: 0.3333, passRate: 0, passRateWithout: 0, delta: 0 },
  };
}

function aggregate(cases, { model = "sonnet", ablation = "with-without" } = {}) {
  return {
    schemaVersion: 1,
    claudeVersion: "2.1.289",
    startedAt: "2026-10-07T12:00:00.000Z",
    suite: { ablation, modelOverride: model, judgeModel: "haiku" },
    cases,
  };
}

function write(dir, name, document) {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(document));
  return path;
}

function record(t, cases, options) {
  const dir = tempDir(t);
  const baselinePath = join(dir, "baselines", "sonnet.json");
  const result = baseline(
    "record",
    "--runs",
    "3",
    baselinePath,
    write(dir, "before.json", aggregate(cases, options)),
  );
  assert.equal(result.status, 0, result.stderr);
  return { dir, baselinePath };
}

test("record writes per-case tallies for both arms", (t) => {
  const withOnlyMiss = { ...PASS, graders: [grader("rule", true), grader("fired", false, true)] };
  const { baselinePath } = record(t, [
    evalCase("a", [PASS, PASS, FAIL], [withOnlyMiss, FAIL, FAIL]),
  ]);
  const written = JSON.parse(readFileSync(baselinePath, "utf8"));
  assert.equal(written.model, "sonnet");
  assert.deepEqual(written.cases.a.with, {
    passing: 2,
    counted: 3,
    excluded: 0,
    result: "pass",
    score: 0.667,
    graders: { rule: 2 },
  });
  // The withOnly "fired" grader cannot pass without the skill, so it does not fail that run.
  assert.deepEqual(written.cases.a.without, {
    passing: 1,
    counted: 3,
    excluded: 0,
    result: "fail",
    score: 0.333,
  });
});

test("compare reports each status and exits 1 only on a regression", (t) => {
  const { dir, baselinePath } = record(t, [
    evalCase("same", [PASS, PASS, PASS], [FAIL, FAIL, FAIL]),
    evalCase("better", [PASS, FAIL, FAIL], [FAIL, FAIL, FAIL]),
    evalCase("dropped", [PASS, PASS, PASS], [FAIL, FAIL, FAIL]),
  ]);
  const improved = write(
    dir,
    "after.json",
    aggregate([
      evalCase("same", [PASS, PASS, PASS], [FAIL, FAIL, FAIL]),
      evalCase("better", [PASS, PASS, PASS], [FAIL, FAIL, FAIL]),
      evalCase("dropped", [PASS, PASS, FAIL], [FAIL, FAIL, FAIL]),
      evalCase("fresh", [PASS, PASS, PASS], [PASS, FAIL, FAIL]),
    ]),
  );
  const ok = baseline("compare", "--runs", "3", baselinePath, improved);
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(
    ok.stdout,
    [
      "better with 1/3 fail -> 3/3 pass | without 0/3 fail -> 0/3 fail | improved",
      "  rule 1 -> 3",
      "dropped with 3/3 pass -> 2/3 pass | without 0/3 fail -> 0/3 fail | worse",
      "  rule 3 -> 2",
      "fresh with none -> 3/3 pass | without none -> 1/3 fail | new",
      "same with 3/3 pass -> 3/3 pass | without 0/3 fail -> 0/3 fail | same",
      "",
    ].join("\n"),
  );

  const broken = write(
    dir,
    "broken.json",
    aggregate([evalCase("dropped", [PASS, FAIL, FAIL], [FAIL, FAIL, FAIL])]),
  );
  const bad = baseline("compare", "--runs", "3", baselinePath, broken);
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /^dropped with 3\/3 pass -> 1\/3 fail .* \| regressed$/m);
});

test("record merges new cases, keeps untouched ones, and keeps an incomplete case's entry", (t) => {
  const { dir, baselinePath } = record(t, [
    evalCase("a", [PASS, PASS, PASS], [FAIL, FAIL, FAIL]),
    evalCase("b", [PASS, PASS, PASS], [FAIL, FAIL, FAIL]),
  ]);
  const limited = run({ rule: false }, "Usage limit reached");
  const next = write(
    dir,
    "next.json",
    aggregate([
      evalCase("b", [PASS, limited, limited], [FAIL, FAIL, FAIL]),
      evalCase("c", [FAIL, FAIL, FAIL], [FAIL, FAIL, FAIL]),
    ]),
  );
  const result = baseline("record", "--runs", "3", baselinePath, next);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^kept b: incomplete$/m);
  const written = JSON.parse(readFileSync(baselinePath, "utf8"));
  assert.deepEqual(Object.keys(written.cases), ["a", "b", "c"]);
  assert.equal(written.cases.b.with.result, "pass");
  assert.equal(written.cases.c.with.result, "fail");
});

test("bad input exits 2 with one stderr line and writes nothing", async (t) => {
  const dir = tempDir(t);
  const cases = [evalCase("a", [PASS, PASS, PASS], [FAIL, FAIL, FAIL])];
  const sonnet = write(dir, "sonnet.json", aggregate(cases));
  const opus = write(dir, "opus.json", aggregate(cases, { model: "opus" }));
  const noAblation = write(dir, "none.json", aggregate(cases, { ablation: "none" }));
  const baselinePath = join(dir, "baselines", "sonnet.json");

  const failures = {
    "no mode": ["--runs", "3", baselinePath, sonnet],
    "no results file": ["compare", "--runs", "3", baselinePath],
    "record at --runs 1": ["record", "--runs", "1", baselinePath, sonnet],
    "results from two models": ["compare", "--runs", "3", baselinePath, sonnet, opus],
    "record without the without-arm": ["record", "--runs", "3", baselinePath, noAblation],
  };
  for (const [label, args] of Object.entries(failures)) {
    await t.test(label, () => {
      const result = baseline(...args);
      assert.equal(result.status, 2, result.stdout);
      assert.match(result.stderr, ONE_STDERR_LINE);
      assert.ok(!existsSync(baselinePath), "baseline written");
    });
  }

  await t.test("a baseline for another model", () => {
    const opusBaseline = join(dir, "opus-baseline.json");
    writeFileSync(opusBaseline, JSON.stringify({ schemaVersion: 1, model: "opus", cases: {} }));
    const result = baseline("compare", "--runs", "3", opusBaseline, sonnet);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /is for model opus, results are sonnet/);
  });
});
