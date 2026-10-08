#!/usr/bin/env node

/**
 * Post a reviewing-code report to its PR as one GitHub review, with the event
 * the report's verdict line names, pinned to the reviewed commit, then read
 * the review back.
 *
 *     node "<skill-dir>/scripts/post-review.mjs" <pr-url> <head-sha> <report-file> <at-head|off-head>
 *
 *     import { decideReview } from "<skill-dir>/scripts/post-review.mjs";
 *     const { notPosted, event, notes } = decideReview(facts);
 *
 * `<pr-url>` is `https://<host>/<owner>/<repo>/pull/<n>` on the base
 * repository, matching `PR_URL_PATTERN`. `<head-sha>` is the 40-character
 * commit the reviewer diffed. `<report-file>` holds the report alone, its
 * first line the `**Verdict: ...**` line: the token, optionally after one of
 * the emoji ✅, ❌, or 💬 and a space. The last argument is the at-head
 * flag from Input. Run the script from the reviewed checkout. Requires `gh`
 * on PATH, signed in to `<host>`. Every `gh` call passes `--hostname <host>`,
 * github.com included, so a `GH_HOST` in the environment never redirects the
 * read or the write.
 *
 * Before the GitHub read, a post-time check runs `git rev-parse HEAD` and
 * `git status --porcelain --untracked-files=no` in the working directory. It
 * passes when `HEAD` is `<head-sha>` and no tracked file differs. It skips
 * untracked files, because a test run can create them. A failed `git` call
 * fails the check.
 *
 * The event comes from the verdict token: APPROVE posts `APPROVE`, REQUEST
 * CHANGES posts `REQUEST_CHANGES`, COMMENT posts `COMMENT`. These post
 * `COMMENT` instead:
 *
 *   self-authored   APPROVE or REQUEST CHANGES on the viewer's own PR
 *   auto-merge      APPROVE while auto-merge is on
 *   head-moved      APPROVE when the PR head is no longer `<head-sha>`
 *   off-head        APPROVE when the flag is `off-head` or the post-time
 *                   check fails
 *
 * Stdout, one token line each. The outcome line always comes first:
 *
 *   posted <EVENT> <review-url>    posted and read back
 *   not-posted pr-merged           the PR merged before the post
 *   not-posted pr-closed           the PR closed before the post
 *   not-posted read-failed         stderr names the failure
 *   not-posted gh-unavailable      `gh` could not be run
 *   failed http-<status>           from gh's "(HTTP <status>)" stderr
 *   failed gh-exit-<code>          gh failed with no HTTP status
 *   unverified no-review-id        the POST response names no review id
 *   unverified read-back-failed    the GET of the new review failed
 *   unverified state-mismatch      the review state is not the posted event's
 *   unverified commit-mismatch     the review is not on `<head-sha>`
 *   unverified author-mismatch     the review author is not the viewer
 *   unverified url-mismatch        the review url is not on `<pr-url>`
 *
 * After a `posted`, `failed`, or `unverified` outcome, one note line per
 * downgrade reason, in the order above, then the new head when it moved:
 *
 *   downgraded <APPROVE|REQUEST_CHANGES> <reason>
 *   head-moved <current-sha>
 *
 * No stdout line carries a report byte. Stderr carries gh's own stderr, then
 * `post-review.mjs: <reason>`.
 *
 * Exit codes:
 *
 *   0  posted and read back
 *   1  any other outcome after the argument checks
 *   2  usage fault: a bad argument count, PR URL, SHA, or at-head flag, an
 *      unreadable report file, or a first line that is not a verdict line.
 *      Nothing ran
 *
 * Constraints:
 *
 *   - The body travels on gh's stdin (`-F body=@-`), never in argv.
 *   - GitHub rejects a body of 65,536 characters or more with HTTP 422.
 *   - The PR can merge, close, move its head, or enable auto-merge between
 *     the read and the POST: GitHub has no conditional create-review call.
 *   - The post-time check cannot see an untracked file that predates the
 *     review; only the Input flag covers it.
 *   - Nothing retries. A `gh-exit` failure can follow a review GitHub
 *     accepted, so the caller checks the PR before a rerun.
 */

