#!/usr/bin/env node
// Compares eval results against a committed per-model baseline, or records them into it.
//   node scripts/eval-baseline.mjs compare|record --runs <1|3> <baseline.json> <aggregate-result.json>...
// A baseline (evals/baselines/<model>.json) holds one entry per case: the with-arm and
// without-arm tallies from scripts/eval-verdict.mjs's rules, the CLI's mean score per arm, and
// the with-arm passing-run count per grader. A without-arm run ignores withOnly graders.
// compare prints one line per case in the results, sorted by name:
//   <case> with <before> -> <after> | without <before> -> <after> | <status>
// where each side is <passing>/<counted> <pass|fail|incomplete>, or "none" with no baseline
// entry. Status is new (no entry), regressed (passed before, not after), improved or worse (the
// with-arm pass rate moved), or same. An indented line follows for each grader whose count moved.
// Exit 1 when any case regressed.
// record prints the same comparison, then writes the baseline. It needs --runs 3 and results run
// with the without-arm (suite.ablation with-without) on the baseline's model. An incomplete case
// keeps its old entry. Exit 0 once written.
// Exit 2 with one stderr line on a bad argument, an unreadable or invalid file, or a model mismatch.
import { existsSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import {
  PASSING_RUNS_NEEDED,
  VerdictError,
  armRuns,
  readResult,
  tallyRuns,
} from "./eval-verdict.mjs";

const USAGE =
  "usage: node scripts/eval-baseline.mjs compare|record --runs <1|3> <baseline.json> <aggregate-result.json>...";
const BASELINE_SCHEMA = 1;

function parseArgs(args) {
  const [mode, flag, runs, baselinePath, ...resultPaths] = args;
  if (!["compare", "record"].includes(mode) || flag !== "--runs" || resultPaths.length === 0)
    throw new VerdictError(USAGE);
  if (!PASSING_RUNS_NEEDED.has(runs)) throw new VerdictError(`--runs must be 1 or 3, got ${runs}`);
  if (mode === "record" && runs !== "3") throw new VerdictError("record needs --runs 3");
  return {
    mode,
    rule: { runs: Number(runs), passingNeeded: PASSING_RUNS_NEEDED.get(runs) },
    baselinePath,
    resultPaths,
  };
}

function round(value) {
  return typeof value === "number" ? Math.round(value * 1000) / 1000 : null;
}

function graderCounts(runs) {
  const counts = {};
  for (const run of runs) {
    for (const grader of run.graders ?? []) {
      counts[grader.name] ??= 0;
      if (grader.passed === true) counts[grader.name] += 1;
    }
  }
  return sortKeys(counts);
}

function sortKeys(object) {
  return Object.fromEntries(Object.entries(object).sort(([a], [b]) => (a < b ? -1 : 1)));
}

// Summarizes one aggregate-result.json as { model, ablation, cases: { <case>: entry } }.
export function summarizeResult(document, rule) {
  if (document?.schemaVersion !== 1)
    throw new VerdictError(`schemaVersion ${document?.schemaVersion} is not 1`);
  if (!Array.isArray(document.cases)) throw new VerdictError("cases is missing or not an array");
  const cases = {};
  document.cases.forEach((evalCase, index) => {
    const withRuns = armRuns(evalCase, index, "with");
    const withoutRuns = armRuns(evalCase, index, "without");
    const counted = (runs) => runs.filter((run) => run.skippedPaidGraders !== true);
    cases[evalCase.name] = {
      recordedAt: document.startedAt ?? null,
      claudeVersion: document.claudeVersion ?? null,
      judgeModel: document.suite?.judgeModel ?? null,
      runs: rule.runs,
      with: {
        ...tallyRuns(evalCase.name, withRuns, rule),
        score: round(evalCase.aggregates?.score),
        graders: graderCounts(counted(withRuns)),
      },
      without: {
        ...tallyRuns(evalCase.name, withoutRuns, rule, true),
        score: round(evalCase.aggregates?.scoreWithout),
      },
    };
  });
  return {
    model: document.suite?.modelOverride ?? null,
    ablation: document.suite?.ablation ?? null,
    cases,
  };
}

function side(arm) {
  return arm === undefined ? "none" : `${arm.passing}/${arm.counted} ${arm.result}`;
}

function rate(arm) {
  return arm.counted === 0 ? 0 : arm.passing / arm.counted;
}

function status(before, after) {
  if (before === undefined) return "new";
  if (before.with.result === "pass" && after.with.result !== "pass") return "regressed";
  if (rate(after.with) > rate(before.with)) return "improved";
  if (rate(after.with) < rate(before.with)) return "worse";
  return "same";
}

// Returns { lines, regressed } comparing each case in `after` with its `before` entry.
export function compareCases(before, after) {
  const lines = [];
  let regressed = false;
  for (const name of Object.keys(after).sort()) {
    const old = before[name];
    const now = after[name];
    const caseStatus = status(old, now);
    if (caseStatus === "regressed") regressed = true;
    lines.push(
      `${name} with ${side(old?.with)} -> ${side(now.with)} | without ${side(old?.without)} -> ${side(now.without)} | ${caseStatus}`,
    );
    if (old === undefined) continue;
    for (const grader of Object.keys({ ...old.with.graders, ...now.with.graders }).sort()) {
      const was = old.with.graders[grader] ?? "none";
      const is = now.with.graders[grader] ?? "none";
      if (was !== is) lines.push(`  ${grader} ${was} -> ${is}`);
    }
  }
  return { lines, regressed };
}

// Returns the baseline with each complete case in `cases` replacing its entry, and the names kept.
export function mergeBaseline(baseline, model, cases) {
  const merged = { ...baseline.cases };
  const kept = [];
  for (const [name, entry] of Object.entries(cases)) {
    if (entry.with.result === "incomplete") kept.push(name);
    else merged[name] = entry;
  }
  return { baseline: { schemaVersion: BASELINE_SCHEMA, model, cases: sortKeys(merged) }, kept };
}

function readBaseline(path, model) {
  if (!existsSync(path)) return { schemaVersion: BASELINE_SCHEMA, model, cases: {} };
  const baseline = readResult(path);
  if (baseline?.schemaVersion !== BASELINE_SCHEMA)
    throw new VerdictError(`${path}: schemaVersion ${baseline?.schemaVersion} is not 1`);
  if (baseline.model !== model)
    throw new VerdictError(`${path} is for model ${baseline.model}, results are ${model}`);
  return baseline;
}

function summarizeAll(paths, rule) {
  const summaries = paths.map((path) => ({ path, ...summarizeResult(readResult(path), rule) }));
  const models = new Set(summaries.map((s) => s.model));
  if (models.size !== 1 || models.has(null))
    throw new VerdictError(`results need one model, got ${[...models].join(", ")}`);
  return {
    model: summaries[0].model,
    summaries,
    cases: Object.assign({}, ...summaries.map((s) => s.cases)),
  };
}

function run(args) {
  const { mode, rule, baselinePath, resultPaths } = parseArgs(args);
  const { model, summaries, cases } = summarizeAll(resultPaths, rule);
  const baseline = readBaseline(baselinePath, model);
  const { lines, regressed } = compareCases(baseline.cases, cases);
  process.stdout.write(lines.map((line) => `${line}\n`).join(""));
  if (mode === "compare") return regressed ? 1 : 0;
  const noAblation = summaries.find((s) => s.ablation !== "with-without");
  if (noAblation) throw new VerdictError(`${noAblation.path}: suite.ablation is not with-without`);
  const merged = mergeBaseline(baseline, model, cases);
  for (const name of merged.kept) console.log(`kept ${name}: incomplete`);
  mkdirSync(dirname(baselinePath), { recursive: true });
  writeFileSync(baselinePath, `${JSON.stringify(merged.baseline, null, 2)}\n`);
  console.log(`wrote ${baselinePath}`);
  return 0;
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    process.exitCode = run(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof VerdictError)) throw error;
    console.error(`eval-baseline.mjs: ${error.message}`);
    process.exitCode = 2;
  }
}
