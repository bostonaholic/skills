// Fails when scripts/eval-compare.mjs counts a -calibrate-bad case by the normal run rule. That
// case passes calibration only when the judge fails its known-bad reply, and evals gate CI.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

function run(passed) {
  return {
    passed,
    costUsd: 0.02,
    error: null,
    skippedPaidGraders: false,
    graders: [{ name: "rubric", passed, weight: 1, withOnly: false, scored: true }],
  };
}

test("a -calibrate-bad case counts a run the judge failed as passing", (t) => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "eval-compare-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, "aggregate-result.json");
  const evalCase = {
    name: "a-calibrate-bad",
    dir: "evals/engineering/a/a-calibrate-bad",
    runsPerCase: 1,
    arms: { with: [run(false)], without: [run(true)] },
  };
  writeFileSync(file, JSON.stringify({ schemaVersion: 1, costUsd: 1, cases: [evalCase] }));
  const result = spawnSync(process.execPath, [resolve("scripts/eval-compare.mjs"), file], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^a-calibrate-bad without 0\/1 \S+ with 1\/1 /);
});