import { execFile } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const SCRIPT = "post-review.mjs";
const USAGE = `${SCRIPT} <pr-url> <head-sha> <report-file> <at-head|off-head>`;

// The host is a DNS name (at most 253 characters); owner and repository use GitHub's
// 39-character login and 100-character repository-name limits.
const PR_URL_PATTERN = new RegExp(
  "^https://[A-Za-z0-9.-]{1,253}/[A-Za-z0-9._-]{1,39}/[A-Za-z0-9._-]{1,100}/pull/[0-9]+$",
);
const SHA_PATTERN = /^[0-9a-f]{40}$/;
// Only a verdict emoji may precede the token, so `**Verdict: NOT APPROVE**` is no verdict line.
const VERDICT_LINE_PATTERN =
  /^\*\*Verdict: (?:[✅❌💬] )?(APPROVE|REQUEST CHANGES|COMMENT)\*\*\r?$/u;
// `gh api` reports an HTTP error on stderr as `gh: <message> (HTTP <status>)`.
const HTTP_STATUS_PATTERN = /\(HTTP (\d{3})\)/;
const CHECKOUT_FLAGS = new Set(["at-head", "off-head"]);

const VERDICT_EVENTS = {
  APPROVE: "APPROVE",
  "REQUEST CHANGES": "REQUEST_CHANGES",
  COMMENT: "COMMENT",
};
const REVIEW_STATES = {
  APPROVE: "APPROVED",
  REQUEST_CHANGES: "CHANGES_REQUESTED",
  COMMENT: "COMMENTED",
};
const NOT_POSTED_STATES = { MERGED: "pr-merged", CLOSED: "pr-closed" };
const PR_STATES = new Set(["OPEN", ...Object.keys(NOT_POSTED_STATES)]);

const EXIT_OK = 0;
const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;

const PR_FACTS_QUERY = `
query($owner: String!, $repo: String!, $number: Int!) {
  viewer { login }
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      author { login }
      state
      headRefOid
      autoMergeRequest { enabledAt }
    }
  }
}`;

/**
 * `facts`: `{verdict, viewerLogin, authorLogin, state, autoMerge,
 * currentHeadSha, reviewedHeadSha, inputFlag, postTimeCheckPassed}`.
 * `verdict` is a verdict token, `state` is OPEN, MERGED, or CLOSED,
 * `authorLogin` is null for a deleted account, and `inputFlag` is `at-head`
 * or `off-head`. Returns `notPosted` (`pr-merged`, `pr-closed`, or null), the
 * event to post, and the note lines in their fixed order.
 */
export function decideReview(facts) {
  const notPosted = NOT_POSTED_STATES[facts.state];
  if (notPosted) return { notPosted, event: null, notes: [] };

  const verdictEvent = VERDICT_EVENTS[facts.verdict];
  const headMoved = facts.currentHeadSha !== facts.reviewedHeadSha;
  const reasons = downgradeReasons(verdictEvent, facts, headMoved);
  const notes = reasons.map((reason) => `downgraded ${verdictEvent} ${reason}`);
  if (headMoved) notes.push(`head-moved ${facts.currentHeadSha}`);
  return { notPosted: null, event: reasons.length > 0 ? "COMMENT" : verdictEvent, notes };
}

function downgradeReasons(verdictEvent, facts, headMoved) {
  const { viewerLogin, authorLogin, autoMerge, inputFlag, postTimeCheckPassed } = facts;
  const selfAuthored = authorLogin !== null && authorLogin === viewerLogin;
  const offHead = inputFlag === "off-head" || !postTimeCheckPassed;
  const approve = verdictEvent === "APPROVE";
  const reasons = [
    ["self-authored", verdictEvent !== "COMMENT" && selfAuthored],
    ["auto-merge", approve && autoMerge],
    ["head-moved", approve && headMoved],
    ["off-head", approve && offHead],
  ];
  return reasons.filter(([, applies]) => applies).map(([reason]) => reason);
}

