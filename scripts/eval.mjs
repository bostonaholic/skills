#!/usr/bin/env node
// Runs the eval suite with the flags docs/skill-authoring.md#running-the-evals requires.
//   npm run eval -- [<skill>|<case>] [options] [-- <claude flags>]
// Every default is in DEFAULTS and has a flag that overrides it; see USAGE.
// With no target it runs the whole suite at --runs 1; with a skill or case name it runs those
// cases at --runs 3. Each tag runs as its own command, readonly then bash, so only bash cases get
// the Edit and git grants. A tag with no selected case is skipped. Each command writes to
// evals/results/<timestamp>-<model>-<tag>/, and scripts/eval-verdict.mjs then prints one line per
// case; a selected case with no line prints as incomplete. scripts/eval-baseline.mjs then compares
// each result with evals/baselines/<model>.json, or with --record-baseline writes it.
// --check runs the free load check ($0 cap) and compiles every grader regex. It starts no run.
// --dry-run prints the commands and runs nothing. Arguments after -- go to every claude command.
// Exit 0 when every case passes (or the check is clean), 1 on any failing or incomplete case, a
// case that regressed from its baseline, a load error, or a bad regex, and 2 on a bad argument.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const USAGE = `usage: npm run eval -- [<skill>|<case>] [options] [-- <claude flags>]
  --model <m>          model under test (default sonnet)
  --runs 1|3           runs per case (default 1 for the suite, 3 for a skill or case)
  --max-cost-usd <usd> cap per command (default from the model, tag, and scope)
  -j, --jobs <n>       concurrent runs, 1 to 8 (default 4)
  --judge-model <m>    llm grader model (default haiku)
  --tag readonly|bash  run one tag only (default both)
  --threshold <0..1>   claude's exit threshold (default 0)
  --no-scaffold        skip each case's scaffold.sh (default runs it)
  --no-keep-temp       delete run directories and traces (default keeps them)
  --publish            publish the HTML report to claude.ai (default local only)
  --record-baseline    write results into evals/baselines/<model>.json (needs --runs 3)
  --check              free load check and grader regex compile; starts no run
  --dry-run            print the claude commands and run nothing`;
const EVALS_DIR = "evals";
const TAGS = ["readonly", "bash"];
const DEFAULTS = {
  model: "sonnet",
  jobs: 4,
  judgeModel: "haiku",
  tags: TAGS,
  threshold: 0,
  scaffold: true,
  keepTemp: true,
  publish: false,
  recordBaseline: false,
  check: false,
  dryRun: false,
  passthrough: [],
};
const BASH_GRANTS = ["--allow-tools", "Edit", "Bash(git status:*)", "Bash(git diff:*)"];
// Per-command caps in USD, from docs/skill-authoring.md: recorded runs for the whole suite,
// before-and-after caps for one skill or case.
const SUITE_CAPS = {
  readonly: { haiku: 25, sonnet: 85, opus: 100 },
  bash: { haiku: 5, sonnet: 10, opus: 20 },
};
const SCOPED_CAPS = { haiku: 5, sonnet: 10, opus: 30 };

class UsageError extends Error {}

export function parseArgs(args) {
  const options = { ...DEFAULTS };
  const rest = [...args];
  const value = (flag) => {
    if (rest.length === 0) throw new UsageError(`${flag} needs a value`);
    return rest.shift();
  };
  while (rest.length > 0) {
    const arg = rest.shift();
    if (arg === "--") options.passthrough = rest.splice(0);
    else if (arg === "--model") options.model = value(arg);
    else if (arg === "--runs") options.runs = Number(value(arg));
    else if (arg === "--max-cost-usd") options.cap = Number(value(arg));
    else if (arg === "-j" || arg === "--jobs") options.jobs = Number(value(arg));
    else if (arg === "--judge-model") options.judgeModel = value(arg);
    else if (arg === "--tag") options.tags = [value(arg)];
    else if (arg === "--threshold") options.threshold = Number(value(arg));
    else if (arg === "--no-scaffold") options.scaffold = false;
    else if (arg === "--no-keep-temp") options.keepTemp = false;
    else if (arg === "--publish") options.publish = true;
    else if (arg === "--record-baseline") options.recordBaseline = true;
    else if (arg === "--check") options.check = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "-h" || arg === "--help") return { help: true };
    else if (arg.startsWith("-")) throw new UsageError(`unknown flag ${arg}\n${USAGE}`);
    else if (options.target !== undefined) throw new UsageError(`one target only\n${USAGE}`);
    else options.target = arg;
  }
  options.runs ??= options.target === undefined ? 1 : 3;
  if (![1, 3].includes(options.runs)) throw new UsageError("--runs must be 1 or 3");
  if (options.recordBaseline && options.runs !== 3)
    throw new UsageError("--record-baseline needs --runs 3");
  if (!Number.isInteger(options.jobs) || options.jobs < 1 || options.jobs > 8)
    throw new UsageError("-j must be an integer from 1 to 8");
  if (!options.tags.every((tag) => TAGS.includes(tag)))
    throw new UsageError(`--tag must be one of ${TAGS.join(", ")}`);
  if (!(options.threshold >= 0 && options.threshold <= 1))
    throw new UsageError("--threshold must be a number from 0 to 1");
  if (options.cap !== undefined && !(options.cap >= 0))
    throw new UsageError("--max-cost-usd must be a number >= 0");
  if (options.cap === undefined && !(options.model in SCOPED_CAPS))
    throw new UsageError(`no default cap for model ${options.model}; pass --max-cost-usd`);
  return options;
}

// Lists every case as { name, skill, dir, tags } from evals/<category>/<skill>/<case>/prompt.md.
export function discoverCases(root) {
  const cases = [];
  for (const category of subdirs(root)) {
    for (const skill of subdirs(join(root, category))) {
      for (const name of subdirs(join(root, category, skill))) {
        const dir = join(root, category, skill, name);
        const promptPath = join(dir, "prompt.md");
        if (!existsSync(promptPath)) continue;
        const tags = readFileSync(promptPath, "utf8").match(/^tags:\s*\[([^\]]*)\]/m);
        cases.push({ name, skill, dir, tags: tags ? tags[1].split(",").map((t) => t.trim()) : [] });
      }
    }
  }
  return cases;
}

function subdirs(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "results")
    .map((entry) => entry.name)
    .sort();
}

// Resolves the target to the selected cases and the --case glob that selects them.
export function selectCases(cases, target) {
  if (target === undefined) return { selected: cases, caseGlob: undefined };
  const byCase = cases.filter((c) => c.name === target);
  if (byCase.length > 0) return { selected: byCase, caseGlob: target };
  const bySkill = cases.filter((c) => c.skill === target);
  if (bySkill.length > 0) return { selected: bySkill, caseGlob: `${target}-*` };
  throw new UsageError(`no skill or case named ${target} under ${EVALS_DIR}/`);
}

// Returns one { tag, cases, outputDir, args } per tag that has a selected case.
export function planCommands(options, selected, caseGlob, stamp) {
  return options.tags.flatMap((tag) => {
    const cases = selected.filter((c) => c.tags.includes(tag)).map((c) => c.name);
    if (cases.length === 0) return [];
    const caseArgs = caseGlob === undefined ? [] : ["--case", caseGlob];
    if (options.check) {
      const args = ["plugin", "eval", ".", "--tag", tag, ...caseArgs, "--runs", "1"];
      args.push("--max-cost-usd", "0", "--no-publish", ...options.passthrough);
      return [{ tag, cases, args }];
    }
    const cap =
      options.cap ??
      (caseGlob === undefined ? SUITE_CAPS[tag][options.model] : SCOPED_CAPS[options.model]);
    const outputDir = join(EVALS_DIR, "results", `${stamp}-${options.model}-${tag}`);
    const args = ["plugin", "eval", ".", "--tag", tag, ...caseArgs];
    args.push("--runs", String(options.runs), "--threshold", String(options.threshold));
    args.push("--model", options.model, "--judge-model", options.judgeModel);
    args.push("-j", String(options.jobs));
    if (options.scaffold) args.push("--scaffold");
    if (options.keepTemp) args.push("--keep-temp");
    if (tag === "bash") args.push(...BASH_GRANTS);
    args.push("--max-cost-usd", String(cap));
    if (!options.publish) args.push("--no-publish");
    args.push("--output-dir", outputDir);
    args.push(...options.passthrough);
    return [{ tag, cases, outputDir, args }];
  });
}

// Returns "<file>: <field>: <error>" for each grader pattern or input_match that does not compile.
export function badGraderRegexes(caseDirs) {
  const problems = [];
  for (const dir of caseDirs) {
    const gradersDir = join(dir, "graders");
    if (!existsSync(gradersDir)) continue;
    for (const file of readdirSync(gradersDir).filter((f) => f.endsWith(".md"))) {
      const path = join(gradersDir, file);
      const text = readFileSync(path, "utf8");
      for (const [, field, raw] of text.matchAll(/^\s*(pattern|input_match):\s*(.+)$/gm)) {
        try {
          new RegExp(unquoteYaml(raw.trim()));
        } catch (error) {
          problems.push(`${path}: ${field}: ${error.message}`);
        }
      }
    }
  }
  return problems;
}

function unquoteYaml(raw) {
  if (raw.startsWith("'") && raw.endsWith("'")) return raw.slice(1, -1).replaceAll("''", "'");
  if (raw.startsWith('"') && raw.endsWith('"')) return JSON.parse(raw);
  return raw;
}

// Adds an incomplete line for each selected case the verdict script printed no line for.
export function withMissingCases(verdictLines, cases) {
  const seen = new Set(verdictLines.map((line) => line.split(" ")[0]));
  const missing = cases.filter((name) => !seen.has(name)).map((name) => `${name} - incomplete`);
  return [...verdictLines, ...missing].sort();
}

function shellQuote(arg) {
  return /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", "'\\''")}'`;
}

