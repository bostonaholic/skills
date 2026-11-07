#!/usr/bin/env node
// Runs one command, such as a test suite, under a wall clock and an environment allowlist, and
// writes a check result file.
// Usage: run-bounded.mjs <request.json>
//   exit 0  wrote the result file, whatever its status: pass, fail, or not-run with the reason
//   exit 1  the request is unreadable or malformed, or the log or the result cannot be written
//   exit 2  not exactly one argument; stderr prints the usage line
// A request holds `check`, `argv`, `cwd`, `env`, `result`, and `log`. `argv` runs with no shell,
// detached, with stdout and stderr in `log`. `env` names the variables the user passed with --env.
// `tree` is one digest of HEAD, every ref, and the content of each tracked change, taken before
// and after the run; a change reads fail. It covers tracked files and refs only, so a file that a
// passing run creates stays out of `changed`.
// Importing this module runs nothing. Every improving-codebases script gives its child processes,
// git included, the environment childEnv() returns.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  lstatSync,
  openSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// The skill file that explains each exit code.
const DOC_PATH = fileURLToPath(new URL("../SKILL.md", import.meta.url));

// Ends before the 600-second foreground limit that some harnesses set on a shell call.
export const TEST_WALL_CLOCK_MS = 540_000;
// Enough of the log to show the failing assertion without embedding a whole test run.
const TRACE_BYTES = 8 * 1024;
// git output can pass spawnSync's 1 MiB default buffer on a large repository.
const GIT_MAX_BUFFER = 256 * 1024 * 1024;
const ENV_NAME = /^[A-Z_][A-Z0-9_]*$/;

// Names a child process needs to find tools, write temporary files, and format text.
export const ENV_ALLOWLIST = Object.freeze([
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TERM",
  "TZ",
  "TMPDIR",
  "JAVA_HOME",
]);

// Returns the allowlisted variables of `parent`, plus the `extraNames` the user passed with --env.
export function childEnv(extraNames = [], parent = process.env) {
  const env = {};
  for (const name of [...ENV_ALLOWLIST, ...extraNames]) {
    if (parent[name] !== undefined) env[name] = parent[name];
  }
  return env;
}

class RequestError extends Error {}

function git(root, args) {
  const run = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    env: childEnv(),
    maxBuffer: GIT_MAX_BUFFER,
  });
  if (run.status !== 0)
    throw new RequestError(
      `git ${args[0]} failed in ${root}: ${run.error?.message ?? run.stderr.trim()}`,
    );
  return run.stdout;
}

const sha256 = (data) => createHash("sha256").update(data).digest("hex");

function contentHash(root, path) {
  try {
    const stat = lstatSync(join(root, path));
    if (stat.isSymbolicLink()) return `link:${readlinkSync(join(root, path))}`;
    if (stat.isFile()) return `file:${stat.mode & 0o111}:${sha256(readFileSync(join(root, path)))}`;
    return "other";
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return "absent";
    throw error;
  }
}

// HEAD, the ref list, a content hash of each tracked change, and one digest of all three.
export function treeState(root) {
  const commit = git(root, ["rev-parse", "HEAD"]).trim();
  const branch = spawnSync("git", ["symbolic-ref", "-q", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    env: childEnv(),
  }).stdout.trim();
  const head = branch ? `${commit} ${branch}` : commit;
  const refs = git(root, ["for-each-ref"]);
  const paths = {};
  const status = git(root, ["status", "--porcelain", "-z", "--untracked-files=no", "--no-renames"]);
  for (const entry of status.split("\0").filter(Boolean)) {
    const path = entry.slice(3);
    paths[path] = contentHash(root, path);
  }
  const digest = sha256(JSON.stringify({ head, refs, paths: Object.entries(paths).sort() }));
  return { head, refs, paths, digest };
}

// Names what differs between two tree states, or returns null when nothing does.
export function treeChange(before, after) {
  const changes = [];
  if (before.head !== after.head) changes.push(`HEAD moved from ${before.head} to ${after.head}`);
  if (before.refs !== after.refs) changes.push("refs changed: git for-each-ref output differs");
  const paths = new Set([...Object.keys(before.paths), ...Object.keys(after.paths)]);
  const changed = [...paths]
    .filter((path) => (before.paths[path] ?? "unchanged") !== (after.paths[path] ?? "unchanged"))
    .sort();
  if (changed.length > 0) changes.push(`the run changed tracked paths: ${changed.join(", ")}`);
  return changes.length > 0 ? changes.join("; ") : null;
}

