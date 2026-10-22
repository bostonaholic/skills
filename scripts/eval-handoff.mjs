#!/usr/bin/env node
// Runs the handoff eval for making-code-agent-friendly, as docs/skill-authoring.md#handoff-eval
// describes. It measures whether a refactor made with the skill is cheaper for a later,
// skill-free agent to change than a refactor made without it.
//   npm run eval:handoff -- [--model <m>] [--runs <1-5>] [--max-cost-usd <usd>] [--dry-run]
// For each run index it does one with-arm arm-run, then one without-arm arm-run. An arm-run is a
// stage-1 refactor of the fixture, two stage-2 follow-on tasks on its result, and a merge of the
// two tasks. Only the with-arm stage-1 run loads a one-skill plugin and its slash command.
// Every workspace and test directory is filled from a commit in a scratch git directory, and
// every test step runs the workspace suite and the fixture's hidden tests under the Node
// permission model. Each claude run gets an equal share of the cap: cap / (6 x --runs), and a
// 900-second timeout that ends it with SIGTERM. Each test run gets 120 seconds, then SIGKILL.
// A test run passes only when Node's TAP report shows every hidden file ran and passed.
// Counts and fills read only the committed tree. A committed symlink or other non-file entry
// makes its stage error, and a git merge-tree failure makes the merge error; the command goes on.
// Every claude run gets the isolation flags, and its init event must show only the planned
// plugins and skills.
// Stop rules, first match wins: isolation (an init event fails that check), budget (a run
// spent above its share), no cost (a run reported no usable cost), first run (the command's
// first claude run failed; it wins when that run failed before its init event). A stop starts
// no more claude runs, marks the rest of its arm-run skipped, and prints the rule and both
// summaries.
// Prints one line per arm-run and one summary line per arm, and writes
// evals/results/<stamp>-<model>-handoff/handoff-result.json after each arm-run.
// Preflight needs claude, git 2.38 or later, and Node 22.14 or later, and runs before the
// scaffold, so a broken setup spends nothing. --dry-run validates the arguments, the repository
// root, and the fixture, prints each claude command, and creates and spawns nothing.
// Exit 0 when every arm-run is complete, 1 when any is not, on a stop rule, or on a preflight or
// scaffold failure, and 2 on a bad argument, an incomplete fixture, or a run outside the
// repository root.
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const USAGE = `usage: npm run eval:handoff -- [options]
  --model <m>          model for every claude run (default sonnet)
  --runs <1-5>         arm-runs per arm (default 3)
  --max-cost-usd <usd> command cap, split equally over 6 x --runs claude runs
                       (default haiku $1, sonnet $2, opus $5 per claude run)
  --dry-run            print the claude commands and run nothing
  -h, --help           print this usage`;
const DEFAULTS = { model: "sonnet", runs: 3, dryRun: false };
const MAX_RUNS = 5;
// Provisional per-claude-run amounts in USD; the default cap is this times the planned runs.
const PER_RUN_USD = { haiku: 1, sonnet: 2, opus: 5 };
const ARMS = ["with", "without"];
// Absorbs float error such as 0.29 * 100 = 28.999999999999996 before the cent floor.
const CENT_EPSILON = 1e-9;
const ISOLATION_FLAGS = [
  "--restricted",
  "--strict-mcp-config",
  "--permission-mode",
  "dontAsk",
  "--no-session-persistence",
];
const TOOLS = "Read,Grep,Glob,Edit,Write,Skill,Bash";
const ALLOWED_TOOLS = "Read,Grep,Glob,Edit,Write,Skill,Bash(npm test:*)";
// failIfUnavailable makes claude exit at startup when the sandbox cannot start, instead of running
// Bash unconfined. allowUnsandboxedCommands false drops the unsandboxed retry, which the
// Bash(npm test:*) rule would otherwise approve.
const SANDBOX_SETTINGS =
  '{"sandbox":{"enabled":true,"failIfUnavailable":true,"allowUnsandboxedCommands":false}}';
const SKILL_NAME = "making-code-agent-friendly";
const FIXTURE_DIR = "evals/engineering/making-code-agent-friendly/handoff";
const SKILL_DIR = "skills/engineering/making-code-agent-friendly";
const RESULTS_ROOT = "evals/results";
const RESULTS_FILE = "handoff-result.json";
const HIDDEN_DIR = "eval-hidden";
const HIDDEN_SUFFIX = ".test.mjs";
const FIXTURE_FILES = [
  "scaffold.sh",
  "refactor.md",
  `accept/baseline${HIDDEN_SUFFIX}`,
  `accept/stage1${HIDDEN_SUFFIX}`,
];
// The merge metric compares exactly two parallel changes.
const TASK_COUNT = 2;
// One stage-1 refactor and one run per follow-on task.
const CLAUDE_RUNS_PER_ARM_RUN = 1 + TASK_COUNT;
const GIT_MIN_VERSION = [2, 38];
const NODE_MIN_VERSION = [22, 14];
const EXECUTABLE_MODE = "100755";
const FILE_MODES = new Set(["100644", EXECUTABLE_MODE]);
const SYMLINK_MODE = "120000";
const OBJECT_ID = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const SCRATCH_DATE = "2026-01-01T00:00:00Z";
// git output and blobs can pass spawnSync's 1 MiB default buffer.
const GIT_MAX_BUFFER = 256 * 1024 * 1024;
const BUDGET_SUBTYPE = "error_max_budget_usd";
const LIMIT_PATTERN = /(usage|rate)[ -]limit/i;
const EXIT_OUTRANKED_BY = new Set(["bad output", "budget", "limit"]);
const CLAUDE_TIMEOUT_SECONDS = 900;
const TEST_TIMEOUT_SECONDS = 120;
const PLUGIN_DESCRIPTION = "One-skill plugin built by scripts/eval-handoff.mjs.";

