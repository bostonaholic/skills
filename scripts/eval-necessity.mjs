#!/usr/bin/env node
// Prints, per skill and model, whether the skill measurably changes eval results: the with-arm
// against the without-arm of `claude plugin eval` runs, pooled across result files.
//   node scripts/eval-necessity.mjs <aggregate-result.json>...
// Each file's model is its suite.modelOverride. Files of one model pool their runs per case and
// arm, so a rerun adds observations. A case's skill is the <skill> segment of its dir,
// evals/<category>/<skill>/<case>. Runs count as in scripts/eval-verdict.mjs: a run with
// skippedPaidGraders true or an error or grader explanation naming a limit is excluded, and a counted
// run passes when it ended without an error and every grader passed or was unscored.
// Case rule, with w/n with-arm and o/m without-arm passing runs:
// - gain: a one-sided Fisher exact test of with over without gives p <= 0.05. At 3 runs per arm
//   only 3/3 against 0/3 qualifies.
// - broken: no gain, and w/n is below 2/3. The with-arm fails its own case.
// - parity: n and m are both at least 9, and o/m is at least w/n minus 0.15.
// - unclear: anything else, an arm with no counted run included.
// Skill rule: NEEDED when any case is gain, else FIX-CASE when any case is broken, else NO-GAIN
// when every case is parity, else UNCLEAR.
// Output, sorted by skill, one line per skill and model in the order models first appear:
//   <skill> <model> <verdict> with <w>/<n> without <o>/<m> fired <f>/<k> cost <with> <without> <delta>
// w/n and o/m sum the skill's cases. fired counts with-arm runs of the skill's non-guard cases
// whose `fired` grader passed, out of those runs; it is - when none has that grader. cost is the
// mean costUsd per counted run that reports one, $ and four decimals, or -. delta is the relative
// change from without to with, or - when either side has no cost.
// With two or more models, one more line follows for each skill that is NO-GAIN on the last
// model: `<skill> <model> OBSOLETE needed on <models>` when another model rated it NEEDED, which
// shows its cases can detect a gain, else `<skill> <model> UNPROVEN`.
// Exit 0 once printed. Exit 2 with one stderr line and no stdout on no file, on any input
// eval-verdict.mjs rejects, a suite.ablation other than with-without, a missing
// suite.modelOverride, a case with no name or a dir not shaped evals/<category>/<skill>/<case>,
// an arm that is not an array, a costUsd that is not a non-negative number, or a counted run with
// no error and no graders list.
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

const USAGE = "usage: node scripts/eval-necessity.mjs <aggregate-result.json>...";
const ALPHA = 0.05;
const EPSILON = 1e-9;
const PARITY_MIN_RUNS = 9;
const PARITY_MARGIN = 0.15;
const BROKEN_BELOW = 2 / 3;
const CASE_DIR = /^evals\/[^/]+\/([^/]+)\/[^/]+$/;

function choose(n, k) {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= k; i += 1) result = (result * (n - k + i)) / i;
  return result;
}

// P(with-arm passes >= w) when n + m runs with w + o passes split at random into arms of n and m.
export function fisherOneSided(w, n, o, m) {
  const passes = w + o;
  const total = n + m;
  let tail = 0;
  for (let x = w; x <= Math.min(n, passes); x += 1)
    tail += choose(passes, x) * choose(total - passes, n - x);
  return tail / choose(total, n);
}

export function classifyCase({ w, n, o, m }) {
  if (n === 0 || m === 0) return "unclear";
  if (fisherOneSided(w, n, o, m) <= ALPHA + EPSILON) return "gain";
  if (w / n < BROKEN_BELOW - EPSILON) return "broken";
  if (n >= PARITY_MIN_RUNS && m >= PARITY_MIN_RUNS && o / m >= w / n - PARITY_MARGIN - EPSILON)
    return "parity";
  return "unclear";
}

export function classifySkill(caseClasses) {
  if (caseClasses.includes("gain")) return "NEEDED";
  if (caseClasses.includes("broken")) return "FIX-CASE";
  if (caseClasses.every((c) => c === "parity")) return "NO-GAIN";
  return "UNCLEAR";
}

function armRuns(evalCase, arm, where) {
  const runs = evalCase.arms?.[arm] ?? [];
  if (!Array.isArray(runs)) throw new VerdictError(`${where}: arms.${arm} is not an array`);
  runs.forEach((run, index) => {
    const runWhere = `${where}: arms.${arm}[${index}]`;
    checkRun(run, runWhere);
    const cost = run.costUsd;
    if (cost !== undefined && cost !== null && !(Number.isFinite(cost) && cost >= 0))
      throw new VerdictError(`${runWhere}: costUsd is not a non-negative number`);
    if (!isExcluded(run) && endedClean(run) && !(Array.isArray(run.graders) && run.graders.length))
      throw new VerdictError(`${runWhere}: a run with no error has no graders list`);
  });
  return runs.filter((run) => !isExcluded(run));
}

