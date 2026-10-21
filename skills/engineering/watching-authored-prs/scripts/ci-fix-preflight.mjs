#!/usr/bin/env node

/**
 * Checks that the local checkout may push a CI fix to an authored PR, and
 * reads the files the fix may edit.
 *
 *     node "<skill-dir>/scripts/ci-fix-preflight.mjs" <pr-url> <polled-head>
 *
 * Run it from the PR's checkout. `<pr-url>` is
 * `https://<host>/<owner>/<repo>/pull/<n>`; `<polled-head>` is the 40-hex head
 * SHA the cycle's poll printed. Requires `git` and `gh` on PATH, `gh` signed in
 * to `<host>`. PR fields (`headRefName`, the head repository) are compared in
 * this script and never reach a command line; only local values do.
 *
 * Checks, in order, stopping at the first that fails:
 *
 *   head-mismatch            local HEAD is not `<polled-head>`
 *   dirty-worktree           `git status --porcelain` prints anything
 *   detached-head            HEAD is not on a branch
 *   head-moved               the PR head is no longer `<polled-head>`, before
 *                            or after the file-list read
 *   branch-name              the branch name is not `headRefName`
 *   no-upstream              the branch has no upstream remote
 *   upstream-ref             the upstream ref is not `refs/heads/<headRefName>`
 *   push-remote              the push remote is not the upstream remote
 *   push-refspec             the remote has a `push` refspec
 *   mirror                   the remote is a mirror
 *   push-default             `push.default` is set to other than `simple`,
 *                            `upstream`, or `current`
 *   head-repository-missing  the PR's head repository is gone
 *   push-url-count           the remote has other than exactly one push URL
 *   push-url                 the push URL does not name
 *                            `<headRepositoryOwner>/<headRepository>` on
 *                            `<host>` (HTTPS or SSH, `.git` optional,
 *                            case-insensitive)
 *
 * Then it reads the PR file list (`pulls/<n>/files`, paginated) and reads the
 * PR head once more.
 *
 * Stdout, on exit 0 only, one line of JSON:
 *
 *   { "binding": "ok", "editable": [ "<path>", ... ] }   sorted; every file
 *                                                         whose status is not
 *                                                         `removed`
 *   { "binding": "fail", "condition": "<a check name above>" }
 *
 * Exit codes:
 *
 *   0  a verdict is printed
 *   1  a read failed or printed something unparseable, or the file list has
 *      MAX_FILES entries or more and may be truncated; stderr names it
 *   2  usage fault: wrong arguments, a malformed URL or SHA
 *   127  `git` or `gh` is not on PATH
 */

import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SCRIPT = "ci-fix-preflight.mjs";
const USAGE = `${SCRIPT}: usage: ${SCRIPT} <pr-url> <polled-head>`;

// Same shape poll.mjs and fetch-pr-feedback.mjs accept.
const PR_URL_PATTERN =
  /^https:\/\/([A-Za-z0-9.-]{1,253})\/([A-Za-z0-9._-]{1,39})\/([A-Za-z0-9._-]{1,100})\/pull\/([1-9][0-9]*)$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
// GitHub's pulls/<n>/files endpoint returns at most 3000 files, so a list that
// long may be truncated.
const MAX_FILES = 3000;
// git's documented push.default values that push the current branch to its
// upstream name; `matching` and `nothing` do not.
// 3000 file entries of short JSON lines stay far under 64 MiB; spawnSync's 1 MiB default may not.
const OUTPUT_LIMIT_BYTES = 64 * 1024 * 1024;
const SAFE_PUSH_DEFAULTS = new Set(["simple", "upstream", "current"]);
// Push URL forms: https://[user@]host/owner/repo[.git], ssh://[user@]host[:port]/owner/repo[.git],
// and the scp-like [user@]host:owner/repo[.git].
const PUSH_URL_PATTERNS = [
  /^https:\/\/(?:[^@/]+@)?([^/:]+)(?::[0-9]+)?\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i,
  /^ssh:\/\/(?:[^@/]+@)?([^/:]+)(?::[0-9]+)?\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i,
  /^(?:[^@/:]+@)?([^/:]+):([^/]+)\/([^/]+?)(?:\.git)?\/?$/i,
];

const EXIT_OK = 0;
const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;
const EXIT_NO_TOOL = 127;

class Failure extends Error {
  constructor(exitCode, message) {
    super(message);
    this.exitCode = exitCode;
  }
}

class Verdict extends Error {
  constructor(condition) {
    super(condition);
    this.condition = condition;
  }
}

function spawn(command, args) {
  const run = spawnSync(command, args, { encoding: "utf8", maxBuffer: OUTPUT_LIMIT_BYTES });
  if (run.error?.code === "ENOENT") throw new Failure(EXIT_NO_TOOL, `${command} is not on PATH`);
  if (run.error) throw new Failure(EXIT_FAILURE, `cannot run ${command}: ${run.error.message}`);
  return run;
}

function mustRun(command, args) {
  const run = spawn(command, args);
  if (run.status !== 0) {
    process.stderr.write(run.stderr);
    throw new Failure(EXIT_FAILURE, `${command} ${args[0]} exited ${run.status ?? run.signal}`);
  }
  return run.stdout;
}