function readRequest(request) {
  const names = Array.isArray(request?.env) ? request.env : null;
  const valid =
    typeof request?.check === "string" &&
    Array.isArray(request.argv) &&
    request.argv.length > 0 &&
    request.argv.every((arg) => typeof arg === "string") &&
    typeof request.cwd === "string" &&
    names !== null &&
    names.every((name) => typeof name === "string" && ENV_NAME.test(name)) &&
    typeof request.result === "string" &&
    typeof request.log === "string";
  if (!valid)
    throw new RequestError(
      "the request needs check, a non-empty argv of strings, cwd, env as a list of NAME strings, result, and log",
    );
  return request;
}

function logTail(path) {
  try {
    const text = readFileSync(path);
    return text
      .subarray(Math.max(0, text.length - TRACE_BYTES))
      .toString("utf8")
      .trimEnd();
  } catch {
    return "";
  }
}

function killGroup(pid) {
  if (!pid) return;
  try {
    process.kill(-pid, "SIGKILL");
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

// Spawns argv detached, so a kill at the bound reaches every process the command started.
function runCommand(request, logFd, wallClockMs) {
  return new Promise((settle) => {
    let stopped = false;
    const child = spawn(request.argv[0], request.argv.slice(1), {
      cwd: request.cwd,
      env: childEnv(request.env),
      detached: true,
      stdio: ["ignore", logFd, logFd],
    });
    const timer = setTimeout(() => {
      stopped = true;
      killGroup(child.pid);
    }, wallClockMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      settle({ spawnError: error });
    });
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      killGroup(child.pid);
      settle({ code, signal, stopped });
    });
  });
}

// Runs the request and writes its result file. Throws RequestError on a malformed request, and on
// a log or result it cannot write.
export async function runBounded(raw, bounds) {
  const request = readRequest(raw);
  const started = Date.now();
  const before = treeState(request.cwd);
  let logFd;
  try {
    logFd = openSync(request.log, "w");
  } catch (error) {
    throw new RequestError(`cannot write the log ${request.log}: ${error.message}`);
  }
  let run;
  try {
    run = await runCommand(request, logFd, bounds.wallClockMs);
  } finally {
    closeSync(logFd);
  }
  const after = treeState(request.cwd);
  const result = { check: request.check, command: request.argv, tree: after.digest };
  const change = treeChange(before, after);
  const tail = logTail(request.log);
  if (run.spawnError) {
    result.status = "not-run";
    result.reason = `could not start ${request.argv[0]}: ${run.spawnError.message}`;
  } else if (run.stopped) {
    result.status = "not-run";
    result.reason = `the command ran past the wall clock of ${bounds.wallClockMs} ms and was killed`;
  } else if (change) {
    result.status = "fail";
    result.reason = change;
    result.trace = tail || change;
  } else if (run.code !== 0) {
    result.status = "fail";
    result.reason = run.signal
      ? `the command died on ${run.signal}`
      : `the command exited ${run.code}`;
    result.trace = tail || result.reason;
  } else {
    result.status = "pass";
  }
  result.seconds = Math.round((Date.now() - started) / 100) / 10;
  try {
    writeFileSync(request.result, `${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    throw new RequestError(`cannot write the result ${request.result}: ${error.message}`);
  }
  return result;
}

function fail(message, code) {
  process.stderr.write(`run-bounded.mjs: ${message}\n`);
  process.stderr.write(`see ${DOC_PATH}\n`);
  return code;
}

async function main(args) {
  if (args.length !== 1) return fail("usage: run-bounded.mjs <request.json>", 2);
  let request;
  try {
    request = JSON.parse(readFileSync(args[0], "utf8"));
  } catch (error) {
    return fail(`cannot read the request ${args[0]}: ${error.message}`, 1);
  }
  try {
    await runBounded(request, { wallClockMs: TEST_WALL_CLOCK_MS });
  } catch (error) {
    if (!(error instanceof RequestError)) throw error;
    return fail(error.message, 1);
  }
  return 0;
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync. Under
// `node -e`, argv[1] is a plain argument that may name no file.
const entry = process.argv[1] && existsSync(process.argv[1]) ? realpathSync(process.argv[1]) : null;
if (entry && import.meta.url === pathToFileURL(entry).href) {
  process.exitCode = await main(process.argv.slice(2));
}
