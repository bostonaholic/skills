#!/usr/bin/env node

/**
 * Confirms a cast approval landed: the viewer's latest submitted review on the
 * PR is APPROVED at the approval head.
 *
 *     node "<skill-dir>/scripts/verify-approval.mjs" <pr-url> <viewer> <head-sha>
 *
 * `<pr-url>` is the canonical PR URL, `<viewer>` the login from the poll,
 * and `<head-sha>` the full SHA the approval cites. Requires `gh` on PATH,
 * signed in to the host. The read is `gh api graphql --hostname <host>` on
 * the PR's `reviews` connection, selecting each review's author login,
 * `state`, `url`, `submittedAt`, and `commit.oid`; no review body is read.
 * It reads forward 100 reviews a page, at most 10 pages. gh's own
 * `pr view --json latestReviews` prints an empty `commit.oid` and no `url`,
 * so the script does not read it.
 *
 * The viewer's latest submitted review is the viewer's non-PENDING review
 * with the latest `submittedAt`; on a tie, the later one in connection order.
 * A review whose author is null (a deleted account) is not the viewer's.
 *
 * Stdout, on exit 0 and exit 3, one line of JSON:
 *
 *   { "state": "<state>" | null, "url": "<review url>" | null, "commit": "<sha>" | null }
 *
 * describing the viewer's latest submitted review, all null when there is none.
 *
 * Exit codes:
 *
 *   0    the viewer's latest submitted review is APPROVED at `<head-sha>`
 *   1    the read failed or was incomplete; stdout is empty
 *   2    usage fault: wrong arguments, a malformed URL, login, or SHA
 *   3    the viewer's latest submitted review is absent, in another state, or
 *        at another commit; stdout shows what the read found
 *   127  `gh` is not on PATH
 */

import { realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
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
// The skill file that explains each exit code.
const DOC_PATH = fileURLToPath(new URL("../references/approve.md", import.meta.url));
const USAGE = `usage: ${SCRIPT} <pr-url> <viewer> <head-sha>`;
const EXIT_NOT_APPROVED = 3;
// GitHub's GraphQL maximum for `first`.
const PAGE_SIZE = 100;
// 10 pages cap the read at 1,000 reviews, so a huge PR fails closed instead of
// reading without bound.
const MAX_PAGES = 10;
const QUERY = `query($owner: String!, $repo: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviews(first: ${PAGE_SIZE}, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { author { login } state url submittedAt commit { oid } }
      }
    }
  }
}`;

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function readReviewsPage(host, owner, repo, number, after) {
  const args = ["api", "graphql", "--hostname", host, "-f", `query=${QUERY}`];
  args.push("-f", `owner=${owner}`, "-f", `repo=${repo}`, "-F", `number=${number}`);
  if (after !== null) args.push("-f", `after=${after}`);
  const run = runGh(args);
  if (run.status !== 0) {
    process.stderr.write(run.stderr);
    throw new Failure(EXIT_FAILURE, `gh api graphql exited ${run.status ?? run.signal}`);
  }
  let response;
  try {
    response = JSON.parse(run.stdout);
  } catch {
    throw new Failure(EXIT_FAILURE, "gh printed output that is not JSON");
  }
  if (!isObject(response)) throw new Failure(EXIT_FAILURE, "gh printed JSON that is not an object");
  if ("errors" in response) {
    const messages = Array.isArray(response.errors)
      ? response.errors
          .map((error) => error?.message)
          .filter((message) => typeof message === "string")
      : [];
    throw new Failure(
      EXIT_FAILURE,
      `GraphQL errors: ${messages.length ? messages.join("; ") : "no message"}`,
    );
  }
  const pullRequest = response.data?.repository?.pullRequest;
  if (!isObject(pullRequest)) throw new Failure(EXIT_FAILURE, "the read found no pull request");
  const page = pullRequest.reviews;
  if (!isObject(page)) throw new Failure(EXIT_FAILURE, "the read returned no reviews");
  const { pageInfo, nodes } = page;
  if (!Array.isArray(nodes) || typeof pageInfo?.hasNextPage !== "boolean")
    throw new Failure(EXIT_FAILURE, "a reviews page is malformed");
  if (pageInfo.hasNextPage && typeof pageInfo.endCursor !== "string")
    throw new Failure(EXIT_FAILURE, "a reviews page has more pages but no cursor");
  if (!nodes.every(isObject)) throw new Failure(EXIT_FAILURE, "a review node is not an object");
  return page;
}

function readAllReviews(host, owner, repo, number) {
  const nodes = [];
  let after = null;
  for (let pagesRead = 1; ; pagesRead++) {
    const page = readReviewsPage(host, owner, repo, number, after);
    nodes.push(...page.nodes);
    if (!page.pageInfo.hasNextPage) return nodes;
    if (pagesRead === MAX_PAGES)
      throw new Failure(EXIT_FAILURE, `incomplete: reviews has more than ${MAX_PAGES} pages`);
    after = page.pageInfo.endCursor;
  }
}

export function viewerReview(nodes, viewer) {
  let latest = null;
  let latestTime = -Infinity;
  for (const node of nodes) {
    if (!("author" in node)) throw new Failure(EXIT_FAILURE, "a review has no author field");
    if (node.author === null) continue;
    if (!isObject(node.author) || typeof node.author.login !== "string" || node.author.login === "")
      throw new Failure(EXIT_FAILURE, "a review author has no login");
    if (node.author.login !== viewer) continue;
    if (typeof node.state !== "string")
      throw new Failure(EXIT_FAILURE, "a viewer review has no state");
    if (node.state === "PENDING") continue;
    const time = typeof node.submittedAt === "string" ? Date.parse(node.submittedAt) : NaN;
    if (Number.isNaN(time)) throw new Failure(EXIT_FAILURE, "a viewer review has no submittedAt");
    if (time >= latestTime) {
      latest = node;
      latestTime = time;
    }
  }
  return {
    state: latest?.state ?? null,
    url: latest?.url ?? null,
    commit: latest?.commit?.oid ?? null,
  };
}

function main(argv) {
  if (argv.length !== 3) throw new Failure(EXIT_USAGE, USAGE);
  const [url, viewer, head] = argv;
  const { host, owner, repo, number } = parsePrUrl(url);
  if (!LOGIN_PATTERN.test(viewer)) throw new Failure(EXIT_USAGE, `malformed login: ${viewer}`);
  if (!SHA_PATTERN.test(head)) throw new Failure(EXIT_USAGE, `not a full commit SHA: ${head}`);

  const found = viewerReview(readAllReviews(host, owner, repo, number), viewer);
  if (found.state === "APPROVED") {
    if (typeof found.url !== "string" || found.url === "")
      throw new Failure(EXIT_FAILURE, "approved review has no url");
    if (typeof found.commit !== "string" || !SHA_PATTERN.test(found.commit))
      throw new Failure(EXIT_FAILURE, "approved review has no commit");
  }
  process.stdout.write(`${JSON.stringify(found)}\n`);
  if (found.state === "APPROVED" && found.commit === head) return EXIT_OK;
  throw new Failure(EXIT_NOT_APPROVED, `not approved at ${head}`);
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  runCli(SCRIPT, DOC_PATH, main);
}