// Returns { model, cases: [{ name, skill, with, without }] } with only counted runs.
export function readDocument(document, path) {
  if (document?.schemaVersion !== 1)
    throw new VerdictError(`${path}: schemaVersion ${document?.schemaVersion} is not 1`);
  if (document.suite?.ablation !== "with-without")
    throw new VerdictError(
      `${path}: suite.ablation is ${document.suite?.ablation}, not with-without`,
    );
  const model = document.suite.modelOverride;
  if (typeof model !== "string" || model === "")
    throw new VerdictError(`${path}: suite.modelOverride is missing`);
  if (!Array.isArray(document.cases))
    throw new VerdictError(`${path}: cases is missing or not an array`);
  const cases = document.cases.map((evalCase, index) => {
    if (!isObject(evalCase) || typeof evalCase.name !== "string")
      throw new VerdictError(`${path}: cases[${index}] is not an object with a name`);
    const where = `${path}: case ${evalCase.name}`;
    if (evalCase.arms !== undefined && evalCase.arms !== null && !isObject(evalCase.arms))
      throw new VerdictError(`${where}: arms is not an object`);
    const skill = CASE_DIR.exec(evalCase.dir ?? "")?.[1];
    if (!skill) throw new VerdictError(`${where}: dir is not evals/<category>/<skill>/<case>`);
    return {
      name: evalCase.name,
      skill,
      with: armRuns(evalCase, "with", where),
      without: armRuns(evalCase, "without", where),
    };
  });
  return { model, cases };
}

// Pools documents into Map<model, Map<case name, { skill, with, without }>>, models in first-seen order.
export function pool(documents) {
  const models = new Map();
  for (const { model, cases } of documents) {
    if (!models.has(model)) models.set(model, new Map());
    const byCase = models.get(model);
    for (const evalCase of cases) {
      const entry = byCase.get(evalCase.name) ?? { skill: evalCase.skill, with: [], without: [] };
      entry.with.push(...evalCase.with);
      entry.without.push(...evalCase.without);
      byCase.set(evalCase.name, entry);
    }
  }
  return models;
}

function firedPassed(run) {
  return run.graders?.find((grader) => grader.name === "fired")?.passed === true;
}

function hasFired(run) {
  return run.graders?.some((grader) => grader.name === "fired") ?? false;
}

function meanCost(runs) {
  const costed = runs.filter((run) => typeof run.costUsd === "number");
  return costed.length === 0 ? null : costed.reduce((sum, r) => sum + r.costUsd, 0) / costed.length;
}

function money(value) {
  return value === null ? "-" : `$${value.toFixed(4)}`;
}

function costDelta(withCost, withoutCost) {
  if (withCost === null || withoutCost === null || withoutCost === 0) return "-";
  const percent = Math.round(((withCost - withoutCost) / withoutCost) * 1000) / 10;
  return `${percent > 0 ? "+" : ""}${percent}%`;
}

// Returns [{ skill, verdict, line }] for one model, sorted by skill.
export function judgeModel(model, byCase) {
  const bySkill = new Map();
  for (const [name, entry] of byCase) {
    const cases = bySkill.get(entry.skill) ?? [];
    cases.push({ name, ...entry });
    bySkill.set(entry.skill, cases);
  }
  return [...bySkill.keys()].sort().map((skill) => {
    const cases = bySkill.get(skill);
    const classes = cases.map((c) =>
      classifyCase({
        w: c.with.filter(runPasses).length,
        n: c.with.length,
        o: c.without.filter(runPasses).length,
        m: c.without.length,
      }),
    );
    const verdict = classifySkill(classes);
    const withRuns = cases.flatMap((c) => c.with);
    const withoutRuns = cases.flatMap((c) => c.without);
    const firedRuns = cases
      .filter((c) => !c.name.endsWith("-guard"))
      .flatMap((c) => c.with)
      .filter(hasFired);
    const fired =
      firedRuns.length === 0 ? "-" : `${firedRuns.filter(firedPassed).length}/${firedRuns.length}`;
    const withCost = meanCost(withRuns);
    const withoutCost = meanCost(withoutRuns);
    const line = [
      skill,
      model,
      verdict,
      `with ${withRuns.filter(runPasses).length}/${withRuns.length}`,
      `without ${withoutRuns.filter(runPasses).length}/${withoutRuns.length}`,
      `fired ${fired}`,
      `cost ${money(withCost)} ${money(withoutCost)} ${costDelta(withCost, withoutCost)}`,
    ].join(" ");
    return { skill, verdict, line };
  });
}

// Lines for each skill NO-GAIN on the last model: OBSOLETE when another model rated it NEEDED.
export function crossModel(judged) {
  const models = [...judged.keys()];
  if (models.length < 2) return [];
  const target = models.at(-1);
  return judged
    .get(target)
    .filter((entry) => entry.verdict === "NO-GAIN")
    .map(({ skill }) => {
      const neededOn = models.filter(
        (model) =>
          model !== target &&
          judged.get(model).some((e) => e.skill === skill && e.verdict === "NEEDED"),
      );
      return neededOn.length > 0
        ? `${skill} ${target} OBSOLETE needed on ${neededOn.join(",")}`
        : `${skill} ${target} UNPROVEN`;
    });
}

export function report(documents) {
  const judged = new Map(
    [...pool(documents)].map(([model, byCase]) => [model, judgeModel(model, byCase)]),
  );
  const lines = [...judged.values()]
    .flat()
    .sort((a, b) => (a.skill < b.skill ? -1 : a.skill > b.skill ? 1 : 0))
    .map((entry) => entry.line);
  return [...lines, ...crossModel(judged)];
}

function run(paths) {
  if (paths.length === 0 || paths.some((path) => path.startsWith("-")))
    throw new VerdictError(USAGE);
  const documents = paths.map((path) => readDocument(readResult(path), path));
  process.stdout.write(
    report(documents)
      .map((line) => `${line}\n`)
      .join(""),
  );
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    run(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof VerdictError)) throw error;
    console.error(`eval-necessity.mjs: ${error.message}`);
    process.exit(2);
  }
}
