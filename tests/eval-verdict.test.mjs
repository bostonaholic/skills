// Fails when scripts/eval-verdict.mjs drifts from the per-case verdict rule: a must-pass failure hidden
// behind a mean, an excluded run that counts, or a wrong grader-list key that prints 0 passing runs.
// Each case writes a synthetic aggregate-result.json in the shape claude plugin eval 2.1.289 writes,
// and runs the real script. No case calls a model.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const VERDICT = resolve("scripts/eval-verdict.mjs");
const ONE_STDERR_LINE = /^eval-verdict\.mjs: [^\n]+\n?$/;

function verdict(...args) {
  assert.ok(existsSync(VERDICT), `missing ${VERDICT}`);
  const run = spawnSync(process.execPath, [VERDICT, ...args], { encoding: "utf8" });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

function tempDir(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "eval-verdict-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeResult(t, document) {
  const path = join(tempDir(t), "aggregate-result.json");
  writeFileSync(path, JSON.stringify(document, null, 2));
  return path;
}

function scoredPass() {
  return { name: "core-rule", passed: true, weight: 1, explanation: "The reply states the rule.", withOnly: false, scored: true };
}

function scoredFail() {
  return { name: "core-rule", passed: false, weight: 1, explanation: "The reply skips the rule.", withOnly: false, scored: true };
}

function unscoredFail() {
  return { name: "fired", passed: false, weight: 1, explanation: "No Skill call.", withOnly: true, scored: false };
}

function run({ error = null, skippedPaidGraders = false, passed, score, graders }) {
  return {
    score,
    passed,
    turns: 3,
    costUsd: 0.02,
    judgeCostUsd: 0.0005,
    durationSeconds: 20,
    startedAt: "2026-10-07T12:00:00.000Z",
    error,
    tracePath: "/private/tmp/e-synthetic/out/trace.jsonl",
    skippedPaidGraders,
    ...(graders === undefined ? {} : { graders }),
  };
}

function passingRun() {
  return run({ passed: true, score: 1, graders: [scoredPass()] });
}

function failingRun() {
  return run({ passed: false, score: 0, graders: [scoredFail()] });
}

function evalCase(name, runsPerCase, arms) {
  return {
    name,
    dir: `evals/engineering/${name}`,
    source: "local",
    promptMarkdown: "Synthetic prompt.",
    runsPerCase,
    timeoutSeconds: 300,
    maxTurns: 10,
    graders: [{ name: "core-rule", type: "llm", weight: 1, config: {}, graderMarkdown: "PASS: the reply states the rule." }],
    ...(arms === undefined ? {} : { arms }),
    aggregates: { score: 0.5, scoreWithout: 0, passRate: 0.5, passRateWithout: 0, delta: 0.5 },
  };
}

function aggregate(cases, overrides = {}) {
  return {
    schemaVersion: 1,
    claudeVersion: "2.1.289",
    startedAt: "2026-10-07T12:00:00.000Z",
    durationSeconds: 42,
    costUsd: 0.12,
    partial: false,
    suite: { root: "/w", ablation: "with-without", modelOverride: "haiku", judgeModel: "haiku", threshold: 0, concurrency: 1, plugins: [] },
    cases,
    aggregates: { casesPassed: 0, casesTotal: 1, meanDelta: 0, overallPassRate: 0, overallScore: 0 },
    ...overrides,
  };
}

test("eval-verdict applies the run and case rules", async (t) => {
  await t.test("--runs 3 with three passing runs passes 3/3", (st) => {
    const file = writeResult(st, aggregate([evalCase("a", 3, { with: [passingRun(), passingRun(), passingRun()], without: [failingRun(), failingRun(), failingRun()] })]));
    const result = verdict("--runs", "3", file);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "a 3/3 excluded 0 pass\n");
  });

  await t.test("--runs 3 with two of three passing runs passes", (st) => {
    const file = writeResult(st, aggregate([evalCase("a", 3, { with: [passingRun(), passingRun(), failingRun()], without: [failingRun(), failingRun(), failingRun()] })]));
    const result = verdict("--runs", "3", file);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "a 2/3 excluded 0 pass\n");
  });

  await t.test("--runs 3 with one of three passing runs fails", (st) => {
    const file = writeResult(st, aggregate([evalCase("a", 3, { with: [passingRun(), failingRun(), failingRun()], without: [failingRun(), failingRun(), failingRun()] })]));
    const result = verdict("--runs", "3", file);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "a 1/3 excluded 0 fail\n");
  });

  await t.test("--runs 3 with no passing run fails", (st) => {
    const file = writeResult(st, aggregate([evalCase("a", 3, { with: [failingRun(), failingRun(), failingRun()], without: [failingRun(), failingRun(), failingRun()] })]));
    const result = verdict("--runs", "3", file);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "a 0/3 excluded 0 fail\n");
  });

  await t.test("--runs 3 excludes a usage-limit run and leaves two counted runs incomplete", (st) => {
    const usageLimit = run({ error: "Usage limit reached", passed: false, score: 0, graders: [scoredFail()] });
    const file = writeResult(st, aggregate([evalCase("a", 3, { with: [passingRun(), passingRun(), usageLimit], without: [failingRun(), failingRun(), failingRun()] })]));
    const result = verdict("--runs", "3", file);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "a 2/2 excluded 1 incomplete\n");
  });

  await t.test("--runs 1 with a passing run passes", (st) => {
    const file = writeResult(st, aggregate([evalCase("a", 1, { with: [passingRun()], without: [failingRun()] })]));
    const result = verdict("--runs", "1", file);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "a 1/1 excluded 0 pass\n");
  });

  await t.test("--runs 1 with a failing run fails", (st) => {
    const file = writeResult(st, aggregate([evalCase("a", 1, { with: [failingRun()], without: [passingRun()] })]));
    const result = verdict("--runs", "1", file);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "a 0/1 excluded 0 fail\n");
  });

  await t.test("--runs 1 with an empty with-arm list is incomplete", (st) => {
    const file = writeResult(st, aggregate([evalCase("a", 1, { with: [], without: [] })]));
    const result = verdict("--runs", "1", file);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "a 0/0 excluded 0 incomplete\n");
  });

  await t.test("--runs 1 with no with-arm key is incomplete", (st) => {
    const file = writeResult(st, aggregate([evalCase("a", 1, { without: [] })]));
    const result = verdict("--runs", "1", file);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "a 0/0 excluded 0 incomplete\n");
  });

  await t.test("--runs 1 with a null with-arm is incomplete", (st) => {
    const file = writeResult(st, aggregate([evalCase("a", 1, { with: null, without: null })]));
    const result = verdict("--runs", "1", file);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "a 0/0 excluded 0 incomplete\n");
  });

  await t.test("--runs 1 with no arms key is incomplete", (st) => {
    const file = writeResult(st, aggregate([evalCase("a", 1, undefined)]));
    const result = verdict("--runs", "1", file);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "a 0/0 excluded 0 incomplete\n");
  });

  await t.test("--runs 1 excludes a rate-limit run", (st) => {
    const rateLimit = run({ error: "Rate limit exceeded", passed: false, score: 0, graders: [scoredFail()] });
    const file = writeResult(st, aggregate([evalCase("a", 1, { with: [rateLimit], without: [failingRun()] })]));
    const result = verdict("--runs", "1", file);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "a 0/0 excluded 1 incomplete\n");
  });

  await t.test("--runs 1 excludes a run with skipped paid graders and no grader list", (st) => {
    const skipped = run({ skippedPaidGraders: true, passed: false, score: 0, graders: undefined });
    const file = writeResult(st, aggregate([evalCase("a", 1, { with: [skipped], without: [failingRun()] })]));
    const result = verdict("--runs", "1", file);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "a 0/0 excluded 1 incomplete\n");
  });

  await t.test("a timed-out run with passing graders fails", (st) => {
    const timedOut = run({ error: "timed out after 300s", passed: true, score: 1, graders: [scoredPass()] });
    const file = writeResult(st, aggregate([evalCase("a", 1, { with: [timedOut], without: [failingRun()] })]));
    const result = verdict("--runs", "1", file);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "a 0/1 excluded 0 fail\n");
  });

  await t.test("a scaffold failure fails its run", (st) => {
    const scaffoldFailed = run({ error: "scaffold failed", passed: false, score: 0, graders: [scoredFail()] });
    const file = writeResult(st, aggregate([evalCase("a", 1, { with: [scaffoldFailed], without: [failingRun()] })]));
    const result = verdict("--runs", "1", file);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "a 0/1 excluded 0 fail\n");
  });

  await t.test("a failing unscored grader does not fail its run", (st) => {
    const markerMissing = run({ passed: true, score: 1, graders: [scoredPass(), unscoredFail()] });
    const file = writeResult(st, aggregate([evalCase("a", 1, { with: [markerMissing], without: [failingRun()] })]));
    const result = verdict("--runs", "1", file);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "a 1/1 excluded 0 pass\n");
  });

  await t.test("cases print sorted by name", (st) => {
    const file = writeResult(st, aggregate([
      evalCase("b", 1, { with: [failingRun()], without: [failingRun()] }),
      evalCase("a", 1, { with: [passingRun()], without: [failingRun()] }),
    ]));
    const result = verdict("--runs", "1", file);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "a 1/1 excluded 0 pass\nb 0/1 excluded 0 fail\n");
  });
});