function runCheck(commands, selected) {
  let ok = true;
  for (const { tag, args } of commands) {
    console.log(`\n== load check: ${tag}`);
    const run = spawnSync("claude", args, { encoding: "utf8" });
    process.stdout.write(run.stdout ?? "");
    process.stderr.write(run.stderr ?? "");
    // At a $0 cap the CLI exits 2 (cap hit) on success; exit 1 is a load error.
    const failed = run.status === 1 || /failed to load/.test(`${run.stdout}${run.stderr}`);
    console.log(`== ${tag}: ${failed ? "FAILED" : "ok"}`);
    if (failed) ok = false;
  }
  const problems = badGraderRegexes(selected.map((c) => c.dir));
  for (const problem of problems) console.error(`bad regex: ${problem}`);
  console.log(`== grader regexes: ${problems.length === 0 ? "ok" : `${problems.length} bad`}`);
  return ok && problems.length === 0;
}

export function baselinePath(model) {
  return join(EVALS_DIR, "baselines", `${model}.json`);
}

// Compares one result with the model's baseline, or records it there. Returns false on a regression
// or a baseline error.
function runBaseline(resultPath, { runs, model, recordBaseline }) {
  const path = baselinePath(model);
  if (!recordBaseline && !existsSync(path)) {
    console.log(`== no baseline at ${path}; --record-baseline writes one`);
    return true;
  }
  const mode = recordBaseline ? "record" : "compare";
  console.log(`\n== baseline ${mode} (${path}):`);
  const baseline = spawnSync(
    process.execPath,
    ["scripts/eval-baseline.mjs", mode, "--runs", String(runs), path, resultPath],
    { stdio: "inherit" },
  );
  return baseline.status === 0;
}

