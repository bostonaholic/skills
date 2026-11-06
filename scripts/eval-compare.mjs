#!/usr/bin/env node
// Prints each case's pass rate and mean cost for two sets of runs, and how far they differ, so a
// quality gain can be weighed against what it costs.
//   node scripts/eval-compare.mjs <aggregate-result.json>
//   node scripts/eval-compare.mjs <control/aggregate-result.json> <treatment/aggregate-result.json>
// One file compares its without-arm (baseline) to its with-arm. Two files compare the first
// file's with-arm (control) to the second's (treatment), such as a skill before and after an
// edit, or two variants of a skill run in separate checkouts.
// Runs count as in scripts/eval-verdict.mjs: a run with skippedPaidGraders true or an error that
// names a usage or rate limit is excluded, and a counted run passes when it ended without an error
// and every grader passed or was unscored. Cost is the run's costUsd, the agent's spend without
// the judge's, averaged over the counted runs that report it.
// Output, sorted by case name, one line per case and then a total line over every counted run:
//   <case> <label> <passing>/<counted> <cost> <label> <passing>/<counted> <cost> cost <delta> pass <delta>
// <cost> is $ and four decimals, or - with no costed run. The cost delta is the relative change
// in mean cost, and the pass delta is the change in pass rate in percentage points; either is -
// when a side has nothing to compare. A case in only one file prints `<case> only in <label>`.
// Exit 2 with one stderr line and no stdout on a bad argument, on any input eval-verdict.mjs
// rejects, on a present arms.without that is not an array, or on a costUsd that is not a
// non-negative number.
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  VerdictError,
  checkRun,
  endedClean,
  isExcluded,
  isObject,
  readResult,
  runPasses,
} from "./eval-verdict.mjs";

const USAGE =
  "usage: node scripts/eval-compare.mjs <aggregate-result.json> [<treatment aggregate-result.json>]";

function parseArgs(args) {
  if (args.length < 1 || args.length > 2 || args.some((arg) => arg.startsWith("-")))
    throw new VerdictError(USAGE);
  return args;
}

function armRuns(evalCase, arm, where) {
  const { arms } = evalCase;
  if (arms !== undefined && arms !== null && !isObject(arms))
    throw new VerdictError(`${where}: arms is not an object`);
  const runs = arms?.[arm] ?? [];
  if (!Array.isArray(runs)) throw new VerdictError(`${where}: arms.${arm} is not an array`);
  runs.forEach((run, index) => {
    const runWhere = `${where}: arms.${arm}[${index}]`;
    checkRun(run, runWhere);
    const cost = run.costUsd;
    if (cost !== undefined && cost !== null && !(Number.isFinite(cost) && cost >= 0))
      throw new VerdictError(`${runWhere}: costUsd is not a non-negative number`);
  });
  return runs;
}

// Tallies the counted runs of one arm: how many, how many pass, and their summed cost.
function tally(runs, where) {
  const counted = runs.filter((run) => !isExcluded(run));
  if (
    counted.some(
      (run) => endedClean(run) && !(Array.isArray(run.graders) && run.graders.length > 0),
    )
  )
    throw new VerdictError(`${where}: a run with no error has no graders list`);
  const costed = counted.filter((run) => typeof run.costUsd === "number");
  return {
    counted: counted.length,
    passing: counted.filter(runPasses).length,
    costed: costed.length,
    cost: costed.reduce((sum, run) => sum + run.costUsd, 0),
  };
}

function casesOf(document) {
  if (document?.schemaVersion !== 1)
    throw new VerdictError(`schemaVersion ${document?.schemaVersion} is not 1`);
  if (!Array.isArray(document.cases)) throw new VerdictError("cases is missing or not an array");
  return document.cases.map((evalCase, index) => {
    if (!isObject(evalCase)) throw new VerdictError(`cases[${index}] is not an object`);
    return evalCase;
  });
}

function sides(arm, label, document) {
  return new Map(
    casesOf(document).map((evalCase) => {
      const where = `case ${evalCase.name}`;
      return [evalCase.name, { label, ...tally(armRuns(evalCase, arm, where), where) }];
    }),
  );
}

function meanCost(side) {
  return side.costed === 0 ? null : side.cost / side.costed;
}

function describe(side) {
  const cost = meanCost(side);
  return `${side.label} ${side.passing}/${side.counted} ${cost === null ? "-" : `$${cost.toFixed(4)}`}`;
}

function signed(value, unit) {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}${unit}`;
}

function deltas(base, next) {
  const baseCost = meanCost(base);
  const nextCost = meanCost(next);
  const cost =
    baseCost === null || nextCost === null || baseCost === 0
      ? "-"
      : signed(((nextCost - baseCost) / baseCost) * 100, "%");
  const pass =
    base.counted === 0 || next.counted === 0
      ? "-"
      : signed((next.passing / next.counted - base.passing / base.counted) * 100, "pts");
  return `cost ${cost} pass ${pass}`;
}

function sum(sideList, label) {
  return sideList.reduce(
    (total, side) => ({
      label,
      counted: total.counted + side.counted,
      passing: total.passing + side.passing,
      costed: total.costed + side.costed,
      cost: total.cost + side.cost,
    }),
    { label, counted: 0, passing: 0, costed: 0, cost: 0 },
  );
}

export function compare(baseSides, nextSides) {
  const names = [...new Set([...baseSides.keys(), ...nextSides.keys()])].sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  const lines = [];
  const paired = [];
  for (const name of names) {
    const base = baseSides.get(name);
    const next = nextSides.get(name);
    if (!base || !next) {
      lines.push(`${name} only in ${(base ?? next).label}`);
      continue;
    }
    paired.push([base, next]);
    lines.push(`${name} ${describe(base)} ${describe(next)} ${deltas(base, next)}`);
  }
  if (paired.length > 0) {
    const base = sum(
      paired.map(([b]) => b),
      paired[0][0].label,
    );
    const next = sum(
      paired.map(([, n]) => n),
      paired[0][1].label,
    );
    lines.push(`total ${describe(base)} ${describe(next)} ${deltas(base, next)}`);
  }
  return lines;
}

function run(args) {
  const [first, second] = parseArgs(args);
  const firstDocument = readResult(first);
  const lines =
    second === undefined
      ? compare(sides("without", "without", firstDocument), sides("with", "with", firstDocument))
      : compare(
          sides("with", "control", firstDocument),
          sides("with", "treatment", readResult(second)),
        );
  process.stdout.write(lines.map((line) => `${line}\n`).join(""));
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    run(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof VerdictError)) throw error;
    console.error(`eval-compare.mjs: ${error.message}`);
    process.exit(2);
  }
}