class UsageError extends Error {}

// A committed tree entry that a fill cannot write as a regular file. Its reason becomes the
// stage status, such as "error: symlink".
class FillError extends Error {
  constructor(reason, path) {
    super(`${reason} at ${path}`);
    this.reason = reason;
  }
}

export function parseArgs(args) {
  const options = { ...DEFAULTS };
  const rest = [...args];
  let capUsd;
  const value = (flag) => {
    if (rest.length === 0) throw new UsageError(`${flag} needs a value`);
    return rest.shift();
  };
  while (rest.length > 0) {
    const arg = rest.shift();
    if (arg === "--model") options.model = value(arg);
    else if (arg === "--runs") options.runs = Number(value(arg));
    else if (arg === "--max-cost-usd") capUsd = Number(value(arg));
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "-h" || arg === "--help") return { help: true };
    else throw new UsageError(`unknown argument ${arg}; see --help`);
  }
  if (!Number.isInteger(options.runs) || options.runs < 1 || options.runs > MAX_RUNS)
    throw new UsageError(`--runs must be an integer from 1 to ${MAX_RUNS}`);
  const plannedRuns = plannedClaudeRuns(options.runs);
  if (capUsd === undefined) {
    if (!(options.model in PER_RUN_USD))
      throw new UsageError(`no default cap for model ${options.model}; pass --max-cost-usd`);
    capUsd = PER_RUN_USD[options.model] * plannedRuns;
  } else if (!(Number.isFinite(capUsd) && capUsd > 0)) {
    throw new UsageError("--max-cost-usd must be a number above 0");
  }
  const runBudgetUsd = Math.floor((capUsd / plannedRuns) * 100 + CENT_EPSILON) / 100;
  if (runBudgetUsd < 0.01)
    throw new UsageError(
      `--max-cost-usd ${capUsd} gives under $0.01 per claude run over ${plannedRuns} runs`,
    );
  return { model: options.model, runs: options.runs, capUsd, runBudgetUsd, dryRun: options.dryRun };
}

function plannedClaudeRuns(runs) {
  return ARMS.length * CLAUDE_RUNS_PER_ARM_RUN * runs;
}

// Alternates the arms within each run index, so a stop leaves them at most one arm-run apart.
export function planRuns(runs) {
  const plan = [];
  for (let index = 1; index <= runs; index++) for (const arm of ARMS) plan.push({ arm, index });
  return plan;
}

function loadsSkill(arm, stage) {
  return arm === "with" && stage === "stage1";
}

// Every run gets the same isolation flags, so no installed plugin, MCP server, user CLAUDE.md,
// hook, or saved session reaches it. Only the with-arm stage-1 run adds the skill plugin.
export function claudeArgs({ arm, stage, model, budgetUsd, pluginDir }) {
  const args = ["-p", ...ISOLATION_FLAGS, "--output-format", "stream-json", "--verbose"];
  args.push("--model", model, "--max-budget-usd", String(budgetUsd));
  args.push("--tools", TOOLS, "--allowed-tools", ALLOWED_TOOLS, "--settings", SANDBOX_SETTINGS);
  if (loadsSkill(arm, stage))
    args.push("--plugin-dir", pluginDir, "--add-dir", join(pluginDir, "skills", SKILL_NAME));
  return args;
}

// Reads a stream-json transcript. Tokens sum the four usage fields over every model in the
// result event's modelUsage, which also covers a run that a budget stop ended. Cost is null
// unless the result event reports a finite total_cost_usd of 0 or more, so the spent total
// never adds a missing or invalid value.
export function readStreamResult(text) {
  let init = null;
  let result = null;
  let badOutput = false;
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      badOutput = true;
      continue;
    }
    if (event.type === "system" && event.subtype === "init") init = event;
    else if (event.type === "result") result = event;
  }
  const cost = result?.total_cost_usd;
  return {
    init,
    tokens: result === null ? null : sumTokens(result.modelUsage),
    costUsd: typeof cost === "number" && Number.isFinite(cost) && cost >= 0 ? cost : null,
    errorReason: streamErrorReason(result, badOutput),
  };
}

function sumTokens(modelUsage) {
  return Object.values(modelUsage ?? {}).reduce(
    (sum, usage) =>
      sum +
      usage.inputTokens +
      usage.outputTokens +
      usage.cacheReadInputTokens +
      usage.cacheCreationInputTokens,
    0,
  );
}

function streamErrorReason(result, badOutput) {
  if (badOutput) return "bad output";
  if (result === null) return "no result";
  if (result.subtype === BUDGET_SUBTYPE) return "budget";
  if (result.is_error !== true) return null;
  if (LIMIT_PATTERN.test(String(result.result ?? ""))) return "limit";
  return result.subtype ?? "is_error";
}

