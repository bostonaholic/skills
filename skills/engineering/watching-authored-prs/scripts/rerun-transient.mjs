#!/usr/bin/env node

/**
 * Re-runs one failed GitHub Actions job of an authored PR when its saved log
 * shows a known runner or network fault, within the run's attempt bound.
 *
 *     node "<skill-dir>/scripts/rerun-transient.mjs" <pr-url> <head> <job-id> <log-file>
 *
 * `<pr-url>` is `https://<host>/<owner>/<repo>/pull/<n>`, `<head>` the poll's
 * 40-hex head SHA, `<job-id>` the poll's `jobId`, and `<log-file>` the file
 * `ci-log.sh` wrote for that job. Requires `gh` on PATH, signed in to
 * `<host>`; every `gh` call names the host.
 *
 * Steps, stopping at the first that decides:
 *
 *   1. Scan the log for TRANSIENT_SIGNATURES. No match is `not-transient`,
 *      with no `gh` call. A red test is never transient here, flaky or not.
 *   2. Read the job. A `head_sha` other than `<head>` is `head-moved`; a
 *      conclusion other than `failure` is `not-failed`.
 *   3. Read its run. `run_attempt` at MAX_RUN_ATTEMPTS is `rerun-bound`; a
 *      status other than `completed` is `run-in-progress`, because GitHub
 *      re-runs only a finished run.
 *   4. Re-run the job, which starts attempt `run_attempt + 1`.
 *
 * GitHub keeps the attempt count, so it survives a lost transcript.
 *
 * Stdout, on exit 0 only, one line of JSON:
 *
 *   {
 *     "rerun": <bool>,
 *     "reason": null | "not-transient" | "head-moved" | "not-failed" |
 *               "rerun-bound" | "run-in-progress",
 *     "signature": "<signature id>" | null,
 *     "lineNumber": <1-based line of the last matching log line> | null,
 *     "runId": "<digits>" | null,
 *     "attempt": <the run's latest attempt, after any re-run> | null
 *   }
 *
 * Log text never reaches stdout or a command line: report the line by number.
 *
 * Exit codes:
 *
 *   0    decided; stdout holds the verdict
 *   1    a gh read or the re-run request failed or printed malformed output;
 *        gh's stderr is passed through
 *   2    usage fault: a bad argument or an unreadable log file
 *   127  `gh` is not on PATH
 */

import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT = "rerun-transient.mjs";
const USAGE = `${SCRIPT}: usage: ${SCRIPT} <pr-url> <head> <job-id> <log-file>`;
// The skill file that explains each exit code.
const DOC_PATH = fileURLToPath(new URL("../references/ci-rerun.md", import.meta.url));

// Same shape poll.mjs accepts.
const PR_URL_PATTERN =
  /^https:\/\/([A-Za-z0-9.-]{1,253})\/([A-Za-z0-9._-]{1,39})\/([A-Za-z0-9._-]{1,100})\/pull\/([1-9][0-9]*)$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const JOB_ID_PATTERN = /^[0-9]+$/;
// The first attempt plus two re-runs.
const MAX_RUN_ATTEMPTS = 3;
const OUTPUT_LIMIT_BYTES = 16 * 1024 * 1024;

// Faults of the runner or the network, never of the branch's code. Disk-full,
// out-of-memory, and job timeouts are left out: a branch can cause each.
const TRANSIENT_SIGNATURES = [
  ["runner-shutdown", /The runner has received a shutdown signal/],
  ["runner-lost", /The hosted runner: .* lost communication with the server/],
  ["dns", /\bEAI_AGAIN\b|Temporary failure in name resolution/],
  ["network-timeout", /\bE(?:SOCKET)?TIMEDOUT\b|TLS handshake timeout/],
  ["connection-reset", /\bECONNRESET\b|socket hang up|Connection reset by peer/],
  [
    "upstream-5xx",
    /\b(?:502 Bad Gateway|503 Service Unavailable|504 Gateway Time-?out)\b|The requested URL returned error: 50[234]\b/,
  ],
];

const EXIT_OK = 0;
const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;
const EXIT_NO_GH = 127;

class Failure extends Error {
  constructor(exitCode, message) {
    super(message);
    this.exitCode = exitCode;
  }
}

