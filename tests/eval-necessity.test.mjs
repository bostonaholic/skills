// Fails when scripts/eval-necessity.mjs gives a skill the wrong verdict: a wrong Fisher p-value,
// a case put in the wrong class, runs from two files of one model not pooled, an excluded run
// counted, a wrong cross-model label, or a bad input that prints a report instead of exit 2.
// Each case writes synthetic aggregate-result.json files in the shape claude plugin eval 2.1.323
// writes and runs the real script. No case calls a model.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fisherOneSided } from "../scripts/eval-necessity.mjs";

const NECESSITY = resolve("scripts/eval-necessity.mjs");
const ONE_STDERR_LINE = /^eval-necessity\.mjs: [^\n]+\n?$/;

function necessity(...args) {
  const run = spawnSync(process.execPath, [NECESSITY, ...args], { encoding: "utf8" });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

function scratch(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "eval-necessity-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

let fileCount = 0;
function writeResult(dir, document) {
  fileCount += 1;
  const path = join(dir, `result-${fileCount}.json`);
  writeFileSync(path, JSON.stringify(document, null, 2));
  return path;
}

function run({ passed = true, fired = true, costUsd = 0.02, error = null, skipped = false } = {}) {
  return {
    passed,
    costUsd,
    error,
    skippedPaidGraders: skipped,
    graders: [
      { name: "core-rule", passed, scored: true, withOnly: false },
      { name: "fired", passed: fired, scored: false, withOnly: true },
    ],
  };
}

// Runs with `passing` of `total` passing.
function runs(passing, total, options = {}) {
  return Array.from({ length: total }, (_, i) => run({ ...options, passed: i < passing }));
}

function evalCase(skill, kind, withRuns, withoutRuns) {
  return {
    name: `${skill}-${kind}`,
    dir: `evals/engineering/${skill}/${skill}-${kind}`,
    arms: { with: withRuns, without: withoutRuns },
  };
}

function aggregate(model, cases) {
  return {
    schemaVersion: 1,
    suite: { ablation: "with-without", modelOverride: model },
    cases,
  };
}

function lineFor(stdout, prefix) {
  return stdout.split("\n").find((line) => line.startsWith(`${prefix} `));
}

test("fisherOneSided matches hand-computed hypergeometric tails", () => {
  assert.equal(fisherOneSided(3, 3, 0, 3), 1 / 20);
  assert.equal(fisherOneSided(3, 3, 1, 3), 4 / 20);
  assert.equal(fisherOneSided(2, 3, 0, 3), 4 / 20);
  assert.ok(Math.abs(fisherOneSided(9, 9, 5, 9) - 2002 / 48620) < 1e-12);
  assert.equal(fisherOneSided(0, 3, 3, 3), 1);
});

test("a case with a significant gain makes the skill NEEDED", (t) => {
  const file = writeResult(
    scratch(t),
    aggregate("sonnet", [
      evalCase("alpha", "core", runs(3, 3), runs(0, 3)),
      evalCase("alpha", "guard", runs(3, 3), runs(3, 3)),
    ]),
  );
  const result = necessity(file);
  assert.equal(result.status, 0, result.stderr);
  assert.match(lineFor(result.stdout, "alpha"), /^alpha sonnet NEEDED with 6\/6 without 3\/6 /);
});

test("a with-arm that fails its own case makes the skill FIX-CASE", (t) => {
  const file = writeResult(
    scratch(t),
    aggregate("sonnet", [evalCase("beta", "core", runs(1, 3), runs(1, 3))]),
  );
  assert.match(lineFor(necessity(file).stdout, "beta"), /^beta sonnet FIX-CASE /);
});

test("parity needs nine runs per arm; fewer is UNCLEAR", (t) => {
  const dir = scratch(t);
  const three = writeResult(
    dir,
    aggregate("sonnet", [evalCase("gamma", "core", runs(3, 3), runs(3, 3))]),
  );
  assert.match(lineFor(necessity(three).stdout, "gamma"), /^gamma sonnet UNCLEAR /);
  const nine = writeResult(
    dir,
    aggregate("sonnet", [evalCase("gamma", "core", runs(9, 9), runs(8, 9))]),
  );
  assert.match(lineFor(necessity(nine).stdout, "gamma"), /^gamma sonnet NO-GAIN /);
});

test("a without-arm more than 15 points below the with-arm is not parity", (t) => {
  const file = writeResult(
    scratch(t),
    aggregate("sonnet", [evalCase("delta", "core", runs(9, 9), runs(7, 9))]),
  );
  assert.match(lineFor(necessity(file).stdout, "delta"), /^delta sonnet UNCLEAR /);
});

test("files of one model pool their runs", (t) => {
  const dir = scratch(t);
  const first = writeResult(
    dir,
    aggregate("sonnet", [evalCase("eps", "core", runs(3, 3), runs(3, 3))]),
  );
  const second = writeResult(
    dir,
    aggregate("sonnet", [evalCase("eps", "core", runs(6, 6), runs(5, 6))]),
  );
  assert.match(
    lineFor(necessity(first, second).stdout, "eps"),
    /^eps sonnet NO-GAIN with 9\/9 without 8\/9 /,
  );
});

test("excluded runs count toward neither arm", (t) => {
  const file = writeResult(
    scratch(t),
    aggregate("sonnet", [
      evalCase(
        "zeta",
        "core",
        [...runs(3, 3), run({ passed: false, skipped: true })],
        [...runs(0, 3), run({ passed: false, error: "API rate limit reached" })],
      ),
    ]),
  );
  assert.match(
    lineFor(necessity(file).stdout, "zeta"),
    /^zeta sonnet NEEDED with 3\/3 without 0\/3 /,
  );
});

test("fired counts trigger and core runs only, and cost is the mean per arm", (t) => {
  const file = writeResult(
    scratch(t),
    aggregate("sonnet", [
      evalCase(
        "eta",
        "core",
        [run({ costUsd: 0.3 }), run({ costUsd: 0.3, fired: false }), run({ costUsd: 0.3 })],
        runs(0, 3, { costUsd: 0.1 }),
      ),
      evalCase("eta", "guard", runs(3, 3, { costUsd: 0.3, fired: false }), runs(3, 3)),
    ]),
  );
  const line = lineFor(necessity(file).stdout, "eta");
  assert.match(line, / fired 2\/3 /);
  assert.match(line, / cost \$0\.3000 \$0\.0600 \+400%$/);
});

test("with two models, NO-GAIN on the last is OBSOLETE when another model needed it", (t) => {
  const dir = scratch(t);
  const older = writeResult(
    dir,
    aggregate("sonnet", [
      evalCase("theta", "core", runs(3, 3), runs(0, 3)),
      evalCase("iota", "core", runs(9, 9), runs(9, 9)),
    ]),
  );
  const newer = writeResult(
    dir,
    aggregate("opus", [
      evalCase("theta", "core", runs(9, 9), runs(9, 9)),
      evalCase("iota", "core", runs(9, 9), runs(9, 9)),
    ]),
  );
  const { stdout, status } = necessity(older, newer);
  assert.equal(status, 0);
  assert.match(stdout, /^theta opus OBSOLETE needed on sonnet$/m);
  assert.match(stdout, /^iota opus UNPROVEN$/m);
});

test("calibration cases count toward no skill", (t) => {
  const file = writeResult(
    scratch(t),
    aggregate("sonnet", [
      evalCase("kappa", "core", runs(9, 9), runs(9, 9)),
      evalCase("kappa", "guard-calibrate-good", runs(0, 3), runs(0, 3)),
      evalCase("kappa", "guard-calibrate-bad", runs(3, 3), runs(0, 3)),
    ]),
  );
  assert.match(
    lineFor(necessity(file).stdout, "kappa"),
    /^kappa sonnet NO-GAIN with 9\/9 without 9\/9 /,
  );
});

for (const [label, document] of [
  ["a schemaVersion other than 1", { schemaVersion: 2 }],
  [
    "a run without the without-arm",
    { schemaVersion: 1, suite: { ablation: "none", modelOverride: "sonnet" }, cases: [] },
  ],
  ["a missing modelOverride", { schemaVersion: 1, suite: { ablation: "with-without" }, cases: [] }],
  [
    "a case dir outside evals/<category>/<skill>/<case>",
    aggregate("sonnet", [{ name: "x", dir: "x", arms: { with: [], without: [] } }]),
  ],
  ["a negative costUsd", aggregate("sonnet", [evalCase("k", "core", [run({ costUsd: -1 })], [])])],
]) {
  test(`exits 2 with one stderr line on ${label}`, (t) => {
    const result = necessity(writeResult(scratch(t), document));
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, ONE_STDERR_LINE);
  });
}

test("exits 2 with one stderr line when given no file", () => {
  const result = necessity();
  assert.equal(result.status, 2);
  assert.match(result.stderr, ONE_STDERR_LINE);
});