// The stage's error reason, or null. Precedence, highest first: timeout, bad output, budget,
// limit, a non-zero exit, the result subtype, and no result. A named stream reason says more
// than the exit code that follows it.
function runErrorReason({ timedOut, status, signal, stream }) {
  if (timedOut) return "timeout";
  if (EXIT_OUTRANKED_BY.has(stream.errorReason)) return stream.errorReason;
  if (status !== 0) return `exit ${status ?? signal}`;
  return stream.errorReason;
}

// Returns null when a run's init event shows only the planned plugins and skills, or the reason
// it does not. Builtin plugins load in every run. Only the with-arm stage-1 run has one more, the
// inline skill plugin, and only it lists the skill. The check shows that the skill was
// available, not that the slash command loaded it.
export function checkIsolation(init, { arm, stage, pluginName }) {
  if (!init) return "no init event";
  for (const field of ["mcp_servers", "plugins", "skills"])
    if (!Array.isArray(init[field])) return `no ${field} list`;
  if (init.mcp_servers.length > 0)
    return `MCP servers ${init.mcp_servers.map((server) => server.name).join(", ")}`;
  const plugins = init.plugins
    .map((plugin) => String(plugin.source))
    .filter((source) => !source.endsWith("@builtin"));
  const skills = init.skills.filter((skill) => String(skill).endsWith(SKILL_NAME));
  const expectedPlugins = loadsSkill(arm, stage) ? [`${pluginName}@inline`] : [];
  const expectedSkills = loadsSkill(arm, stage) ? [`${pluginName}:${SKILL_NAME}`] : [];
  if (plugins.join(",") !== expectedPlugins.join(","))
    return `plugins ${plugins.join(", ") || "none"}, expected ${expectedPlugins.join(", ") || "none"}`;
  if (skills.join(",") !== expectedSkills.join(","))
    return `skills ${skills.join(", ") || "none"}, expected ${expectedSkills.join(", ") || "none"}`;
  return null;
}

