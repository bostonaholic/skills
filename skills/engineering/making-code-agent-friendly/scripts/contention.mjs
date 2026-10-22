#!/usr/bin/env node
// Reads git history for where parallel agents will collide and prints the signals as JSON.
// Usage: contention.mjs [--max-commits <n>] [--top <n>] [-- <pathspec>...]
//   --max-commits  newest non-merge commits reachable from HEAD to read (default 500)
//   --top          longest any list in the output may be (default 20)
//   <pathspec>     git pathspecs, relative to the working directory, limiting commits and
//                  files; without one the whole repository is read
// Output: { commit, commitsScanned, commitsIgnored,
//           hotFiles: [{ path, commits, share }],
//           coupledPairs: [{ a, b, coChanges, confidence }],
//           sequences: [{ dir, files, highest }],
//           scatter: { medianDirsPerCommit } }
//   Paths are top-level-relative. A commit touching more than 50 files counts as ignored, and
//   one touching none counts as neither scanned nor ignored. Every list is sorted, ties by path.
//   exit 0  printed the JSON
//   exit 1  printed nothing; stderr names the failure: git cannot run or fails, the working
//           directory is not in a git work tree, or HEAD names no commit
//   exit 2  a flag is unknown or lacks a positive integer value; stderr prints the usage line
// Read-only: every git call is a read and passes --no-optional-locks.
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { posix } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// The skill file that explains each exit code.
const DOC_PATH = fileURLToPath(new URL("../references/contention.md", import.meta.url));

const SCRIPT = "contention.mjs";
const USAGE = `${SCRIPT}: usage: ${SCRIPT} [--max-commits <n>] [--top <n>] [-- <pathspec>...]`;

// 500 commits is months of history on an active repository, enough for steady patterns to
// outweigh one busy week, and it keeps the read to seconds on a large repository.
const DEFAULT_MAX_COMMITS = 500;
// 20 rows is as much of each list as a reviewer acts on; the long tail is noise.
const DEFAULT_TOP = 20;
// Bulk renames, reformatting, and dependency bumps touch more files than feature work does,
// and would swamp the signal with pairs nobody edits together by hand.
const BULK_COMMIT_FILES = 50;
// One commit is an event, not a pattern.
const MIN_HOT_COMMITS = 2;
// Two co-changes can be coincidence; three is a habit.
const MIN_CO_CHANGES = 3;
// Two numbered files can be chance (1-intro, 2-setup); three show a convention new work extends.
const MIN_SEQUENCE_FILES = 3;
// Three decimals tell one commit in 500 (0.002) apart without float noise.
const RATIO_SCALE = 1000;

const DIGIT_PREFIX = /^\d+/;
const POSITIVE_INTEGER = /^[1-9]\d*$/;

class ContentionError extends Error {}
class UsageError extends Error {}

// --no-optional-locks keeps every call off index.lock, so the read never blocks a concurrent git command.
const gitArgv = (...args) => ["--no-optional-locks", ...args];

export function parseArgs(args) {
  const options = { maxCommits: DEFAULT_MAX_COMMITS, top: DEFAULT_TOP, pathspecs: [] };
  const flags = { "--max-commits": "maxCommits", "--top": "top" };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--") {
      options.pathspecs = args.slice(i + 1);
      break;
    }
    const key = flags[arg];
    if (!key) throw new UsageError(`unknown argument ${arg}`);
    const value = args[i + 1];
    if (value === undefined || !POSITIVE_INTEGER.test(value)) {
      throw new UsageError(`${arg} needs a positive integer, not ${value ?? "nothing"}`);
    }
    options[key] = Number(value);
    i += 1;
  }
  return options;
}

export function buildGitArgs({ maxCommits, pathspecs }) {
  // :/ is the top level, so a run from a subdirectory still reads the whole repository.
  const scope = pathspecs.length > 0 ? pathspecs : [":/"];
  return {
    topLevel: gitArgv("rev-parse", "--show-toplevel"),
    head: gitArgv("rev-parse", "--verify", "--quiet", "HEAD^{commit}"),
    // diff.relative would print cwd-relative paths; showSignature would add gpg output.
    log: gitArgv(
      "-c",
      "diff.relative=false",
      "-c",
      "log.showSignature=false",
      "log",
      "--no-merges",
      "--no-renames",
      "--name-only",
      "-z",
      "--format=%x00%H",
      `--max-count=${maxCommits}`,
      "HEAD",
      "--",
      ...scope,
    ),
    lsFiles: gitArgv("ls-files", "-z", "--full-name", "--", ...scope),
  };
}

// With -z and --format=%x00%H, each commit is NUL, its hash, NUL, then (when it changed files)
// a newline, each path ending in NUL. No path is empty, so an empty field always starts a commit.
export function parseLog(text) {
  const fields = text.split("\0");
  const commits = [];
  let i = 0;
  while (i < fields.length) {
    if (fields[i] !== "" || i + 1 >= fields.length || fields[i + 1] === "") {
      i += 1;
      continue;
    }
    const commit = { hash: fields[i + 1], files: [] };
    i += 2;
    for (let first = true; i < fields.length && fields[i] !== ""; i += 1, first = false) {
      const path = first ? fields[i].replace(/^\n/, "") : fields[i];
      if (path !== "") commit.files.push(path);
    }
    commits.push(commit);
  }
  return commits;
}

const round = (ratio) => Math.round(ratio * RATIO_SCALE) / RATIO_SCALE;
const byPath = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function splitBulk(commits) {
  const touching = commits.filter((commit) => commit.files.length > 0);
  const scanned = touching.filter((commit) => commit.files.length <= BULK_COMMIT_FILES);
  return { scanned, ignored: touching.length - scanned.length };
}