function parseArgs(argv) {
  if (argv.length !== 4 || argv.some((arg) => arg.startsWith("-")))
    throw new Failure(EXIT_USAGE, USAGE);
  const [url, head, jobId, logPath] = argv;
  const match = url.match(PR_URL_PATTERN);
  if (!match) throw new Failure(EXIT_USAGE, `not a PR URL: ${url}`);
  if (!SHA_PATTERN.test(head))
    throw new Failure(EXIT_USAGE, `head is not 40 hex characters: ${head}`);
  if (!JOB_ID_PATTERN.test(jobId))
    throw new Failure(EXIT_USAGE, `job id is not all digits: ${jobId}`);
  const [, host, owner, repo] = match;
  return { pr: { host, owner, repo }, head, jobId, logPath };
}

function readLog(path) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    throw new Failure(EXIT_USAGE, `cannot read log file ${path}: ${error.message}`);
  }
}

// The last matching line, since runners print the failure last.
function matchSignature(log) {
  const lines = log.split("\n");
  for (let i = lines.length - 1; i >= 0; i--)
    for (const [id, pattern] of TRANSIENT_SIGNATURES)
      if (pattern.test(lines[i])) return { signature: id, lineNumber: i + 1 };
  return null;
}

function gh(args, label) {
  const run = spawnSync("gh", args, { encoding: "utf8", maxBuffer: OUTPUT_LIMIT_BYTES });
  if (run.error?.code === "ENOENT") throw new Failure(EXIT_NO_GH, "gh is not on PATH");
  if (run.error) throw new Failure(EXIT_FAILURE, `cannot run gh: ${run.error.message}`);
  if (run.status !== 0) {
    process.stderr.write(run.stderr);
    throw new Failure(EXIT_FAILURE, `${label} exited ${run.status ?? run.signal}`);
  }
  return run.stdout;
}

function readJson(pr, path, label) {
  const text = gh(["api", "--hostname", pr.host, path], label);
  try {
    return JSON.parse(text);
  } catch {
    throw new Failure(EXIT_FAILURE, `${label} printed output that is not JSON`);
  }
}

function decide(argv) {
  const { pr, head, jobId, logPath } = parseArgs(argv);
  const found = matchSignature(readLog(logPath));
  const verdict = (reason, runId = null, attempt = null) => ({
    rerun: reason === null,
    reason,
    signature: found?.signature ?? null,
    lineNumber: found?.lineNumber ?? null,
    runId,
    attempt,
  });
  if (found === null) return verdict("not-transient");

  const base = `repos/${pr.owner}/${pr.repo}/actions`;
  const job = readJson(pr, `${base}/jobs/${jobId}`, "the job read");
  if (!Number.isInteger(job?.run_id) || typeof job.head_sha !== "string")
    throw new Failure(EXIT_FAILURE, "the job read printed no run id or head SHA");
  if (job.head_sha !== head) return verdict("head-moved");
  if (job.conclusion !== "failure") return verdict("not-failed");

  const runId = String(job.run_id);
  const run = readJson(pr, `${base}/runs/${runId}`, "the run read");
  if (!Number.isInteger(run?.run_attempt) || typeof run.status !== "string")
    throw new Failure(EXIT_FAILURE, "the run read printed no attempt or status");
  if (run.run_attempt >= MAX_RUN_ATTEMPTS) return verdict("rerun-bound", runId, run.run_attempt);
  if (run.status !== "completed") return verdict("run-in-progress", runId, run.run_attempt);

  gh(
    ["api", "--hostname", pr.host, "--method", "POST", `${base}/jobs/${jobId}/rerun`],
    "the re-run request",
  );
  return verdict(null, runId, run.run_attempt + 1);
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    process.stdout.write(`${JSON.stringify(decide(process.argv.slice(2)))}\n`);
    process.exitCode = EXIT_OK;
  } catch (error) {
    if (!(error instanceof Failure)) throw error;
    process.stderr.write(
      error.message.startsWith(`${SCRIPT}:`)
        ? `${error.message}\n`
        : `${SCRIPT}: ${error.message}\n`,
    );
    process.stderr.write(`see ${DOC_PATH}\n`);
    process.exitCode = error.exitCode;
  }
}
