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
const PASSING_RUNS_NEEDED = new Map([
  ["1", 1],
  ["3", 2],
]);
const LIMIT_ERROR = /(usage|rate)[ -]limit/i;

// Input the script cannot judge. The CLI reports its message and exits 2.
class VerdictError extends Error {}

function parseArgs(args) {
  if (args[0] === "--runs" && args.length >= 2 && !PASSING_RUNS_NEEDED.has(args[1]))
    throw new VerdictError(`--runs must be 1 or 3, got ${args[1]}`);
  if (args.length !== 3 || args[0] !== "--runs" || !PASSING_RUNS_NEEDED.has(args[1]))
    throw new VerdictError(USAGE);
  return { runs: Number(args[1]), passingNeeded: PASSING_RUNS_NEEDED.get(args[1]), path: args[2] };
}

function readResult(path) {
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

// Returns the case's with-arm runs, validating each run's shape.
function withArmRuns(evalCase, index) {
  if (!isObject(evalCase)) throw new VerdictError(`cases[${index}] is not an object`);
  const where = `case ${evalCase.name}`;
  const { arms } = evalCase;
  if (arms !== undefined && arms !== null && !isObject(arms))
    throw new VerdictError(`${where}: arms is not an object`);
  const withRuns = arms?.with ?? [];
  if (!Array.isArray(withRuns)) throw new VerdictError(`${where}: arms.with is not an array`);
  withRuns.forEach((run, runIndex) => checkRun(run, `${where}: arms.with[${runIndex}]`));
  return withRuns;
}

function isExcluded(run) {
  return run.skippedPaidGraders === true || LIMIT_ERROR.test(run.error ?? "");
}

function endedClean(run) {
  return run.error === null || run.error === undefined;
}

function runPasses(run) {
  return (
    endedClean(run) &&
    run.graders.every((grader) => grader.scored === false || grader.passed === true)
  );
}

function judgeCase(evalCase, index, { runs, passingNeeded }) {
  const withRuns = withArmRuns(evalCase, index);
  if (withRuns.length > runs)
    throw new VerdictError(
      `case ${evalCase.name}: ${withRuns.length} with-arm runs exceed --runs ${runs}`,
    );
  const counted = withRuns.filter((run) => !isExcluded(run));
  if (
    counted.some(
      (run) => endedClean(run) && !(Array.isArray(run.graders) && run.graders.length > 0),
    )
  ) {
    throw new VerdictError(`case ${evalCase.name}: a run with no error has no graders list`);
  }
  const passing = counted.filter(runPasses).length;
  const result = counted.length < runs ? "incomplete" : passing >= passingNeeded ? "pass" : "fail";
  return {
    name: evalCase.name,
    line: `${evalCase.name} ${passing}/${counted.length} excluded ${withRuns.length - counted.length} ${result}`,
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