test("eval-verdict rejects input it cannot judge", async (t) => {
  await t.test("no arguments", () => {
    const result = verdict();
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, ONE_STDERR_LINE);
  });

  await t.test("--runs 2", (st) => {
    const file = writeResult(st, aggregate([evalCase("a", 1, { with: [passingRun()], without: [failingRun()] })]));
    const result = verdict("--runs", "2", file);
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, ONE_STDERR_LINE);
  });

  await t.test("--runs 3 with no file", () => {
    const result = verdict("--runs", "3");
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, ONE_STDERR_LINE);
  });

  await t.test("an extra argument after the file", (st) => {
    const file = writeResult(st, aggregate([evalCase("a", 1, { with: [passingRun()], without: [failingRun()] })]));
    const second = writeResult(st, aggregate([evalCase("a", 1, { with: [passingRun()], without: [failingRun()] })]));
    const result = verdict("--runs", "1", file, second);
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, ONE_STDERR_LINE);
  });

  await t.test("a missing file", (st) => {
    const result = verdict("--runs", "1", join(tempDir(st), "absent.json"));
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, ONE_STDERR_LINE);
  });

  await t.test("a file that is not JSON", (st) => {
    const file = join(tempDir(st), "aggregate-result.json");
    writeFileSync(file, "a 1/1 excluded 0 pass\n");
    const result = verdict("--runs", "1", file);
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, ONE_STDERR_LINE);
  });

  await t.test("schemaVersion 2", (st) => {
    const file = writeResult(st, aggregate([evalCase("a", 1, { with: [passingRun()], without: [failingRun()] })], { schemaVersion: 2 }));
    const result = verdict("--runs", "1", file);
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, ONE_STDERR_LINE);
  });

  await t.test("no cases key", (st) => {
    const { cases, ...noCases } = aggregate([evalCase("a", 1, { with: [passingRun()], without: [failingRun()] })]);
    const file = writeResult(st, noCases);
    const result = verdict("--runs", "1", file);
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, ONE_STDERR_LINE);
  });

  await t.test("cases as an object", (st) => {
    const file = writeResult(st, aggregate([], { cases: {} }));
    const result = verdict("--runs", "1", file);
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, ONE_STDERR_LINE);
  });

  await t.test("two with-arm runs at --runs 1", (st) => {
    const file = writeResult(st, aggregate([evalCase("a", 1, { with: [passingRun(), passingRun()], without: [failingRun(), failingRun()] })]));
    const result = verdict("--runs", "1", file);
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, ONE_STDERR_LINE);
  });

  await t.test("a run with a null error and no grader list", (st) => {
    const noGraders = run({ passed: true, score: 1, graders: undefined });
    const file = writeResult(st, aggregate([evalCase("a", 1, { with: [noGraders], without: [failingRun()] })]));
    const result = verdict("--runs", "1", file);
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, ONE_STDERR_LINE);
  });

  await t.test("a run with a null error and an empty grader list", (st) => {
    const emptyGraders = run({ passed: true, score: 1, graders: [] });
    const file = writeResult(st, aggregate([evalCase("a", 1, { with: [emptyGraders], without: [failingRun()] })]));
    const result = verdict("--runs", "1", file);
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, ONE_STDERR_LINE);
  });

  await t.test("a bad case after a valid case prints nothing", (st) => {
    const noGraders = run({ passed: true, score: 1, graders: undefined });
    const file = writeResult(st, aggregate([
      evalCase("a", 1, { with: [passingRun()], without: [failingRun()] }),
      evalCase("b", 1, { with: [noGraders], without: [failingRun()] }),
    ]));
    const result = verdict("--runs", "1", file);
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, ONE_STDERR_LINE);
  });
});
