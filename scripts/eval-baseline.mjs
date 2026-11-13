#!/usr/bin/env node
// Records eval results into a committed per-model baseline, evals/baselines/<model>.json.
//   node scripts/eval-baseline.mjs <baseline.json> <aggregate-result.json>...
// The baseline is a trimmed aggregate-result.json: each case keeps its name, recordedAt (the
// run's startedAt), claudeVersion, judgeModel, runsPerCase, and both arms' runs with only the
// fields scripts/eval-verdict.mjs and scripts/eval-compare.mjs read. So
//   node scripts/eval-compare.mjs evals/baselines/<model>.json <aggregate-result.json>
// compares the recorded with-arm (before) to a new run's with-arm (after), and the recorded
// without-arm is the no-skill score.
// Each complete case replaces its entry and every other entry stays. A case is complete when
// both arms hold runsPerCase runs and no run is excluded under eval-verdict.mjs's rules; an
// incomplete case keeps its old entry and prints `kept <case>: incomplete`.
// Exit 0 once written. Exit 2 with one stderr line and nothing written on a bad argument, any
// input eval-verdict.mjs rejects, a result not run at --runs 3 or without the without-arm
// (suite.ablation with-without), results from more than one model, or a baseline for another model.
import { existsSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { VerdictError, checkRun, isExcluded, isObject, readResult } from "./eval-verdict.mjs";

const USAGE = "usage: node scripts/eval-baseline.mjs <baseline.json> <aggregate-result.json>...";
const RUNS = 3;
const ABLATION = "with-without";

function trimRun(run) {
  return {
    score: run.score ?? null,
    passed: run.passed ?? null,
    error: run.error ?? null,
    skippedPaidGraders: run.skippedPaidGraders ?? false,
    costUsd: run.costUsd ?? null,
    graders: (run.graders ?? []).map(({ name, passed, scored, withOnly }) => ({
      name,
      passed,
      scored,
      withOnly,
    })),
  };
}

function armRuns(evalCase, arm) {
  const runs = evalCase.arms?.[arm] ?? [];
  if (!Array.isArray(runs))
    throw new VerdictError(`case ${evalCase.name}: arms.${arm} is not an array`);
  runs.forEach((run, index) => checkRun(run, `case ${evalCase.name}: arms.${arm}[${index}]`));
  return runs;
}

// Returns { model, cases } from one result: each case trimmed and marked complete or not.
export function trimResult(document) {
  if (document?.schemaVersion !== 1)
    throw new VerdictError(`schemaVersion ${document?.schemaVersion} is not 1`);
  if (!Array.isArray(document.cases)) throw new VerdictError("cases is missing or not an array");
  if (document.suite?.ablation !== ABLATION)
    throw new VerdictError(`suite.ablation is ${document.suite?.ablation}, not ${ABLATION}`);
  const cases = document.cases.map((evalCase, index) => {
    if (!isObject(evalCase)) throw new VerdictError(`cases[${index}] is not an object`);
    if (evalCase.runsPerCase !== RUNS)
      throw new VerdictError(
        `case ${evalCase.name}: runsPerCase ${evalCase.runsPerCase}, not ${RUNS}`,
      );
    const withRuns = armRuns(evalCase, "with");
    const withoutRuns = armRuns(evalCase, "without");
    const complete = [withRuns, withoutRuns].every(
      (runs) => runs.length === RUNS && !runs.some(isExcluded),
    );
    return {
      complete,
      entry: {
        name: evalCase.name,
        recordedAt: document.startedAt ?? null,
        claudeVersion: document.claudeVersion ?? null,
        judgeModel: document.suite?.judgeModel ?? null,
        runsPerCase: RUNS,
        arms: { with: withRuns.map(trimRun), without: withoutRuns.map(trimRun) },
      },
    };
  });
  return { model: document.suite?.modelOverride ?? null, cases };
}

// Returns the merged baseline and the names of incomplete cases that kept their old entry.
export function mergeBaseline(baseline, model, trimmed) {
  const byName = new Map((baseline?.cases ?? []).map((entry) => [entry.name, entry]));
  const kept = [];
  for (const { complete, entry } of trimmed) {
    if (complete) byName.set(entry.name, entry);
    else kept.push(entry.name);
  }
  const cases = [...byName.values()].sort((a, b) => (a.name < b.name ? -1 : 1));
  return {
    baseline: { schemaVersion: 1, suite: { modelOverride: model, ablation: ABLATION }, cases },
    kept,
  };
}

function run(args) {
  if (args.length < 2 || args.some((arg) => arg.startsWith("-"))) throw new VerdictError(USAGE);
  const [baselinePath, ...resultPaths] = args;
  const results = resultPaths.map((path) => trimResult(readResult(path)));
  const models = new Set(results.map((result) => result.model));
  if (models.size !== 1 || models.has(null))
    throw new VerdictError(`results need one model, got ${[...models].join(", ")}`);
  const [model] = models;
  const baseline = existsSync(baselinePath) ? readResult(baselinePath) : null;
  if (baseline !== null && baseline.suite?.modelOverride !== model)
    throw new VerdictError(
      `${baselinePath} is for model ${baseline.suite?.modelOverride}, results are ${model}`,
    );
  const merged = mergeBaseline(
    baseline,
    model,
    results.flatMap((result) => result.cases),
  );
  mkdirSync(dirname(baselinePath), { recursive: true });
  writeFileSync(baselinePath, `${JSON.stringify(merged.baseline, null, 2)}\n`);
  for (const name of merged.kept) console.log(`kept ${name}: incomplete`);
  console.log(`wrote ${baselinePath}`);
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    run(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof VerdictError)) throw error;
    console.error(`eval-baseline.mjs: ${error.message}`);
    process.exit(2);
  }
}
