#!/usr/bin/env node

/**
 * Waits for a PR's CI to finish, then decides from GitHub's merge state
 * whether the PR may be merged now.
 *
 *     node "<skill-dir>/scripts/ci-gate.mjs" <pr-url> [--cap-seconds <s>]
 *
 * `<pr-url>` is `https://<host>/<owner>/<repo>/pull/<n>`. `--cap-seconds`
 * bounds the whole run (default 1800). Requires `gh` on PATH, signed in to
 * `<host>`. `CI_GATE_POLL_SECONDS` overrides the settle poll interval
 * (default 5) so tests can run without waiting.
 *
 * Steps:
 *
 *   1. Settle: poll `gh pr view` until the merge state is not UNKNOWN and at
 *      least one check has attached, or SETTLE_POLLS polls pass. Zero checks
 *      after that means no CI, and the watch is skipped.
 *   2. Watch: `gh pr checks --watch --fail-fast`, killed at the cap. Its
 *      exit 0 is not the verdict: it exits once nothing is pending right now,
 *      which can be before a gated job spawns. When it fails while the head
 *      has no checks, as a head pushed moments ago does, settle and watch
 *      once more; still no checks is fail.
 *   3. Gate on `mergeStateStatus`:
 *      CLEAN, HAS_HOOKS  read the compare API's behind_by, since GitHub
 *                        reports BEHIND only when branch protection requires
 *                        an up-to-date branch. 0 is merge. Above 0 is enqueue
 *                        when GraphQL's PullRequest.isMergeQueueEnabled says
 *                        the base has a merge queue, which tests the PR
 *                        against the latest base itself; otherwise rebase
 *      BEHIND            rebase
 *      UNSTABLE          watch once more and re-read; a second UNSTABLE is
 *                        unstable
 *      UNKNOWN           re-read once
 *      anything else     stop, named in STATUS
 *
 * Stdout, one KEY=VALUE line each, in this order, each printed only when
 * known:
 *
 *   VERDICT=merge|enqueue|rebase|unstable|fail|timeout|stop|error
 *   STATUS=<mergeStateStatus>
 *   HEAD=<headRefOid>          the oid to pass to merge.sh
 *   BEHIND_BY=<n>              from the compare API
 *   FAILED=<check name>        one line per failing check, on fail
 *
 * Exit codes:
 *
 *   0    merge: the gate passed
 *   1    fail: a check failed (FAILED names it, or none when gh lists none),
 *        or no check attached to the head after the wait
 *   2    usage: wrong arguments or a malformed URL. Nothing ran
 *   3    stop: a merge state the gate does not merge on, such as BLOCKED,
 *        DIRTY, or DRAFT, or UNKNOWN twice
 *   4    error: a gh read failed or printed malformed JSON; stderr names it
 *   10   rebase: the base moved
 *   11   unstable: UNSTABLE twice
 *   12   enqueue: the base moved, but its merge queue retests the PR against
 *        it, so merge.sh can queue this head
 *   124  timeout: the cap passed before CI finished
 *   127  gh is missing
 */

import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT = "ci-gate.mjs";
// The skill file that explains each exit code.
const DOC_PATH = fileURLToPath(new URL("../SKILL.md", import.meta.url));
const USAGE = `${SCRIPT}: usage: ${SCRIPT} https://<host>/<owner>/<repo>/pull/<n> [--cap-seconds <s>]\n`;

const PR_URL_PATTERN = /^https:\/\/([^/]+)\/([^/]+)\/([^/]+)\/pull\/([0-9]+)$/;
// Thirty minutes covers a full CI run on most projects; a longer wait usually means a
// stuck runner, which a person should look at.
const DEFAULT_CAP_SECONDS = 1800;
// Checks attach within a minute of a push: 12 polls 5 seconds apart.
const SETTLE_POLLS = 12;
const DEFAULT_POLL_SECONDS = 5;
// gh's own refresh while watching. Thirty seconds keeps API use low on a long run.
const WATCH_INTERVAL_SECONDS = 30;

const EXIT = {
  merge: 0,
  fail: 1,
  usage: 2,
  stop: 3,
  error: 4,
  rebase: 10,
  unstable: 11,
  enqueue: 12,
  timeout: 124,
  missing: 127,
};