// git config --get exits 1 when the key is unset; any other non-zero status is a failure.
function gitConfig(args) {
  const run = spawn("git", ["config", ...args]);
  if (run.status === 1) return [];
  if (run.status !== 0) {
    process.stderr.write(run.stderr);
    throw new Failure(EXIT_FAILURE, `git config exited ${run.status ?? run.signal}`);
  }
  return run.stdout.split("\n").filter(Boolean);
}

function readPr(pr, fields) {
  const text = mustRun("gh", [
    "pr",
    "view",
    pr.number,
    "--repo",
    `${pr.host}/${pr.owner}/${pr.repo}`,
    "--json",
    fields,
  ]);
  try {
    return JSON.parse(text);
  } catch {
    throw new Failure(EXIT_FAILURE, "gh pr view printed output that is not JSON");
  }
}

function checkBinding(pr, polledHead) {
  if (mustRun("git", ["rev-parse", "HEAD"]).trim() !== polledHead)
    throw new Verdict("head-mismatch");
  if (mustRun("git", ["status", "--porcelain"]) !== "") throw new Verdict("dirty-worktree");
  const branchRun = spawn("git", ["symbolic-ref", "-q", "--short", "HEAD"]);
  if (branchRun.status === 1) throw new Verdict("detached-head");
  if (branchRun.status !== 0)
    throw new Failure(EXIT_FAILURE, `git symbolic-ref exited ${branchRun.status}`);
  const branch = branchRun.stdout.trim();

  const view = readPr(pr, "headRefOid,headRefName,headRepository,headRepositoryOwner");
  if (view?.headRefOid !== polledHead) throw new Verdict("head-moved");
  if (branch !== view.headRefName) throw new Verdict("branch-name");

  const [remote = "", remoteRef = "", pushRemote = ""] = mustRun("git", [
    "for-each-ref",
    "--format=%(upstream:remotename)%00%(upstream:remoteref)%00%(push:remotename)",
    `refs/heads/${branch}`,
  ])
    .replace(/\n$/, "")
    .split("\0");
  if (remote === "") throw new Verdict("no-upstream");
  if (remoteRef !== `refs/heads/${view.headRefName}`) throw new Verdict("upstream-ref");
  if (pushRemote !== remote) throw new Verdict("push-remote");
  if (gitConfig(["--get-all", `remote.${remote}.push`]).length > 0)
    throw new Verdict("push-refspec");
  if (gitConfig(["--bool", "--get", `remote.${remote}.mirror`])[0] === "true")
    throw new Verdict("mirror");
  const pushDefault = gitConfig(["--get", "push.default"])[0];
  if (pushDefault !== undefined && !SAFE_PUSH_DEFAULTS.has(pushDefault))
    throw new Verdict("push-default");

  const owner = view.headRepositoryOwner?.login;
  const name = view.headRepository?.name;
  if (typeof owner !== "string" || typeof name !== "string")
    throw new Verdict("head-repository-missing");
  const urls = mustRun("git", ["remote", "get-url", "--push", "--all", remote])
    .split("\n")
    .filter(Boolean);
  if (urls.length !== 1) throw new Verdict("push-url-count");
  const parts = PUSH_URL_PATTERNS.map((pattern) => urls[0].match(pattern)).find(Boolean);
  const same = (a, b) => a.toLowerCase() === b.toLowerCase();
  if (!parts || !same(parts[1], pr.host) || !same(parts[2], owner) || !same(parts[3], name))
    throw new Verdict("push-url");
}

function readEditable(pr, polledHead) {
  const text = mustRun("gh", [
    "api",
    "--hostname",
    pr.host,
    "--paginate",
    `repos/${pr.owner}/${pr.repo}/pulls/${pr.number}/files`,
    "--jq",
    ".[] | {filename, status}",
  ]);
  const files = text
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    });
  if (files.some((file) => typeof file?.filename !== "string" || typeof file.status !== "string"))
    throw new Failure(EXIT_FAILURE, "the PR file list is unparseable");
  if (files.length >= MAX_FILES)
    throw new Failure(
      EXIT_FAILURE,
      `the PR file list has ${files.length} entries and may be truncated`,
    );
  if (readPr(pr, "headRefOid")?.headRefOid !== polledHead) throw new Verdict("head-moved");
  return [...new Set(files.filter((f) => f.status !== "removed").map((f) => f.filename))].sort();
}

function preflight(argv) {
  if (argv.length !== 2) throw new Failure(EXIT_USAGE, USAGE);
  const [url, polledHead] = argv;
  const match = url.match(PR_URL_PATTERN);
  if (!match) throw new Failure(EXIT_USAGE, `not a PR URL: ${url}`);
  if (!SHA_PATTERN.test(polledHead))
    throw new Failure(EXIT_USAGE, `polled head is not 40 hex characters: ${polledHead}`);
  const [, host, owner, repo, number] = match;
  const pr = { host, owner, repo, number };
  try {
    checkBinding(pr, polledHead);
    return { binding: "ok", editable: readEditable(pr, polledHead) };
  } catch (error) {
    if (error instanceof Verdict) return { binding: "fail", condition: error.condition };
    throw error;
  }
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    process.stdout.write(`${JSON.stringify(preflight(process.argv.slice(2)))}\n`);
    process.exitCode = EXIT_OK;
  } catch (error) {
    if (!(error instanceof Failure)) throw error;
    process.stderr.write(
      error.message.startsWith(`${SCRIPT}:`)
        ? `${error.message}\n`
        : `${SCRIPT}: ${error.message}\n`,
    );
    process.exitCode = error.exitCode;
  }
}