export function countCommitsPerFile(commits) {
  const counts = new Map();
  for (const commit of commits) {
    for (const path of new Set(commit.files)) counts.set(path, (counts.get(path) ?? 0) + 1);
  }
  return counts;
}

export function hotFiles(commits, top) {
  return [...countCommitsPerFile(commits)]
    .filter(([, count]) => count >= MIN_HOT_COMMITS)
    .sort(([pathA, a], [pathB, b]) => b - a || byPath(pathA, pathB))
    .slice(0, top)
    .map(([path, count]) => ({ path, commits: count, share: round(count / commits.length) }));
}

export function coupledPairs(commits, top) {
  const perFile = countCommitsPerFile(commits);
  const pairs = new Map();
  for (const commit of commits) {
    const files = [...new Set(commit.files)].sort(byPath);
    for (let i = 0; i < files.length; i += 1) {
      for (let j = i + 1; j < files.length; j += 1) {
        if (posix.dirname(files[i]) === posix.dirname(files[j])) continue;
        const key = `${files[i]}\0${files[j]}`;
        pairs.set(key, (pairs.get(key) ?? 0) + 1);
      }
    }
  }
  return [...pairs]
    .filter(([, coChanges]) => coChanges >= MIN_CO_CHANGES)
    .map(([key, coChanges]) => {
      const [a, b] = key.split("\0");
      const confidence = round(coChanges / Math.min(perFile.get(a), perFile.get(b)));
      return { a, b, coChanges, confidence };
    })
    .sort(
      (x, y) =>
        y.coChanges - x.coChanges ||
        y.confidence - x.confidence ||
        byPath(x.a, y.a) ||
        byPath(x.b, y.b),
    )
    .slice(0, top);
}

// BigInt compares prefixes of any length, so a 14-digit timestamp and 0042 both order correctly.
export function sequences(trackedFiles, top) {
  const dirs = new Map();
  for (const path of trackedFiles) {
    const prefix = posix.basename(path).match(DIGIT_PREFIX)?.[0];
    if (!prefix) continue;
    const dir = posix.dirname(path);
    const entry = dirs.get(dir) ?? { dir, files: 0, highest: prefix };
    entry.files += 1;
    if (BigInt(prefix) > BigInt(entry.highest)) entry.highest = prefix;
    dirs.set(dir, entry);
  }
  return [...dirs.values()]
    .filter((entry) => entry.files >= MIN_SEQUENCE_FILES)
    .sort((x, y) => y.files - x.files || byPath(x.dir, y.dir))
    .slice(0, top);
}

export function medianDirsPerCommit(commits) {
  if (commits.length === 0) return 0;
  const counts = commits
    .map((commit) => new Set(commit.files.map((path) => posix.dirname(path))).size)
    .sort((a, b) => a - b);
  const middle = Math.floor(counts.length / 2);
  return counts.length % 2 === 1 ? counts[middle] : (counts[middle - 1] + counts[middle]) / 2;
}

export function summarize({ commit, commits, trackedFiles, top }) {
  const { scanned, ignored } = splitBulk(commits);
  return {
    commit,
    commitsScanned: scanned.length,
    commitsIgnored: ignored,
    hotFiles: hotFiles(scanned, top),
    coupledPairs: coupledPairs(scanned, top),
    sequences: sequences(trackedFiles, top),
    scatter: { medianDirsPerCommit: medianDirsPerCommit(scanned) },
  };
}

async function runGit(args) {
  const child = spawn("git", args, { stdio: ["ignore", "pipe", "pipe"] });
  const closed = new Promise((resolve) => {
    child.on("error", (error) => resolve({ error }));
    child.on("close", (code) => resolve({ code }));
  });
  let stderr = "";
  child.stderr.setEncoding("utf8").on("data", (text) => {
    stderr += text;
  });
  let stdout = "";
  try {
    for await (const text of child.stdout.setEncoding("utf8")) stdout += text;
  } catch (error) {
    child.kill();
    throw error;
  }
  const { code, error } = await closed;
  if (error) throw new ContentionError(`cannot run git: ${error.message}`);
  return { code, stdout, stderr };
}

function forward(stderr) {
  if (stderr) process.stderr.write(stderr.endsWith("\n") ? stderr : `${stderr}\n`);
}

async function git(args) {
  const { code, stdout, stderr } = await runGit(args);
  if (code !== 0) {
    forward(stderr);
    throw new ContentionError(`git ${args.join(" ")} exited ${code}`);
  }
  return stdout;
}

async function readHead(args) {
  const { code, stdout, stderr } = await runGit(args);
  // --quiet makes a missing HEAD a silent exit 1; anything else is a real git failure.
  if (code === 1 && stderr === "") {
    throw new ContentionError("HEAD names no commit: the repository has no commits yet");
  }
  if (code !== 0) {
    forward(stderr);
    throw new ContentionError(`git ${args.join(" ")} exited ${code}`);
  }
  return stdout.trim();
}

async function collect(options) {
  const args = buildGitArgs(options);
  await git(args.topLevel);
  const commit = await readHead(args.head);
  const commits = parseLog(await git(args.log));
  const trackedFiles = (await git(args.lsFiles)).split("\0").filter((path) => path !== "");
  return summarize({ commit, commits, trackedFiles, top: options.top });
}

async function main(args) {
  let options;
  try {
    options = parseArgs(args);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`${SCRIPT}: ${error.message}\n${USAGE}\nsee ${DOC_PATH}\n`);
    return 2;
  }
  let result;
  try {
    result = await collect(options);
  } catch (error) {
    if (!(error instanceof ContentionError)) throw error;
    process.stderr.write(`${SCRIPT}: ${error.message}\nsee ${DOC_PATH}\n`);
    return 1;
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return 0;
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
