/**
 * GitHub reads shared by this skill's scripts. Not a CLI.
 *
 *     import { fetchFeedback, runGh, runCli, Failure } from "./github.mjs";
 *
 * `fetchFeedback(url, { bodies })` runs `../shared/scripts/fetch-pr-feedback.mjs`
 * on a canonical PR URL and returns its parsed JSON; its exit 1, 2, and 127
 * become a `Failure` with the same exit code. `runGh(args)` runs `gh` and
 * returns the `spawnSync` result, throwing exit 127 when `gh` is not on PATH.
 * `runCli(script, main)` runs `main(argv)` and maps a `Failure` to its exit
 * code and one `<script>: <reason>` line on stderr.
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Owner and repository use GitHub's 39-character login and 100-character
// repository-name limits; a DNS name is at most 253 characters.
export const PR_URL_PATTERN =
  /^https:\/\/([A-Za-z0-9.-]{1,253})\/([A-Za-z0-9._-]{1,39})\/([A-Za-z0-9._-]{1,100})\/pull\/([1-9][0-9]*)$/;
// A full commit SHA: 40 hex digits for SHA-1, 64 for SHA-256 repositories.
export const SHA_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
// GitHub logins: 1 to 39 alphanumerics or hyphens; `[bot]` marks an app account.
export const LOGIN_PATTERN = /^[A-Za-z0-9-]{1,39}(?:\[bot\])?$/;

export const EXIT_OK = 0;
export const EXIT_FAILURE = 1;
export const EXIT_USAGE = 2;
export const EXIT_NO_GH = 127;

// The fetch prints every comment body on a large PR in one line; 256 MiB
// matches the fetch script's own limit on what gh may print to it.
const OUTPUT_LIMIT_BYTES = 256 * 1024 * 1024;
const FETCH_SCRIPT = fileURLToPath(
  new URL("../shared/scripts/fetch-pr-feedback.mjs", import.meta.url),
);

export class Failure extends Error {
  constructor(exitCode, message) {
    super(message);
    this.exitCode = exitCode;
  }
}

export function parsePrUrl(url) {
  const match = typeof url === "string" ? url.match(PR_URL_PATTERN) : null;
  if (!match) throw new Failure(EXIT_USAGE, `not a canonical PR URL: ${url}`);
  const [, host, owner, repo, number] = match;
  return { host, owner, repo, number: Number(number) };
}

export function runGh(args) {
  const run = spawnSync("gh", args, { encoding: "utf8", maxBuffer: OUTPUT_LIMIT_BYTES });
  if (run.error?.code === "ENOENT") throw new Failure(EXIT_NO_GH, "gh is not on PATH");
  if (run.error) throw new Failure(EXIT_FAILURE, `cannot run gh: ${run.error.message}`);
  return run;
}

export function fetchFeedback(url, { bodies }) {
  const { host } = parsePrUrl(url);
  const args = [FETCH_SCRIPT, url, "--hostname", host, ...(bodies ? [] : ["--no-bodies"])];
  const run = spawnSync(process.execPath, args, {
    encoding: "utf8",
    maxBuffer: OUTPUT_LIMIT_BYTES,
  });
  if (run.error)
    throw new Failure(EXIT_FAILURE, `cannot run the feedback fetch: ${run.error.message}`);
  if (run.status !== 0) {
    process.stderr.write(run.stderr);
    const code = [EXIT_USAGE, EXIT_NO_GH].includes(run.status) ? run.status : EXIT_FAILURE;
    throw new Failure(code, `the feedback fetch exited ${run.status ?? run.signal}`);
  }
  try {
    return JSON.parse(run.stdout);
  } catch {
    throw new Failure(EXIT_FAILURE, "the feedback fetch printed output that is not JSON");
  }
}

export function runCli(script, main) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof Failure)) throw error;
    process.stderr.write(`${script}: ${error.message}\n`);
    process.exitCode = error.exitCode;
  }
}