class GateError extends Error {
  constructor(verdict, message) {
    super(message);
    this.verdict = verdict;
  }
}

function runGh(args, { deadline = Infinity, captureStdout = true } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("gh", args, {
      stdio: ["ignore", captureStdout ? "pipe" : "ignore", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout?.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    const remaining = deadline - Date.now();
    const timer = Number.isFinite(deadline)
      ? setTimeout(
          () => {
            timedOut = true;
            child.kill("SIGTERM");
          },
          Math.max(remaining, 0),
        )
      : null;
    child.on("error", (error) => {
      clearTimeout(timer);
      if (error.code === "ENOENT") reject(new GateError("missing", "missing required tool: gh"));
      else reject(new GateError("error", `cannot run gh: ${error.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

// Writes a failed tool's stderr unaltered, ending it with a newline so the script's
// own line starts on a line of its own.
function writeToolError(text) {
  if (!text) return;
  process.stderr.write(text.endsWith("\n") ? text : `${text}\n`);
}

async function ghJson(args) {
  const result = await runGh(args);
  if (result.code !== 0) {
    process.stderr.write(result.stderr);
    throw new GateError("error", `gh ${args.slice(0, 2).join(" ")} exited ${result.code}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new GateError(
      "error",
      `gh ${args.slice(0, 2).join(" ")} printed output that is not JSON`,
    );
  }
}

function readPr(url, fields) {
  return ghJson(["pr", "view", url, "--json", fields]);
}

const SETTLE_FIELDS = "mergeStateStatus,statusCheckRollup";

async function settle(url, pollSeconds) {
  let view;
  for (let poll = 1; poll <= SETTLE_POLLS; poll++) {
    view = await readPr(url, SETTLE_FIELDS);
    const checks = view.statusCheckRollup ?? [];
    if (view.mergeStateStatus !== "UNKNOWN" && checks.length > 0) return checks.length;
    if (poll < SETTLE_POLLS) await sleep(pollSeconds * 1000);
  }
  return (view.statusCheckRollup ?? []).length;
}

// Resolves when CI finished green; throws a GateError for a failure or the cap.
async function watch(url, { deadline, pollSeconds }, { retryWithoutChecks = true } = {}) {
  const result = await runGh(
    ["pr", "checks", url, "--watch", "--fail-fast", "--interval", String(WATCH_INTERVAL_SECONDS)],
    { deadline, captureStdout: false },
  );
  if (result.timedOut) throw new GateError("timeout", "CI wait timed out");
  if (result.code === 0) return;
  // A push between the settle and the watch leaves a new head that GitHub has not
  // attached checks to yet, and gh pr checks fails on a head with none.
  if (((await readPr(url, SETTLE_FIELDS)).statusCheckRollup ?? []).length === 0) {
    if (retryWithoutChecks && (await settle(url, pollSeconds)) > 0) {
      return watch(url, { deadline, pollSeconds }, { retryWithoutChecks: false });
    }
    writeToolError(result.stderr);
    throw new GateError("fail", "no checks reported on the PR head after waiting for them");
  }
  process.stderr.write(result.stderr);
  // `gh pr checks --json` exits nonzero while a check fails or is pending, so read
  // stdout whatever the exit code.
  const listed = await runGh(["pr", "checks", url, "--json", "name,bucket"]);
  let failed = [];
  try {
    failed = JSON.parse(listed.stdout)
      .filter((check) => check.bucket === "fail" || check.bucket === "cancel")
      .map((check) => check.name);
  } catch {
    writeToolError(listed.stderr);
    process.stderr.write(`${SCRIPT}: could not list the failing checks\n`);
  }
  const error = new GateError("fail", `gh pr checks --watch exited ${result.code}`);
  error.failed = failed;
  throw error;
}

async function behindBy({ host, owner, repo }, base, head) {
  const result = await runGh([
    "api",
    "--hostname",
    host,
    `repos/${owner}/${repo}/compare/${base}...${head}`,
    "--jq",
    ".behind_by",
  ]);
  const count = result.stdout.trim();
  if (result.code !== 0 || !/^[0-9]+$/.test(count)) {
    process.stderr.write(result.stderr);
    throw new GateError("error", `could not read how far ${head} is behind ${base}`);
  }
  return Number(count);
}

async function mergeQueueEnabled({ host, owner, repo, number }) {
  const result = await runGh([
    "api",
    "graphql",
    "--hostname",
    host,
    "-f",
    "query=query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { pullRequest(number: $number) { isMergeQueueEnabled } } }",
    "-f",
    `owner=${owner}`,
    "-f",
    `name=${repo}`,
    "-F",
    `number=${number}`,
    "--jq",
    ".data.repository.pullRequest.isMergeQueueEnabled",
  ]);
  const enabled = result.stdout.trim();
  if (result.code !== 0 || !["true", "false"].includes(enabled)) {
    writeToolError(result.stderr);
    throw new GateError("error", `could not read whether PR #${number}'s base has a merge queue`);
  }
  return enabled === "true";
}

async function gate(pullRequest, { deadline, pollSeconds }, report) {
  const timing = { deadline, pollSeconds };
  const checks = await settle(pullRequest.url, pollSeconds);
  if (checks > 0) await watch(pullRequest.url, timing);

  let unknownSeen = false;
  let unstableSeen = false;
  for (;;) {
    const view = await readPr(pullRequest.url, "mergeStateStatus,headRefOid,baseRefName");
    report.STATUS = view.mergeStateStatus;
    report.HEAD = view.headRefOid;
    switch (view.mergeStateStatus) {
      case "CLEAN":
      case "HAS_HOOKS":
        report.BEHIND_BY = await behindBy(pullRequest, view.baseRefName, view.headRefOid);
        if (report.BEHIND_BY === 0) return "merge";
        return (await mergeQueueEnabled(pullRequest)) ? "enqueue" : "rebase";
      case "BEHIND":
        return "rebase";
      case "UNSTABLE":
        if (unstableSeen) return "unstable";
        unstableSeen = true;
        await watch(pullRequest.url, timing);
        break;
      case "UNKNOWN":
        if (unknownSeen) return "stop";
        unknownSeen = true;
        break;
      default:
        return "stop";
    }
  }
}

function parseArgs(argv) {
  const [url, ...rest] = argv;
  const match = PR_URL_PATTERN.exec(url ?? "");
  if (!match) return null;
  let capSeconds = DEFAULT_CAP_SECONDS;
  if (rest.length === 2 && rest[0] === "--cap-seconds" && /^[0-9]+$/.test(rest[1])) {
    capSeconds = Number(rest[1]);
  } else if (rest.length !== 0) {
    return null;
  }
  const [, host, owner, repo, number] = match;
  return { pullRequest: { url, host, owner, repo, number }, capSeconds };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(argv) {
  const args = parseArgs(argv);
  const pollSeconds = Number(process.env.CI_GATE_POLL_SECONDS ?? DEFAULT_POLL_SECONDS);
  if (!args || !Number.isFinite(pollSeconds) || pollSeconds < 0) {
    process.stderr.write(USAGE);
    process.stderr.write(`see ${DOC_PATH}\n`);
    return EXIT.usage;
  }
  const deadline = Date.now() + args.capSeconds * 1000;
  const report = {};
  let verdict;
  let failed = [];
  try {
    verdict = await gate(args.pullRequest, { deadline, pollSeconds }, report);
  } catch (error) {
    if (!(error instanceof GateError)) throw error;
    process.stderr.write(`${SCRIPT}: ${error.message}\n`);
    process.stderr.write(`see ${DOC_PATH}\n`);
    verdict = error.verdict;
    failed = error.failed ?? [];
  }
  const lines = [`VERDICT=${verdict === "missing" ? "error" : verdict}`];
  for (const key of ["STATUS", "HEAD", "BEHIND_BY"]) {
    if (report[key] !== undefined) lines.push(`${key}=${report[key]}`);
  }
  for (const name of failed) lines.push(`FAILED=${name}`);
  process.stdout.write(`${lines.join("\n")}\n`);
  return EXIT[verdict];
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
