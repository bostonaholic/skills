#!/usr/bin/env node

/**
 * Confirms a cast approval landed: the viewer's latest review on the PR is
 * APPROVED at the approval head.
 *
 *     node "<skill-dir>/scripts/verify-approval.mjs" <pr-url> <viewer> <head-sha>
 *
 * `<pr-url>` is the canonical PR URL, `<viewer>` the login from the poll,
 * and `<head-sha>` the full SHA the approval cites. Requires `gh` on PATH,
 * signed in to the host. The read projects `latestReviews` to author login,
 * `state`, `url`, and `commit.oid`; no review body is read.
 *
 * Stdout, on exit 0 and exit 3, one line of JSON:
 *
 *   { "state": "<state>" | null, "url": "<review url>" | null, "commit": "<sha>" | null }
 *
 * describing the viewer's latest review, all null when there is none.
 *
 * Exit codes:
 *
 *   0    the viewer's latest review is APPROVED at `<head-sha>`
 *   1    the read failed; stdout is empty
 *   2    usage fault: wrong arguments, a malformed URL, login, or SHA
 *   3    not approved at that head: stdout shows what the read found
 *   127  `gh` is not on PATH
 */

import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  EXIT_FAILURE,
  EXIT_OK,
  EXIT_USAGE,
  Failure,
  LOGIN_PATTERN,
  SHA_PATTERN,
  parsePrUrl,
  runCli,
  runGh,
} from "./github.mjs";

const SCRIPT = "verify-approval.mjs";
const USAGE = `usage: ${SCRIPT} <pr-url> <viewer> <head-sha>`;
const EXIT_NOT_APPROVED = 3;

export function viewerReview(latestReviews, viewer) {
  const review = latestReviews.find((node) => node?.author?.login === viewer);
  return {
    state: review?.state ?? null,
    url: review?.url ?? null,
    commit: review?.commit?.oid ?? null,
  };
}

function main(argv) {
  if (argv.length !== 3) throw new Failure(EXIT_USAGE, USAGE);
  const [url, viewer, head] = argv;
  parsePrUrl(url);
  if (!LOGIN_PATTERN.test(viewer)) throw new Failure(EXIT_USAGE, `malformed login: ${viewer}`);
  if (!SHA_PATTERN.test(head)) throw new Failure(EXIT_USAGE, `not a full commit SHA: ${head}`);

  const run = runGh([
    "pr",
    "view",
    url,
    "--json",
    "latestReviews",
    "--jq",
    "[.latestReviews[] | {author: {login: .author.login}, state, url, commit: {oid: .commit.oid}}]",
  ]);
  if (run.status !== 0) {
    process.stderr.write(run.stderr);
    throw new Failure(EXIT_FAILURE, `gh pr view exited ${run.status ?? run.signal}`);
  }
  let reviews;
  try {
    reviews = JSON.parse(run.stdout);
  } catch {
    reviews = undefined;
  }
  if (!Array.isArray(reviews)) throw new Failure(EXIT_FAILURE, "gh printed no review list");

  const found = viewerReview(reviews, viewer);
  process.stdout.write(`${JSON.stringify(found)}\n`);
  if (found.state === "APPROVED" && found.commit === head) return EXIT_OK;
  process.stderr.write(`${SCRIPT}: not approved at ${head}\n`);
  return EXIT_NOT_APPROVED;
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  runCli(SCRIPT, main);
}
