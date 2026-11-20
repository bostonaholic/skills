#!/usr/bin/env node
// Maps the paths a change touches to the eval cases CI runs for it.
//   git diff --name-only <base>...HEAD | node scripts/select-evals.mjs
// Prints one case name per line, sorted, and nothing when no case applies. Exit 0, or 2 with one
// stderr line on an argument. The rules, in selectEvalCases:
// - skills/<category>/<skill>/** and evals/<category>/<skill>/** select that skill's routing
//   cases: <skill>-trigger and every <skill>-guard case, including <skill>-guard-<sibling> and
//   their calibration cases. A changed case directory also selects that case.
// - A file every skill depends on (SHARED) selects every skill's routing cases.
// - Any other path selects nothing.
import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { discoverCases } from "./eval.mjs";

// Paths whose change can move any skill's routing or grading.
const SHARED =
  /^(?:shared\/|agents\/|\.claude-plugin\/|\.cursor-plugin\/|scripts\/eval[^/]*\.mjs$|scripts\/select-evals\.mjs$|\.github\/workflows\/evals\.yml$)/;
const SKILL_PATH = /^(?:skills|evals)\/(?:engineering|productivity)\/([^/]+)\//;
const CASE_PATH = /^evals\/(?:engineering|productivity)\/[^/]+\/([^/]+)\//;

function routingCase(name, skill) {
  return name === `${skill}-trigger` || name.startsWith(`${skill}-guard`);
}

// paths: changed repository paths. cases: { name, skill } for every case. Returns case names.
export function selectEvalCases(paths, cases) {
  const skills = new Set();
  const named = new Set();
  let all = false;
  for (const path of paths) {
    if (SHARED.test(path)) all = true;
    const skill = path.match(SKILL_PATH)?.[1];
    if (skill) skills.add(skill);
    const evalCase = path.match(CASE_PATH)?.[1];
    if (evalCase) named.add(evalCase);
  }
  return cases
    .filter(
      ({ name, skill }) =>
        named.has(name) || ((all || skills.has(skill)) && routingCase(name, skill)),
    )
    .map(({ name }) => name)
    .sort();
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  if (process.argv.length > 2) {
    console.error(
      "select-evals.mjs: usage: git diff --name-only <base>...HEAD | node scripts/select-evals.mjs",
    );
    process.exit(2);
  }
  const paths = readFileSync(0, "utf8").split("\n").filter(Boolean);
  for (const name of selectEvalCases(paths, discoverCases("evals"))) console.log(name);
}
