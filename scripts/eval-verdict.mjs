#!/usr/bin/env node
// Prints one verdict line per case from a `claude plugin eval` aggregate-result.json.
//   node scripts/eval-verdict.mjs --runs <1|3> <aggregate-result.json>
// --runs repeats the eval command's --runs value. Only cases[].arms.with[] is read; a missing or
// null arms or arms.with is zero runs.
// Run rule: a run is excluded when skippedPaidGraders is true or its error names a usage or rate
// limit. A counted run passes when its error is null or absent and every graders[] entry has
// scored false or passed true, so a timeout or scaffold failure fails its run.
// Case rule: a case with fewer counted runs than --runs is incomplete. Otherwise it passes at
// --runs 1 on 1/1 and at --runs 3 on 2 or 3 passing runs; else it fails.
// Output, sorted by case name: <case> <passing>/<counted> excluded <n> <pass|fail|incomplete>.
// Exit 2 with one stderr line and no stdout on:
// - a bad argument: a --runs value other than 1 or 3, or anything but --runs <n> <file>
// - an unreadable or non-JSON file
// - a schemaVersion other than 1
// - cases missing or not an array
// - a cases entry, a present arms, a with-arm run, or a graders[] entry that is not an object
// - a present arms.with that is not an array
// - a run error that is neither null, absent, nor a string
// - a present skippedPaidGraders, scored, or passed that is not a boolean
// - a case with more with-arm runs than --runs
// - a counted run with no error and a missing or empty graders list. A loaded case has at least
//   one grader, so that run means the script reads the wrong key.
// The whole file is checked before any output.
import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

const USAGE = "usage: node scripts/eval-verdict.mjs --runs <1|3> <aggregate-result.json>";
export const PASSING_RUNS_NEEDED = new Map([
  ["1", 1],
  ["3", 2],
]);
const LIMIT_ERROR = /(usage|rate)[ -]limit/i;

// Input the script cannot judge. The CLI reports its message and exits 2.
export class VerdictError extends Error {}

function parseArgs(args) {
  if (args[0] === "--runs" && args.length >= 2 && !PASSING_RUNS_NEEDED.has(args[1]))
    throw new VerdictError(`--runs must be 1 or 3, got ${args[1]}`);
  if (args.length !== 3 || args[0] !== "--runs" || !PASSING_RUNS_NEEDED.has(args[1]))
    throw new VerdictError(USAGE);
  return { runs: Number(args[1]), passingNeeded: PASSING_RUNS_NEEDED.get(args[1]), path: args[2] };
}

export function readResult(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    throw new VerdictError(`cannot read ${path}: ${error.code ?? error.message}`, { cause: error });
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new VerdictError(`${path} is not JSON`, { cause: error });
  }
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checkOptionalBoolean(owner, key, where) {
  if (owner[key] !== undefined && typeof owner[key] !== "boolean")
    throw new VerdictError(`${where}: ${key} is not a boolean`);
}

function checkRun(run, where) {
  if (!isObject(run)) throw new VerdictError(`${where} is not an object`);
  if (run.error !== undefined && run.error !== null && typeof run.error !== "string")
    throw new VerdictError(`${where}: error is neither null nor a string`);
  checkOptionalBoolean(run, "skippedPaidGraders", where);
  if (!Array.isArray(run.graders)) return;
  run.graders.forEach((grader, index) => {
    const graderWhere = `${where}: graders[${index}]`;
    if (!isObject(grader)) throw new VerdictError(`${graderWhere} is not an object`);
    checkOptionalBoolean(grader, "scored", graderWhere);
    checkOptionalBoolean(grader, "passed", graderWhere);
  });
}

// Returns the case's runs in one arm ("with" or "without"), validating each run's shape.
export function armRuns(evalCase, index, arm = "with") {
  if (!isObject(evalCase)) throw new VerdictError(`cases[${index}] is not an object`);
  const where = `case ${evalCase.name}`;
  const { arms } = evalCase;
  if (arms !== undefined && arms !== null && !isObject(arms))
    throw new VerdictError(`${where}: arms is not an object`);
  const runs = arms?.[arm] ?? [];
  if (!Array.isArray(runs)) throw new VerdictError(`${where}: arms.${arm} is not an array`);
  runs.forEach((run, runIndex) => checkRun(run, `${where}: arms.${arm}[${runIndex}]`));
  return runs;
}

function isExcluded(run) {
  return run.skippedPaidGraders === true || LIMIT_ERROR.test(run.error ?? "");
}

function endedClean(run) {
  return run.error === null || run.error === undefined;
}

// A without-arm run ignores withOnly graders: they check that the skill fired, which it cannot.
function runPasses(run, ignoreWithOnly) {
  return (
    endedClean(run) &&
    run.graders.every(
      (grader) =>
        (ignoreWithOnly && grader.withOnly === true) ||
        grader.scored === false ||
        grader.passed === true,
    )
  );
}

// Applies the run and case rules to one arm's runs: { passing, counted, excluded, result }.
export function tallyRuns(name, runs, { runs: expected, passingNeeded }, ignoreWithOnly = false) {
  if (runs.length > expected)
    throw new VerdictError(`case ${name}: ${runs.length} runs exceed --runs ${expected}`);
  const counted = runs.filter((run) => !isExcluded(run));
  if (
    counted.some(
      (run) => endedClean(run) && !(Array.isArray(run.graders) && run.graders.length > 0),
    )
  ) {
    throw new VerdictError(`case ${name}: a run with no error has no graders list`);
  }
  const passing = counted.filter((run) => runPasses(run, ignoreWithOnly)).length;
  const result =
    counted.length < expected ? "incomplete" : passing >= passingNeeded ? "pass" : "fail";
  return { passing, counted: counted.length, excluded: runs.length - counted.length, result };
}

function judgeCase(evalCase, index, rule) {
  const runs = armRuns(evalCase, index);
  const tally = tallyRuns(evalCase.name, runs, rule);
  return {
    name: evalCase.name,
    line: `${evalCase.name} ${tally.passing}/${tally.counted} excluded ${tally.excluded} ${tally.result}`,
  };
}

function judgeDocument(document, rule) {
  if (document?.schemaVersion !== 1)
    throw new VerdictError(`schemaVersion ${document?.schemaVersion} is not 1`);
  if (!Array.isArray(document.cases)) throw new VerdictError("cases is missing or not an array");
  const judged = document.cases
    .map((evalCase, index) => judgeCase(evalCase, index, rule))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return judged.map(({ line }) => line);
}

function run(args) {
  const rule = parseArgs(args);
  const lines = judgeDocument(readResult(rule.path), rule);
  process.stdout.write(lines.map((line) => `${line}\n`).join(""));
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    run(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof VerdictError)) throw error;
    console.error(`eval-verdict.mjs: ${error.message}`);
    process.exit(2);
  }
}