function runEvals(commands, options) {
  const { runs } = options;
  let ok = true;
  for (const { tag, cases, outputDir, args } of commands) {
    console.log(`\n== ${tag}: ${cases.length} case(s) -> ${outputDir}`);
    const run = spawnSync("claude", args, { stdio: "inherit" });
    if (run.error) throw run.error;
    // With --threshold 0, exit 1 is a load, filter, start, or trust error; 2 is a cap hit.
    if (run.status === 1) {
      console.error(`== ${tag}: claude plugin eval exited 1 (load, filter, start, or trust error)`);
      ok = false;
      continue;
    }
    const resultPath = join(outputDir, "aggregate-result.json");
    const verdict = spawnSync(
      process.execPath,
      ["scripts/eval-verdict.mjs", "--runs", String(runs), resultPath],
      { encoding: "utf8" },
    );
    if (verdict.status !== 0) {
      console.error(verdict.stderr.trim());
      ok = false;
      continue;
    }
    const lines = withMissingCases(verdict.stdout.split("\n").filter(Boolean), cases);
    console.log(`\n== ${tag} verdicts (--runs ${runs}):`);
    for (const line of lines) console.log(line);
    if (lines.some((line) => !line.endsWith(" pass"))) ok = false;
    if (!runBaseline(resultPath, options)) ok = false;
  }
  return ok;
}

function main(args) {
  const options = parseArgs(args);
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  const { selected, caseGlob } = selectCases(discoverCases(EVALS_DIR), options.target);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const commands = planCommands(options, selected, caseGlob, stamp);
  if (options.dryRun) {
    for (const { args: commandArgs } of commands)
      console.log(["claude", ...commandArgs].map(shellQuote).join(" "));
    return 0;
  }
  const ok = options.check ? runCheck(commands, selected) : runEvals(commands, options);
  return ok ? 0 : 1;
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`eval.mjs: ${error.message}`);
    process.exitCode = 2;
  }
}