// Passes a Node TAP report only when the run exited 0 unkilled, the end-of-run summary shows no
// failure or cancellation, each hidden file has a passing top-level test with its name prefix,
// and no hidden test carries a SKIP or TODO directive. Exit 0 alone is not enough: agent source
// shares the hidden run's process and can end it early. "# fail 0" alone is not enough either:
// a skipped or TODO test does not count as a failure.
export function judgeTestRun({ status, signal, tap, hiddenPrefixes }) {
  if (signal) return { passed: false, reason: `killed by ${signal}` };
  if (status !== 0) return { passed: false, reason: `exit ${status}` };
  const fail = tap.match(/^# fail (\d+)$/m);
  const cancelled = tap.match(/^# cancelled (\d+)$/m);
  if (!fail || !cancelled) return { passed: false, reason: "no summary" };
  if (fail[1] !== "0") return { passed: false, reason: `fail ${fail[1]}` };
  if (cancelled[1] !== "0") return { passed: false, reason: `cancelled ${cancelled[1]}` };
  for (const prefix of hiddenPrefixes) {
    const name = escapeRegExp(prefix);
    if (!new RegExp(`^ok \\d+ - ${name}: `, "m").test(tap))
      return { passed: false, reason: `no passing ${prefix} test` };
    if (new RegExp(`^(not )?ok \\d+ - ${name}: .*# (skip|todo)\\b`, "im").test(tap))
      return { passed: false, reason: `a ${prefix} test was skipped or marked todo` };
  }
  return { passed: true, reason: null };
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Summarizes one arm. Tokens and files are per-arm-run sums over the two tasks, taken over
// complete arm-runs only; cost sums every arm-run.
export function summarizeArm(armRuns, runsPerArm) {
  const complete = armRuns.filter((run) => run.complete);
  const bothPassed = complete.filter((run) => run.tasks.every((task) => task.status === "pass"));
  const merges = (status) => bothPassed.filter((run) => run.merge.status === status).length;
  const taskSum = (run, field) => run.tasks.reduce((sum, task) => sum + task[field], 0);
  return {
    runs: runsPerArm,
    complete: complete.length,
    bothPassed: bothPassed.length,
    mergedClean: merges("clean"),
    conflict: merges("conflict"),
    broken: merges("broken"),
    tokens: spread(complete.map((run) => taskSum(run, "tokens"))),
    files: spread(complete.map((run) => taskSum(run, "files"))),
    costUsd: armRuns.reduce((sum, run) => sum + run.costUsd, 0),
  };
}

// An even count takes the mean of the two middle values, so no half of the spread is hidden.
function spread(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return { min: sorted[0], max: sorted.at(-1), median };
}

function formatSpread(range) {
  return range === null ? "n/a" : `${range.min}-${range.max} median ${range.median}`;
}

function formatUsd(usd) {
  return `$${usd.toFixed(2)}`;
}

function formatStatus(stage) {
  return stage.status === "error" ? `error: ${stage.error}` : stage.status;
}

export function formatRunLine(run) {
  const parts = [`stage1 ${formatStatus(run.stage1)} files ${run.stage1.files}`];
  for (const task of run.tasks) {
    if (task.status === "skipped") parts.push(`${task.name} skipped`);
    else
      parts.push(
        `${task.name} ${formatStatus(task)} tokens ${task.tokens ?? "n/a"} files ${task.files}`,
      );
  }
  parts.push(`merge ${run.merge.status}`);
  // A run that reported no cost still spent money, so the sum is a lower bound.
  const unknownCost = [run.stage1, ...run.tasks].some(
    (stage) => stage.status !== "skipped" && stage.costUsd === null,
  );
  const cost = `${formatUsd(run.costUsd)}${unknownCost ? "+unknown" : ""}`;
  parts.push(`${cost} ${run.complete ? "complete" : "incomplete"}`);
  return `${run.arm} ${run.index}: ${parts.join(" | ")}`;
}

export function formatSummary(arm, summary) {
  const { runs, complete, bothPassed, mergedClean, conflict, broken } = summary;
  return (
    `${arm}: complete ${complete}/${runs}, both passed ${bothPassed}/${complete}, ` +
    `merged clean ${mergedClean}/${bothPassed} (conflict ${conflict}, broken ${broken}), ` +
    `tokens ${formatSpread(summary.tokens)}, files ${formatSpread(summary.files)}, ` +
    `cost ${formatUsd(summary.costUsd)}`
  );
}

// Reads the fixture's closed file set and names the first missing file. Tasks run in name
// order.
export function readFixture(dir) {
  const fixture = resolve(dir);
  const fixtureFile = (path) => {
    if (!existsSync(join(fixture, path)))
      throw new UsageError(`incomplete fixture ${dir}: missing ${path}`);
    return join(fixture, path);
  };
  for (const path of FIXTURE_FILES) fixtureFile(path);
  const taskFiles = existsSync(join(fixture, "tasks"))
    ? readdirSync(join(fixture, "tasks")).filter((file) => file.endsWith(".md"))
    : [];
  if (taskFiles.length !== TASK_COUNT)
    throw new UsageError(
      `incomplete fixture ${dir}: needs exactly ${TASK_COUNT} tasks/*.md files, found ${taskFiles.length}`,
    );
  const tasks = taskFiles.sort().map((file) => {
    const name = file.slice(0, -".md".length);
    return {
      name,
      promptPath: join(fixture, "tasks", file),
      prompt: readFileSync(join(fixture, "tasks", file), "utf8"),
      accept: fixtureFile(`accept/${name}${HIDDEN_SUFFIX}`),
    };
  });
  return {
    scaffold: join(fixture, "scaffold.sh"),
    refactorPath: join(fixture, "refactor.md"),
    refactor: readFileSync(join(fixture, "refactor.md"), "utf8"),
    tasks,
    baseline: join(fixture, "accept", `baseline${HIDDEN_SUFFIX}`),
    stage1: join(fixture, "accept", `stage1${HIDDEN_SUFFIX}`),
  };
}

// Builds a fresh plugin that holds only the skill. The with-arm agent can write the copy through
// --add-dir, so each run gets its own and no edit carries into the next run.
export function buildSkillPlugin(skillDir, manifest, parentDir) {
  const pluginDir = mkdtempSync(join(parentDir, "plugin-"));
  cpSync(skillDir, join(pluginDir, "skills", SKILL_NAME), { recursive: true });
  mkdirSync(join(pluginDir, ".claude-plugin"));
  const pluginManifest = {
    name: manifest.name,
    version: manifest.version,
    description: PLUGIN_DESCRIPTION,
    skills: [`./skills/${SKILL_NAME}`],
  };
  writeFileSync(
    join(pluginDir, ".claude-plugin", "plugin.json"),
    `${JSON.stringify(pluginManifest, null, 2)}\n`,
  );
  return pluginDir;
}

// Scratch git ignores the maintainer's config, ignore file, and attributes file, so the commit
// records exactly what the agent left. It runs no fsmonitor hook, even one set in the scratch
// directory's own config. It sets no signing: these commits never leave the machine.
const SCRATCH_GIT_FLAGS = [
  "-c",
  "user.name=Eval Fixture",
  "-c",
  "user.email=eval@example.invalid",
  "-c",
  "core.excludesFile=/dev/null",
  "-c",
  "core.attributesFile=/dev/null",
  "-c",
  "core.fsmonitor=false",
];

function scratchGitEnv(extra) {
  // Drops inherited GIT_* variables, such as a hook's GIT_DIR or GIT_INDEX_FILE.
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
  );
  return {
    ...inherited,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_DATE: SCRATCH_DATE,
    GIT_COMMITTER_DATE: SCRATCH_DATE,
    ...extra,
  };
}

function git(gitDir, args, { env = {}, encoding = "utf8" } = {}) {
  return spawnSync("git", [`--git-dir=${gitDir}`, ...SCRATCH_GIT_FLAGS, ...args], {
    env: scratchGitEnv(env),
    encoding,
    maxBuffer: GIT_MAX_BUFFER,
  });
}

function gitOk(gitDir, args, options) {
  const run = git(gitDir, args, options);
  if (run.error) throw run.error;
  if (run.status !== 0)
    throw new Error(`git ${args.join(" ")} exited ${run.status}: ${String(run.stderr).trim()}`);
  return run.stdout;
}

// Commits the workspace as a child of parent, or as a root commit when parent is null. The index
// starts as the parent's tree, so a file the agent deleted shows as a deleted path.
export function commitWorkspace(gitDir, parent, workspace) {
  const indexDir = mkdtempSync(join(gitDir, "eval-index-"));
  const env = { GIT_INDEX_FILE: join(indexDir, "index") };
  try {
    if (parent !== null) gitOk(gitDir, ["read-tree", parent], { env });
    gitOk(gitDir, [`--work-tree=${workspace}`, "add", "-A"], { env });
    const tree = gitOk(gitDir, ["write-tree"], { env }).trim();
    const parentArgs = parent === null ? [] : ["-p", parent];
    return gitOk(gitDir, ["commit-tree", tree, ...parentArgs, "-m", "eval-handoff"], {
      env,
    }).trim();
  } finally {
    rmSync(indexDir, { recursive: true, force: true });
  }
}

// Writes each blob of the tree as a regular file. It reads no .gitattributes, so the filled
// directory holds the committed bytes. A symbolic link would let a test run follow it out of
// the run root, so a symlink or any other non-file entry throws FillError before any write.
export function fillFromTree(gitDir, treeish, dest) {
  const entries = listTree(gitDir, treeish);
  for (const { mode, path } of entries) {
    if (mode === SYMLINK_MODE) throw new FillError("symlink", path);
    if (!FILE_MODES.has(mode)) throw new FillError(`mode ${mode}`, path);
  }
  for (const entry of entries) {
    const target = join(dest, entry.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, gitOk(gitDir, ["cat-file", "blob", entry.oid], { encoding: "buffer" }));
    if (entry.mode === EXECUTABLE_MODE) chmodSync(target, 0o755);
  }
}

function listTree(gitDir, treeish) {
  return gitOk(gitDir, ["ls-tree", "-r", "-z", treeish])
    .split("\0")
    .filter(Boolean)
    .map((record) => {
      // Only the first tab separates the metadata, because a path can hold a tab.
      const tab = record.indexOf("\t");
      const [mode, , oid] = record.slice(0, tab).split(" ");
      return { mode, oid, path: record.slice(tab + 1) };
    });
}

export function changedPaths(gitDir, parent, commit) {
  return gitOk(gitDir, ["diff", "--name-only", "--no-renames", "-z", parent, commit])
    .split("\0")
    .filter(Boolean);
}

// Merges two task commits without a work tree. Exit 0 is clean. A conflict exits 1 and its
// output starts with the merged tree id, then the conflicted paths up to a blank line. git also
// exits 1 for a bad commit id, with no tree id, so only the tree id tells the two apart. Any
// other result is an error that keeps git's stderr unchanged.
export function mergeCheck(gitDir, a, b) {
  const run = git(gitDir, ["merge-tree", "--write-tree", "--name-only", a, b]);
  if (run.error) throw run.error;
  const [tree, ...rest] = run.stdout.split("\n");
  if (run.status === 0) return { status: "clean", tree, conflicts: [], error: null };
  if (run.status === 1 && OBJECT_ID.test(tree)) {
    const end = rest.indexOf("");
    const conflicts = [...new Set(end === -1 ? rest : rest.slice(0, end))];
    return { status: "conflict", tree, conflicts, error: null };
  }
  return { status: "error", tree: null, conflicts: [], error: run.stderr };
}

function hiddenPrefix(path) {
  const file = path.split("/").at(-1);
  return file.slice(0, -HIDDEN_SUFFIX.length);
}

// One test run under the Node permission model: it can read and write only its own test
// directory and start no child process. A hidden run names its hidden files, so Node loads no
// agent test file beside them. The TAP report goes to a file and stderr is discarded, so no
// amount of test output overflows spawnSync's buffer. A spawn error other than the timeout fails
// the run instead of ending the command.
function testRun({ gitDir, treeish, dir, hiddenFiles, timeoutSeconds }) {
  mkdirSync(dir);
  fillFromTree(gitDir, treeish, dir);
  const hiddenArgs = [];
  if (hiddenFiles.length > 0) mkdirSync(join(dir, HIDDEN_DIR), { recursive: true });
  for (const file of hiddenFiles) {
    const name = file.split("/").at(-1);
    cpSync(file, join(dir, HIDDEN_DIR, name));
    hiddenArgs.push(`${HIDDEN_DIR}/${name}`);
  }
  const tapPath = `${dir}.tap`;
  const tapFd = openSync(tapPath, "w");
  let run;
  try {
    run = spawnSync(
      process.execPath,
      [
        "--permission",
        `--allow-fs-read=${dir}`,
        `--allow-fs-write=${dir}`,
        "--test",
        "--experimental-test-isolation=none",
        "--test-reporter=tap",
        ...hiddenArgs,
      ],
      {
        cwd: dir,
        env: { PATH: process.env.PATH },
        stdio: ["ignore", tapFd, "ignore"],
        timeout: timeoutSeconds * 1000,
        // Test code can catch SIGTERM, and spawnSync waits for the child to exit.
        killSignal: "SIGKILL",
      },
    );
  } finally {
    closeSync(tapFd);
  }
  if (run.error && run.error.code !== "ETIMEDOUT")
    return { passed: false, reason: `spawn ${run.error.code ?? run.error.message}` };
  return judgeTestRun({
    status: run.status,
    signal: run.signal,
    tap: readFileSync(tapPath, "utf8"),
    hiddenPrefixes: hiddenFiles.map(hiddenPrefix),
  });
}

// A test step passes only when the workspace suite and the hidden tests both pass.
function testStep(ctx, treeish, stageDir, hiddenFiles) {
  const shared = { gitDir: ctx.gitDir, treeish, timeoutSeconds: ctx.testTimeoutSeconds };
  const suite = testRun({ ...shared, dir: join(stageDir, "test-suite"), hiddenFiles: [] });
  const hidden = testRun({ ...shared, dir: join(stageDir, "test-hidden"), hiddenFiles });
  return suite.passed && hidden.passed;
}

// Returns the first stop rule that a finished claude run trips, or null. Every earlier run spent
// at most its budget, so stopping here bounds the overshoot to this one run.
function stopRule(ctx, { arm, index, stage, stream, error }) {
  const where = `${arm} ${index} ${stage}`;
  // A login, flag, or setup fault repeats on every run, so going on wastes money.
  const firstRun = {
    rule: "first run",
    detail: `${where} failed with error: ${error}. Check the claude login and flags.`,
  };
  const firstRunFailed = ctx.claudeRuns === 1 && error !== null;
  // A first run that fails before its init event never started a session, so its missing init
  // event and cost say less than the failure itself.
  if (firstRunFailed && stream.init === null) return firstRun;
  const leak = checkIsolation(stream.init, { arm, stage, pluginName: ctx.manifest.name });
  if (leak !== null) return { rule: "isolation", detail: `${where} init: ${leak}.` };
  const { costUsd } = stream;
  const budget = ctx.options.runBudgetUsd;
  if (error === "budget" || (costUsd !== null && costUsd > budget)) {
    const spent = costUsd === null ? "an unknown amount" : formatUsd(costUsd);
    return {
      rule: "budget",
      detail: `${where} spent ${spent}, above its ${formatUsd(budget)} budget. Raise --max-cost-usd.`,
    };
  }
  if (costUsd === null) return { rule: "no cost", detail: `${where} reported no usable cost.` };
  if (firstRunFailed) return firstRun;
  return null;
}

// One stage: a claude run in a workspace filled from parent, a commit of what it left, and a
// test step on that commit. Stdout goes straight to the trace file and stderr to stderr.log, so
// output larger than spawnSync's buffer neither truncates nor crashes the command. A run that
// errors or trips a stop rule gets no test step.
function runStage(
  ctx,
  { arm, index, stage, stageDir, parent, prompt, pluginDir, hiddenFiles, verdicts },
) {
  const workspace = join(stageDir, "workspace");
  mkdirSync(workspace, { recursive: true });
  fillFromTree(ctx.gitDir, parent, workspace);
  const args = claudeArgs({
    arm,
    stage,
    model: ctx.options.model,
    budgetUsd: ctx.options.runBudgetUsd,
    pluginDir,
  });
  const trace = join(stageDir, "trace.jsonl");
  const traceFd = openSync(trace, "w");
  const stderrFd = openSync(join(stageDir, "stderr.log"), "w");
  let run;
  try {
    run = spawnSync(ctx.claude, args, {
      cwd: workspace,
      input: prompt,
      stdio: ["pipe", traceFd, stderrFd],
      timeout: ctx.claudeTimeoutSeconds * 1000,
      killSignal: "SIGTERM",
    });
  } finally {
    closeSync(traceFd);
    closeSync(stderrFd);
  }
  const timedOut = run.error?.code === "ETIMEDOUT";
  if (run.error && !timedOut) throw run.error;
  ctx.claudeRuns += 1;
  const stream = readStreamResult(readFileSync(trace, "utf8"));
  const commit = commitWorkspace(ctx.gitDir, parent, workspace);
  const paths = changedPaths(ctx.gitDir, parent, commit);
  let error = runErrorReason({ timedOut, status: run.status, signal: run.signal, stream });
  const stop = stopRule(ctx, { arm, index, stage, stream, error });
  if (stop !== null) error ??= stop.rule;
  let status = "error";
  if (error === null) {
    try {
      const passed = testStep(ctx, commit, stageDir, hiddenFiles);
      status = passed ? verdicts.pass : verdicts.fail;
    } catch (fillError) {
      // The test step is the first fill of this agent's commit. The workspace fill reads the
      // base or a stage-1 commit that already passed this fill, so a FillError there is a
      // fixture bug and stays fatal.
      if (!(fillError instanceof FillError)) throw fillError;
      error = fillError.reason;
    }
  }
  const record = {
    status,
    error,
    costUsd: stream.costUsd,
    tokens: stream.tokens,
    files: paths.length,
    paths,
    commit,
    trace,
  };
  return { record, stop };
}

function skippedStage(name) {
  return {
    name,
    status: "skipped",
    error: null,
    costUsd: null,
    tokens: null,
    files: null,
    paths: [],
    commit: null,
    trace: null,
  };
}

const NO_MERGE = { status: "n/a", conflicts: [], error: null };
const COMPLETE_TASK = new Set(["pass", "fail"]);

function runArm(ctx, { arm, index }) {
  const armDir = join(ctx.runRoot, `${arm}-${index}`);
  mkdirSync(armDir);
  const pluginDir =
    arm === "with" ? buildSkillPlugin(ctx.skillDir, ctx.manifest, armDir) : undefined;
  const slashPrefix = arm === "with" ? `/${ctx.manifest.name}:${SKILL_NAME} refactor ` : "";
  const { record: stage1, stop: stage1Stop } = runStage(ctx, {
    arm,
    index,
    stage: "stage1",
    stageDir: join(armDir, "stage1"),
    parent: ctx.baseCommit,
    prompt: `${slashPrefix}${ctx.fixture.refactor}`,
    pluginDir,
    hiddenFiles: [ctx.fixture.baseline, ctx.fixture.stage1],
    verdicts: { pass: "ok", fail: "fail" },
  });

  let stop = stage1Stop;
  const tasks = ctx.fixture.tasks.map((task) => {
    if (stage1.status !== "ok" || stop !== null) return skippedStage(task.name);
    const result = runStage(ctx, {
      arm,
      index,
      stage: task.name,
      stageDir: join(armDir, task.name),
      parent: stage1.commit,
      prompt: task.prompt,
      hiddenFiles: [ctx.fixture.baseline, task.accept],
      verdicts: { pass: "pass", fail: "fail" },
    });
    stop = result.stop;
    return { name: task.name, ...result.record };
  });

  let merge = NO_MERGE;
  if (tasks.every((task) => task.status === "pass")) {
    const { tree, ...record } = mergeCheck(ctx.gitDir, tasks[0].commit, tasks[1].commit);
    merge = record;
    if (record.status === "clean") {
      const hidden = [ctx.fixture.baseline, ...ctx.fixture.tasks.map((task) => task.accept)];
      const mergeDir = join(armDir, "merge");
      mkdirSync(mergeDir);
      if (!testStep(ctx, tree, mergeDir, hidden)) merge = { ...record, status: "broken" };
    }
  }

  const stages = [stage1, ...tasks];
  const armRun = {
    arm,
    index,
    complete:
      stage1.status === "ok" &&
      tasks.every((task) => COMPLETE_TASK.has(task.status)) &&
      merge.status !== "error",
    costUsd: stages.reduce((sum, stage) => sum + (stage.costUsd ?? 0), 0),
    stage1,
    tasks,
    merge,
  };
  return { armRun, stop };
}

function writeResults(path, record) {
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
}

function atLeast([major, minor], [minMajor, minMinor]) {
  return major > minMajor || (major === minMajor && minor >= minMinor);
}

// Returns { claudeVersion } or { problem }. Versions compare as numbers: 2.9 is older than 2.38.
function preflight(claude) {
  const version = spawnSync(claude, ["--version"], { encoding: "utf8" });
  if (version.error) return { problem: `${claude} --version: ${version.error.message}` };
  if (version.status !== 0) return { problem: `${claude} --version exited ${version.status}` };
  const gitRun = spawnSync("git", ["--version"], { encoding: "utf8" });
  if (gitRun.error) return { problem: `git --version: ${gitRun.error.message}` };
  const gitMatch = /git version (\d+)\.(\d+)/.exec(gitRun.stdout);
  if (!gitMatch || !atLeast([Number(gitMatch[1]), Number(gitMatch[2])], GIT_MIN_VERSION))
    return {
      problem: `needs git ${GIT_MIN_VERSION.join(".")} or later for merge-tree --write-tree, found "${gitRun.stdout.trim()}"`,
    };
  const [nodeMajor, nodeMinor] = process.versions.node.split(".").map(Number);
  if (!atLeast([nodeMajor, nodeMinor], NODE_MIN_VERSION))
    return {
      problem: `needs Node ${NODE_MIN_VERSION.join(".")} or later for the test flags, found ${process.versions.node}`,
    };
  return { claudeVersion: version.stdout.trim() };
}

// Runs the whole command and returns its exit code. The claude path, the results root, and the
// timeouts are arguments, so a test can pass a fake executable, a temp directory, and short
// timeouts.
export async function runHandoff({
  options,
  fixtureDir,
  skillDir,
  repoRoot,
  resultsRoot,
  claude,
  claudeTimeoutSeconds = CLAUDE_TIMEOUT_SECONDS,
  testTimeoutSeconds = TEST_TIMEOUT_SECONDS,
}) {
  const fixture = readFixture(fixtureDir);
  const manifest = readManifest(repoRoot);
  const checked = preflight(claude);
  if (checked.problem) {
    console.error(`eval-handoff.mjs: preflight: ${checked.problem}`);
    return 1;
  }
  const { claudeVersion } = checked;

  const startedAt = new Date().toISOString();
  mkdirSync(resultsRoot, { recursive: true });
  const resultsDir = join(
    resultsRoot,
    `${startedAt.replace(/[:.]/g, "-")}-${options.model}-handoff`,
  );
  // Not recursive, so a rerun in the same millisecond fails instead of replacing a result.
  mkdirSync(resultsDir);
  const resultsPath = join(resultsDir, RESULTS_FILE);
  const runRoot = realpathSync(mkdtempSync(join(tmpdir(), "eval-handoff-")));
  console.log(
    `== handoff: ${options.model}, ${options.runs} runs per arm, cap $${options.capUsd} ` +
      `(${formatUsd(options.runBudgetUsd)} per claude run) -> ${resultsDir}/`,
  );
  console.log(`== run root: ${runRoot}`);

  const base = join(runRoot, "base");
  mkdirSync(base);
  const scaffold = spawnSync("bash", [fixture.scaffold], { cwd: base, encoding: "utf8" });
  if (scaffold.error) throw scaffold.error;
  if (scaffold.status !== 0) {
    const detail = scaffold.stderr.trim().replaceAll("\n", " ");
    console.error(`eval-handoff.mjs: scaffold.sh exited ${scaffold.status} in ${base}: ${detail}`);
    return 1;
  }
  // Scratch git sits outside the run root that the agent workspaces share, so code an agent runs
  // has no path into its config or objects through that root.
  const gitDir = realpathSync(mkdtempSync(join(tmpdir(), "eval-handoff-git-")));
  gitOk(gitDir, ["init", "-q", "--bare"]);
  console.log(`== scratch git: ${gitDir}`);
  const ctx = {
    options,
    fixture,
    manifest,
    claude,
    claudeTimeoutSeconds,
    testTimeoutSeconds,
    claudeRuns: 0,
    skillDir: resolve(skillDir),
    runRoot,
    gitDir,
    baseCommit: commitWorkspace(gitDir, null, base),
  };

  const runs = [];
  let stopped = null;
  const record = () => ({
    schemaVersion: 1,
    claudeVersion,
    startedAt,
    model: options.model,
    runsPerArm: options.runs,
    capUsd: options.capUsd,
    runBudgetUsd: options.runBudgetUsd,
    costUsd: runs.reduce((sum, run) => sum + run.costUsd, 0),
    stopped,
    finished: false,
    runRoot,
    scratchGitDir: gitDir,
    runs,
    summary: Object.fromEntries(
      ARMS.map((arm) => [
        arm,
        summarizeArm(
          runs.filter((run) => run.arm === arm),
          options.runs,
        ),
      ]),
    ),
  });
  for (const planned of planRuns(options.runs)) {
    const { armRun, stop } = runArm(ctx, planned);
    runs.push(armRun);
    console.log(formatRunLine(armRun));
    if (stop !== null) {
      stopped = stop;
      break;
    }
    writeResults(resultsPath, record());
  }
  const final = { ...record(), finished: true };
  writeResults(resultsPath, final);
  if (stopped !== null) console.log(`== stopped: ${stopped.rule}. ${stopped.detail}`);
  for (const arm of ARMS) console.log(formatSummary(arm, final.summary[arm]));
  if (stopped !== null) return 1;
  console.log(`== results: ${resultsPath}`);
  return runs.every((run) => run.complete) ? 0 : 1;
}

function readManifest(repoRoot) {
  return JSON.parse(readFileSync(join(repoRoot, ".claude-plugin", "plugin.json"), "utf8"));
}

function shellQuote(arg) {
  return /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", "'\\''")}'`;
}

// Lists each claude command of one arm-run per arm, with placeholder paths and stdin sources.
function dryRunLines(options, fixture, manifest, repoRoot) {
  const lines = [
    `== handoff dry run: ${options.model}, ${options.runs} runs per arm, cap $${options.capUsd} ` +
      `(${formatUsd(options.runBudgetUsd)} per claude run). Each command runs in its workspace ` +
      "under <run root>, once per run index.",
  ];
  const shown = (path) => relative(repoRoot, path);
  for (const arm of ARMS) {
    const pluginDir = loadsSkill(arm, "stage1")
      ? `<run root>/${arm}-<i>/plugin-<random>`
      : undefined;
    const prefix = loadsSkill(arm, "stage1")
      ? `"/${manifest.name}:${SKILL_NAME} refactor " followed by `
      : "";
    const stages = [
      { stage: "stage1", prompt: fixture.refactorPath, prefix },
      ...fixture.tasks.map((task) => ({ stage: task.name, prompt: task.promptPath, prefix: "" })),
    ];
    for (const { stage, prompt, prefix: stdinPrefix } of stages) {
      const args = claudeArgs({
        arm,
        stage,
        model: options.model,
        budgetUsd: options.runBudgetUsd,
        pluginDir,
      });
      lines.push(`# ${arm} ${stage}: stdin is ${stdinPrefix}${shown(prompt)}`);
      lines.push(["claude", ...args].map(shellQuote).join(" "));
    }
  }
  return lines;
}

async function main(args) {
  const options = parseArgs(args);
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  if (!existsSync(".claude-plugin/plugin.json") || !existsSync(join(SKILL_DIR, "SKILL.md")))
    throw new UsageError("run from the repository root");
  if (options.dryRun) {
    const lines = dryRunLines(options, readFixture(FIXTURE_DIR), readManifest("."), resolve("."));
    for (const line of lines) console.log(line);
    return 0;
  }
  return runHandoff({
    options,
    fixtureDir: FIXTURE_DIR,
    skillDir: SKILL_DIR,
    repoRoot: ".",
    resultsRoot: RESULTS_ROOT,
    claude: "claude",
  });
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`eval-handoff.mjs: ${error.message}`);
    process.exitCode = 2;
  }
}
