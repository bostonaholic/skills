#!/usr/bin/env node
// Runs the TLC model checker on one TLA+ spec under a wall clock and a distinct-state bound, and
// writes a check result file. It never installs anything.
// Usage: run-tlc.mjs <Module.tla> <result.json>
//   exit 0  wrote result.json, whatever its status: pass, fail, or not-run with the reason
//   exit 1  cannot create result.json's directory or the scratch directory beside it, or cannot
//           write result.json
//   exit 2  not exactly two arguments, a spec that does not exist, or a spec file stem that does
//           not match ^[A-Z][A-Za-z0-9]*$
// Finds `tlc` on PATH, else `java` with the jar that TLA2TOOLS_JAR names. Copies every .tla and .cfg
// beside the spec into a scratch directory beside result.json and runs TLC there, so TLC's states/
// directory and trace files stay out of the repository. The result names the spec under `spec`,
// apart from the siblings in `inputs`, so it vouches for that spec alone. The verdict fails safe:
// output this script does not recognize reads not-run, never pass.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  accessSync,
  constants,
  createWriteStream,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { childEnv } from "./run-bounded.mjs";

// The skill file that explains each exit code.
const DOC_PATH = fileURLToPath(new URL("../SKILL.md", import.meta.url));

// A finite control-state model ends in seconds; past this the run is stuck or the model is too big.
export const TLC_WALL_CLOCK_MS = 120_000;
// TLC prints the distinct count in each progress line, so this bound stops a model that explodes
// before the wall clock does.
export const TLC_DISTINCT_STATE_LIMIT = 1_000_000;
// A pass on fewer distinct states explored nothing but the initial state.
const MIN_DISTINCT_STATES = 2;
// Enough of the output to show a parse error or a stuck run without embedding the whole log.
const TAIL_LINES = 40;
const MODULE_NAME = /^[A-Z][A-Za-z0-9]*$/;
const PASS_LINE = /^Model checking completed\. No error has been found\.$/m;
const INVARIANT_VIOLATED = /^Error: Invariant (\S+) is violated\.$/m;
const TRACE_STATE = /^State 1: /m;
const DISTINCT_STATES = /([\d,]+) distinct states? found/g;
const CFG_KEYWORD = /^[A-Z][A-Z_]*$/;

// Names listed after INVARIANT or INVARIANTS, up to the next all-caps keyword. An all-caps
// invariant name reads as a keyword, which drops it and fails safe.
export function cfgInvariants(cfg) {
  const tokens = String(cfg)
    .replace(/\(\*[\s\S]*?\*\)/g, " ")
    .replace(/\\\*.*$/gm, " ")
    .split(/\s+/)
    .filter(Boolean);
  const names = [];
  let inInvariants = false;
  for (const token of tokens) {
    if (token === "INVARIANT" || token === "INVARIANTS") inInvariants = true;
    else if (CFG_KEYWORD.test(token)) inInvariants = false;
    else if (inInvariants) names.push(token);
  }
  return names;
}

function lastDistinctCount(output) {
  const counts = [...String(output).matchAll(DISTINCT_STATES)];
  return counts.length === 0 ? null : Number(counts.at(-1)[1].replaceAll(",", ""));
}

function tail(output) {
  return String(output).trimEnd().split("\n").slice(-TAIL_LINES).join("\n");
}

const notRun = (why, output) => ({
  status: "not-run",
  reason: output.trim() === "" ? why : `${why}. Last lines of TLC output:\n${tail(output)}`,
});

// Turns one finished TLC run into pass, fail, or not-run. Pure.
export function classifyTlc({ exitCode, output, cfg }) {
  const text = String(output ?? "");
  const violated = text.match(INVARIANT_VIOLATED);
  if (violated && TRACE_STATE.test(text.slice(violated.index))) {
    const from = text.slice(violated.index);
    const end = from.search(/^[\d,]+ states generated/m);
    return { status: "fail", trace: (end === -1 ? from : from.slice(0, end)).trimEnd() };
  }
  if (exitCode !== 0) return notRun(`TLC exited ${exitCode} with no invariant violation`, text);
  if (!PASS_LINE.test(text)) return notRun("TLC printed no completion line", text);
  const distinctStates = lastDistinctCount(text);
  if (distinctStates === null || distinctStates < MIN_DISTINCT_STATES)
    return notRun(`TLC explored fewer than ${MIN_DISTINCT_STATES} distinct states`, text);
  if (!cfgInvariants(cfg).some((name) => name !== "TypeOK"))
    return notRun(
      "the .cfg names no invariant other than TypeOK under INVARIANT or INVARIANTS, and TypeOK alone cannot catch a logic error",
      "",
    );
  return { status: "pass", distinctStates };
}

function which(tool, path) {
  for (const dir of (path ?? "").split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, tool);
    try {
      accessSync(candidate, constants.X_OK);
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // Not in this PATH entry.
    }
  }
  return null;
}

// Returns { argv } for the checker, or { reason } naming what the lookup tried.
function findChecker(module, env) {
  const flags = ["-deadlock", "-workers", "1", `${module}.tla`];
  const tlc = which("tlc", env.PATH);
  if (tlc) return { argv: [tlc, ...flags] };
  const jar = env.TLA2TOOLS_JAR;
  if (!jar) return { reason: "found no tlc on PATH, and TLA2TOOLS_JAR is not set" };
  if (!existsSync(jar))
    return { reason: `found no tlc on PATH, and TLA2TOOLS_JAR names ${jar}, which does not exist` };
  const java = which("java", env.PATH);
  if (!java)
    return { reason: `found no tlc on PATH, and no java on PATH to run TLA2TOOLS_JAR ${jar}` };
  return { argv: [java, "-cp", jar, "tlc2.TLC", ...flags] };
}

