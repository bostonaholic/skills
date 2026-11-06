// Fails when scripts/eval-compare.mjs miscounts what a quality gain costs: a wrong arm read, an
// excluded run that counts toward pass rate or cost, a judge's cost added to the agent's, a wrong
// delta, or a bad input that prints a comparison instead of exit 2. Each case writes a synthetic
// aggregate-result.json in the shape claude plugin eval 2.1.289 writes and runs the real script.
// No case calls a model.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const COMPARE = resolve("scripts/eval-compare.mjs");
const ONE_STDERR_LINE = /^eval-compare\.mjs: [^\n]+\n?$/;

function compare(...args) {
  const run = spawnSync(process.execPath, [COMPARE, ...args], { encoding: "utf8" });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

function writeResult(t, document) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "eval-compare-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "aggregate-result.json");
  writeFileSync(path, JSON.stringify(document, null, 2));
  return path;
}

function run({ passed = true, costUsd = 0.02, error = null, skippedPaidGraders = false } = {}) {
  return {
    score: passed ? 1 : 0,
    passed,
    turns: 3,
    costUsd,
    judgeCostUsd: 0.5,
    durationSeconds: 20,
    error,
    skippedPaidGraders,
    graders: [{ name: "core-rule", passed, weight: 1, withOnly: false, scored: true }],
  };
}

function evalCase(name, arms) {
  return { name, dir: `evals/engineering/${name}`, runsPerCase: 3, arms };
}

function aggregate(cases) {
  return { schemaVersion: 1, claudeVersion: "2.1.289", costUsd: 1, cases };
}

test("one file compares the without-arm to the with-arm", (t) => {
  const file = writeResult(
    t,
    aggregate([
      evalCase("b", {
        with: [run({ costUsd: 0.3 }), run({ costUsd: 0.3 }), run({ costUsd: 0.3 })],
        without: [run({ costUsd: 0.1 }), run({ passed: false, costUsd: 0.1 }), run()],
      }),
      evalCase("a", {
        with: [run({ costUsd: 0.2 })],
        without: [run({ passed: false, costUsd: 0.2 })],
      }),
    ]),
  );
  const result = compare(file);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    result.stdout,
    [
      "a without 0/1 $0.2000 with 1/1 $0.2000 cost 0% pass +100pts",
      "b without 2/3 $0.0733 with 3/3 $0.3000 cost +309.1% pass +33.3pts",
      "total without 2/4 $0.1050 with 4/4 $0.2750 cost +161.9% pass +50pts",
      "",
    ].join("\n"),
  );
});

test("two files compare the control's with-arm to the treatment's", (t) => {
  const control = writeResult(
    t,
    aggregate([
      evalCase("a", { with: [run({ costUsd: 5 }), run({ passed: false, costUsd: 5 })] }),
      evalCase("gone", { with: [run()] }),
    ]),
  );
  const treatment = writeResult(
    t,
    aggregate([
      evalCase("a", {
        with: [run({ costUsd: 12 }), run({ costUsd: 12 })],
        without: [run({ passed: false, costUsd: 99 })],
      }),
      evalCase("new", { with: [run()] }),
    ]),
  );
  const result = compare(control, treatment);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    result.stdout,
    [
      "a control 1/2 $5.0000 treatment 2/2 $12.0000 cost +140% pass +50pts",
      "gone only in control",
      "new only in treatment",
      "total control 1/2 $5.0000 treatment 2/2 $12.0000 cost +140% pass +50pts",
      "",
    ].join("\n"),
  );
});

test("excluded runs count toward neither pass rate nor cost", (t) => {
  const file = writeResult(
    t,
    aggregate([
      evalCase("a", {
        with: [run({ costUsd: 1 }), run({ passed: false, costUsd: 9, error: "Rate limit hit" })],
        without: [run({ costUsd: 1 }), run({ costUsd: 9, skippedPaidGraders: true })],
      }),
    ]),
  );
  const result = compare(file);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^a without 1\/1 \$1\.0000 with 1\/1 \$1\.0000 cost 0% pass 0pts\n/);
});

test("an errored run fails, and a side with no costed run prints -", (t) => {
  const uncosted = run();
  delete uncosted.costUsd;
  const file = writeResult(
    t,
    aggregate([
      evalCase("a", {
        with: [run({ costUsd: null, error: "timed out" })],
        without: [uncosted],
      }),
    ]),
  );
  const result = compare(file);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^a without 1\/1 - with 0\/1 - cost - pass -100pts\n/);
});

test("a case with no runs on a side prints - for both deltas", (t) => {
  const file = writeResult(t, aggregate([evalCase("a", { with: [run()] })]));
  const result = compare(file);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^a without 0\/0 - with 1\/1 \$0\.0200 cost - pass -\n/);
});

test("bad input exits 2 with one stderr line and no stdout", async (t) => {
  const cases = {
    "no arguments": () => [],
    "a flag": () => ["--runs", "3"],
    "three files": (st) => {
      const file = writeResult(st, aggregate([]));
      return [file, file, file];
    },
    "a missing file": () => ["/nonexistent/aggregate-result.json"],
    "a wrong schemaVersion": (st) => [writeResult(st, { schemaVersion: 2, cases: [] })],
    "a non-array arms.without": (st) => [
      writeResult(st, aggregate([evalCase("a", { with: [], without: {} })])),
    ],
    "a negative costUsd": (st) => [
      writeResult(st, aggregate([evalCase("a", { with: [run({ costUsd: -1 })] })])),
    ],
    "a string costUsd": (st) => [
      writeResult(st, aggregate([evalCase("a", { with: [run({ costUsd: "0.1" })] })])),
    ],
    "a clean run with no graders": (st) => {
      const bare = run();
      delete bare.graders;
      return [writeResult(st, aggregate([evalCase("a", { with: [bare] })]))];
    },
  };
  for (const [name, argsFor] of Object.entries(cases)) {
    await t.test(name, (st) => {
      const result = compare(...argsFor(st));
      assert.equal(result.status, 2, result.stdout);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, ONE_STDERR_LINE);
    });
  }
});