// Returns `{ args }` or `{ usage }`, the clause naming the fault.
function parseArguments(argv) {
  if (argv.length !== 4) return { usage: `usage: ${USAGE}` };
  const [prUrl, headSha, reportPath, inputFlag] = argv;
  if (!PR_URL_PATTERN.test(prUrl))
    return { usage: "the PR URL does not match https://<host>/<owner>/<repo>/pull/<n>" };
  if (!SHA_PATTERN.test(headSha))
    return { usage: "the head SHA is not a 40-character lowercase hex commit SHA" };
  if (!CHECKOUT_FLAGS.has(inputFlag))
    return { usage: "the at-head flag is not at-head or off-head" };

  let report;
  try {
    report = readFileSync(reportPath);
  } catch (error) {
    return { usage: `the report file cannot be read (${error.code ?? error.message})` };
  }
  const firstLine = report.toString("utf8").split("\n", 1)[0];
  const verdict = VERDICT_LINE_PATTERN.exec(firstLine)?.[1];
  if (!verdict) return { usage: "the report's first line is not a **Verdict: ...** line" };

  const pullRequest = parsePullRequestUrl(prUrl);
  return { args: { pullRequest, prUrl, headSha, report, verdict, inputFlag } };
}

function parsePullRequestUrl(url) {
  const [, , host, owner, repo, , number] = url.split("/");
  return { host, owner, repo, number: Number(number) };
}

const execFileAsync = promisify(execFile);

// Always ends gh's stdin, so a gh that reads fd 0 never waits for input.
async function runGh(args, input) {
  const pending = execFileAsync("gh", args);
  // A gh that exits before reading its stdin reports that failure through its exit status.
  pending.child.stdin.on("error", () => {});
  pending.child.stdin.end(input);
  try {
    const { stdout } = await pending;
    return { ok: true, stdout };
  } catch (error) {
    const exitCode = typeof error.code === "number" ? error.code : (error.signal ?? error.code);
    return { ok: false, error, exitCode, stderr: error.stderr ?? "" };
  }
}

// A failed `git` call fails the check, so it can only lower an APPROVE.
async function checkoutIsAtHead(headSha) {
  const head = await runGit(["rev-parse", "HEAD"]);
  // --no-optional-locks keeps `git status` from rewriting the index it reads.
  const status = await runGit([
    "--no-optional-locks",
    "status",
    "--porcelain",
    "--untracked-files=no",
  ]);
  return head.ok && status.ok && head.stdout.trim() === headSha && status.stdout === "";
}

async function runGit(args) {
  try {
    const { stdout } = await execFileAsync("git", args);
    return { ok: true, stdout };
  } catch {
    return { ok: false };
  }
}

