#!/usr/bin/env node
// Fails a change that edits a skill's runtime files without recording its new eval scores.
//   node scripts/check-eval-baselines.mjs <base-ref>
// A skill's runtime files are its SKILL.md, references/, scripts/, and shared/ under
// skills/<category>/<skill>/. For each skill with a changed runtime file that still exists at HEAD,
// every case in evals/<category>/<skill>/ needs an entry in evals/baselines/<model>.json for each
// model in MODELS, with a recordedAt that differs from the entry at <base-ref>.
// Prints one line per missing score. Exit 0 when none is missing, 1 when any is, 2 on a bad
// argument or a git error.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { discoverCases } from "./eval.mjs";

export const MODELS = ["haiku", "sonnet", "opus"];
const RUNTIME_PATH =
  /^skills\/(engineering|productivity)\/([^/]+)\/(SKILL\.md$|references\/|scripts\/|shared\/)/;

// Returns the sorted names of skills whose runtime files appear in `changedFiles`.
export function changedSkills(changedFiles) {
  const skills = new Set();
  for (const file of changedFiles) {
    const match = file.match(RUNTIME_PATH);
    if (match) skills.add(match[2]);
  }
  return [...skills].sort();
}

// Returns one problem line per case of each skill lacking a newly recorded score on a model.
// `baselines` maps each model to { head, base }, each a parsed baseline file or null.
export function missingScores(skills, cases, baselines) {
  const problems = [];
  for (const skill of skills) {
    const skillCases = cases.filter((c) => c.skill === skill).map((c) => c.name);
    if (skillCases.length === 0) problems.push(`${skill}: no eval cases in evals/`);
    for (const model of MODELS) {
      const { head, base } = baselines[model];
      for (const name of skillCases) {
        const now = head?.cases?.[name];
        const was = base?.cases?.[name];
        if (now === undefined) problems.push(`${name}: no ${model} score in evals/baselines/`);
        else if (was !== undefined && now.recordedAt === was.recordedAt)
          problems.push(`${name}: ${model} score not re-recorded`);
      }
    }
  }
  return problems;
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function baseBaseline(baseRef, path) {
  try {
    return JSON.parse(git(["show", `${baseRef}:${path}`]));
  } catch {
    return null;
  }
}

function main(args) {
  if (args.length !== 1) {
    console.error("usage: node scripts/check-eval-baselines.mjs <base-ref>");
    return 2;
  }
  const [baseRef] = args;
  let changedFiles;
  try {
    changedFiles = git(["diff", "--name-only", `${baseRef}...HEAD`])
      .split("\n")
      .filter(Boolean);
  } catch (error) {
    console.error(
      `check-eval-baselines.mjs: git diff failed: ${error.stderr ?? error.message}`.trim(),
    );
    return 2;
  }
  const skills = changedSkills(changedFiles).filter((skill) =>
    ["engineering", "productivity"].some((category) => existsSync(join("skills", category, skill))),
  );
  const baselines = {};
  for (const model of MODELS) {
    const path = join("evals", "baselines", `${model}.json`);
    baselines[model] = {
      head: existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null,
      base: baseBaseline(baseRef, path),
    };
  }
  const problems = missingScores(skills, discoverCases("evals"), baselines);
  for (const problem of problems) console.log(problem);
  if (problems.length > 0) {
    console.log(
      "Record each model's scores with npm run eval -- <skill> --model <model> --record-baseline; see docs/skill-authoring.md#baselines.",
    );
  }
  return problems.length === 0 ? 0 : 1;
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