// Copies every .tla and .cfg file beside `spec` into `scratch`, and returns their digests.
function copyInputs(spec, scratch) {
  const dir = dirname(spec);
  const inputs = [];
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith(".tla") && !name.endsWith(".cfg")) continue;
    const path = join(dir, name);
    if (!lstatSync(path).isFile()) continue;
    const bytes = readFileSync(path);
    writeFileSync(join(scratch, name), bytes);
    inputs.push({ path, sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  return inputs;
}

function killGroup(pid) {
  if (!pid) return;
  try {
    process.kill(-pid, "SIGKILL");
  } catch (error) {
    // macOS answers EPERM, not ESRCH, for a group whose members have all exited but are not reaped.
    if (error.code !== "ESRCH" && error.code !== "EPERM") throw error;
  }
}

// Runs the checker detached, so a kill reaches its whole process group, and settles with the
// exit code, the output, and the bound it passed, if any.
function runChecker(argv, cwd, logPath, bounds) {
  return new Promise((settle) => {
    const log = createWriteStream(logPath);
    let output = "";
    let stopped = null;
    let child;
    try {
      child = spawn(argv[0], argv.slice(1), {
        cwd,
        env: childEnv(),
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      log.end();
      settle({ spawnError: error });
      return;
    }
    const stop = (why) => {
      if (stopped) return;
      stopped = why;
      killGroup(child.pid);
    };
    const timer = setTimeout(
      () => stop(`TLC ran past the wall clock of ${bounds.wallClockMs} ms`),
      bounds.wallClockMs,
    );
    const onData = (chunk) => {
      log.write(chunk);
      output += chunk;
      const count = lastDistinctCount(chunk);
      if (count !== null && count > bounds.distinctStateLimit)
        stop(`TLC passed the bound of ${bounds.distinctStateLimit} distinct states`);
    };
    child.stdout.setEncoding("utf8").on("data", onData);
    child.stderr.setEncoding("utf8").on("data", onData);
    child.on("error", (error) => {
      clearTimeout(timer);
      log.end();
      settle({ spawnError: error });
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      // A grandchild can hold the pipes open after TLC exits, so the group goes too.
      killGroup(child.pid);
      child.stdout.destroy();
      child.stderr.destroy();
      log.end(() => settle({ exitCode: code, output, stopped }));
    });
  });
}

// Runs TLC on `spec` and writes the check result to `result`, creating its directory on a first
// run. Throws when that directory, the scratch directory, or the result cannot be written.
export async function runTlc(spec, result, bounds) {
  const started = Date.now();
  const module = basename(spec, ".tla");
  mkdirSync(dirname(resolve(result)), { recursive: true });
  const scratch = mkdtempSync(join(dirname(resolve(result)), `tlc-${module}-`));
  const inputs = copyInputs(resolve(spec), scratch);
  const checker = findChecker(module, process.env);
  const record = (fields, command = []) => {
    const body = {
      check: "model-check",
      spec: resolve(spec),
      ...fields,
      seconds: Math.round((Date.now() - started) / 100) / 10,
      command,
      inputs,
    };
    writeFileSync(result, `${JSON.stringify(body, null, 2)}\n`);
    return body;
  };
  if (!checker.argv) return record({ status: "not-run", reason: checker.reason });
  const run = await runChecker(checker.argv, scratch, join(scratch, "tlc.log"), bounds);
  if (run.spawnError)
    return record(
      {
        status: "not-run",
        reason: `could not start ${checker.argv[0]}: ${run.spawnError.message}`,
      },
      checker.argv,
    );
  if (run.stopped) return record(notRun(run.stopped, run.output), checker.argv);
  const cfgPath = join(scratch, `${module}.cfg`);
  const cfg = existsSync(cfgPath) ? readFileSync(cfgPath, "utf8") : "";
  return record(classifyTlc({ exitCode: run.exitCode, output: run.output, cfg }), checker.argv);
}

function usage(message) {
  process.stderr.write(`run-tlc.mjs: ${message}\n`);
  process.stderr.write("run-tlc.mjs: usage: run-tlc.mjs <Module.tla> <result.json>\n");
  process.stderr.write(`see ${DOC_PATH}\n`);
  return 2;
}

async function main(args) {
  if (args.length !== 2) return usage("expected a spec and a result path");
  const [spec, result] = args;
  if (!spec.endsWith(".tla") || !MODULE_NAME.test(basename(spec, ".tla")))
    return usage(`${basename(spec)} is not a module name matching ${MODULE_NAME.source}`);
  if (!existsSync(spec)) return usage(`${spec} does not exist`);
  try {
    await runTlc(spec, result, {
      wallClockMs: TLC_WALL_CLOCK_MS,
      distinctStateLimit: TLC_DISTINCT_STATE_LIMIT,
    });
  } catch (error) {
    process.stderr.write(`run-tlc.mjs: cannot write ${result}: ${error.message}\n`);
    process.stderr.write(`see ${DOC_PATH}\n`);
    return 1;
  }
  return 0;
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync. Under
// `node -e`, argv[1] is a plain argument that may name no file.
const entry = process.argv[1] && existsSync(process.argv[1]) ? realpathSync(process.argv[1]) : null;
if (entry && import.meta.url === pathToFileURL(entry).href) {
  process.exitCode = await main(process.argv.slice(2));
}