function parseJsonObject(text) {
  try {
    const value = JSON.parse(text);
    return value !== null && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

const readFailure = (reason) => ({ failure: "read-failed", reason });

async function readPullRequestFacts({ host, owner, repo, number }) {
  const result = await runGh([
    "api",
    "--hostname",
    host,
    "graphql",
    "-f",
    `query=${PR_FACTS_QUERY}`,
    "-f",
    `owner=${owner}`,
    "-f",
    `repo=${repo}`,
    "-F",
    `number=${number}`,
  ]);
  if (!result.ok) {
    if (result.error.code === "ENOENT")
      return { failure: "gh-unavailable", reason: `cannot run gh: ${result.error.message}` };
    process.stderr.write(result.stderr);
    return readFailure(`gh api graphql exited ${result.exitCode}`);
  }

  const response = parseJsonObject(result.stdout);
  if (!response) return readFailure("gh printed output that is not a JSON object");
  if ("errors" in response) return readFailure("the GraphQL response carries errors");
  const viewerLogin = response.data?.viewer?.login;
  const pullRequest = response.data?.repository?.pullRequest;
  if (typeof viewerLogin !== "string") return readFailure("the response has no viewer login");
  if (pullRequest === null || typeof pullRequest !== "object")
    return readFailure("the response has no pull request");
  if (!PR_STATES.has(pullRequest.state))
    return readFailure("the pull request state is not OPEN, MERGED, or CLOSED");
  if (typeof pullRequest.headRefOid !== "string" || !SHA_PATTERN.test(pullRequest.headRefOid))
    return readFailure("the pull request head is not a commit SHA");

  const authorLogin = pullRequest.author?.login;
  return {
    facts: {
      viewerLogin,
      authorLogin: typeof authorLogin === "string" ? authorLogin : null,
      state: pullRequest.state,
      autoMerge: pullRequest.autoMergeRequest != null,
      currentHeadSha: pullRequest.headRefOid,
    },
  };
}

async function postReview({ host, owner, repo, number }, event, headSha, report) {
  const result = await runGh(
    [
      "api",
      "--hostname",
      host,
      "--method",
      "POST",
      `repos/${owner}/${repo}/pulls/${number}/reviews`,
      "-f",
      `event=${event}`,
      "-f",
      `commit_id=${headSha}`,
      "-F",
      "body=@-",
    ],
    report,
  );
  if (result.ok) return { reviewId: parseJsonObject(result.stdout)?.id };

  process.stderr.write(result.stderr);
  const httpStatus = HTTP_STATUS_PATTERN.exec(result.stderr)?.[1];
  return { failed: httpStatus ? `http-${httpStatus}` : `gh-exit-${result.exitCode}` };
}

// Returns `{ reviewUrl }` when the review matches, else `{ unverified }`.
async function readBackReview({ host, owner, repo, number }, reviewId, expected) {
  if (!Number.isSafeInteger(reviewId) || reviewId <= 0) return { unverified: "no-review-id" };
  const result = await runGh([
    "api",
    "--hostname",
    host,
    `repos/${owner}/${repo}/pulls/${number}/reviews/${reviewId}`,
  ]);
  if (!result.ok) process.stderr.write(result.stderr);
  const review = result.ok ? parseJsonObject(result.stdout) : null;
  if (!review) return { unverified: "read-back-failed" };

  const reviewUrlPattern = new RegExp(`^${escapeRegExp(expected.prUrl)}#pullrequestreview-[0-9]+$`);
  if (review.state !== expected.state) return { unverified: "state-mismatch" };
  if (review.commit_id !== expected.headSha) return { unverified: "commit-mismatch" };
  if (review.user?.login !== expected.viewerLogin) return { unverified: "author-mismatch" };
  if (typeof review.html_url !== "string" || !reviewUrlPattern.test(review.html_url))
    return { unverified: "url-mismatch" };
  return { reviewUrl: review.html_url };
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function printLines(lines) {
  for (const line of lines) process.stdout.write(`${line}\n`);
}

async function main(argv) {
  const parsed = parseArguments(argv);
  if (parsed.usage) {
    process.stderr.write(`${SCRIPT}: ${parsed.usage}\n`);
    return EXIT_USAGE;
  }
  const { pullRequest, prUrl, headSha, report, verdict, inputFlag } = parsed.args;

  const postTimeCheckPassed = await checkoutIsAtHead(headSha);
  const read = await readPullRequestFacts(pullRequest);
  if (read.failure) {
    process.stderr.write(`${SCRIPT}: ${read.reason}\n`);
    printLines([`not-posted ${read.failure}`]);
    return EXIT_FAILURE;
  }

  const decision = decideReview({
    ...read.facts,
    verdict,
    reviewedHeadSha: headSha,
    inputFlag,
    postTimeCheckPassed,
  });
  if (decision.notPosted) {
    printLines([`not-posted ${decision.notPosted}`]);
    return EXIT_FAILURE;
  }

  const post = await postReview(pullRequest, decision.event, headSha, report);
  if (post.failed) {
    process.stderr.write(`${SCRIPT}: the review POST failed\n`);
    printLines([`failed ${post.failed}`, ...decision.notes]);
    return EXIT_FAILURE;
  }

  const readBack = await readBackReview(pullRequest, post.reviewId, {
    prUrl,
    headSha,
    state: REVIEW_STATES[decision.event],
    viewerLogin: read.facts.viewerLogin,
  });
  if (readBack.unverified) {
    process.stderr.write(`${SCRIPT}: the posted review did not read back as sent\n`);
    printLines([`unverified ${readBack.unverified}`, ...decision.notes]);
    return EXIT_FAILURE;
  }

  printLines([`posted ${decision.event} ${readBack.reviewUrl}`, ...decision.notes]);
  return EXIT_OK;
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
