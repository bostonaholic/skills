#!/usr/bin/env node

/**
 * Re-request review from each reviewer whose latest opinionated review is
 * CHANGES_REQUESTED, but only when no feedback on the PR awaits a response.
 *
 *     node "<skill-dir>/scripts/re-request-review.mjs" "<pr-url>"
 *
 *     import { deriveReRequest } from "<skill-dir>/scripts/re-request-review.mjs";
 *     const { lines, logins } = deriveReRequest(reviewState, pullRequest);
 *
 * `<pr-url>` is `https://<host>/<owner>/<repo>/pull/<n>` on the base
 * repository, matching `PR_URL_PATTERN`. Requires `gh` on PATH, signed in to
 * `<host>`. Every `gh` call passes `--hostname <host>`, github.com included,
 * so a `GH_HOST` in the environment never redirects the read or the write.
 *
 * The script reads GitHub state itself and keeps no local state:
 * `reviewRequests` is the idempotency record, so a reviewer already requested
 * is never notified twice.
 *
 * Stdout, one token line each, in this order: target check lines, then
 * pending lines, then the final `not-requested` line or the write results.
 *
 *   not-requested review-decision APPROVED
 *   not-requested no-changes-requested-reviewer   no reviewer needs a new request
 *   not-requested pending-feedback
 *   not-requested review-state-read-failed        stderr names the failure
 *   not-requested review-state-incomplete         a connection passed the page cap
 *   not-requested gh-unavailable                  `gh` could not be run
 *   skipped author-unavailable                    the review author is null
 *   skipped invalid-login                         the login fails LOGIN_PATTERN
 *   skipped <login> not-a-user                    a Bot, Mannequin, or other non-User
 *   already-requested <login>                     already in reviewRequests
 *   pending <url>                                 at most MAX_PENDING_URL_LINES
 *   pending url-unavailable                       the item url is not on this PR
 *   pending-more <n>                              pending urls past the cap
 *   pending empty-changes-request <login>         see "Pending feedback"
 *   re-requested <login>
 *   failed <login> http-<status>                  from gh's "(HTTP <status>)" stderr
 *   failed <login> gh-exit-<code>                 gh failed with no HTTP status
 *
 * No stdout line carries a comment or review body byte. Every printed URL
 * comes from a structural `url` field and must match the input PR. A read
 * failure prints `re-request-review.mjs: <reason>` on stderr, after any
 * stderr `gh` itself wrote.
 *
 * Pending feedback:
 *
 *   - an unresolved review thread, unless its latest comment is the viewer's
 *     and carries an outcome marker naming the thread's first-comment url.
 *   - a non-empty, non-PENDING review body, or a conversation comment, by a
 *     User other than the viewer, unless a viewer conversation comment
 *     carries an outcome marker naming the item's url.
 *   - the empty CHANGES_REQUESTED review (no body, zero inline comments) of a
 *     reviewer the script would re-request. No triage pass presents it, so
 *     only that reviewer's pending request or newer review clears it.
 *
 * An outcome marker is a whole line `<!-- feedback-outcome: <url> -->` in a
 * viewer comment body. `SKILL.md` ("Applying") writes it at the
 * end of each outcome reply. The url must equal the item url exactly, so
 * `#issuecomment-123` never clears `#issuecomment-12`. Another author's
 * marker clears nothing.
 *
 * Read limits: the first query reads one page of each of the five
 * connections. Each connection with more nodes follows its `after` cursor,
 * one query per page, up to MAX_PAGES_PER_CONNECTION pages, so a run makes at
 * most 1 + 5 x 9 = 46 reads, plus one POST per login. A connection that still
 * has pages after its last allowed page makes the read incomplete. A failed
 * or malformed page fails the read and never counts as an empty page. In both
 * cases nothing is sent.
 *
 * Exit codes:
 *
 *   0  no failure: re-requested, nothing to do, or feedback still pending
 *   1  a read failure, an incomplete read, `gh` unavailable, or at least one
 *      failed POST. The other logins still get their POST
 *   2  usage fault: wrong argument count or a malformed URL. Nothing ran
 *
 * Constraints:
 *
 *   - The read selects `comments{totalCount}` on reviews, although inline
 *     comments otherwise come only from `reviewThreads`. The count tells an
 *     empty changes request from one carried by threads, and adds no items.
 *   - The read fetches other authors' bodies, only to test a review body for
 *     emptiness. Bodies never leave `deriveReRequest`.
 *   - A reviewer can approve between the read and the POST. That reviewer
 *     then gets one extra notification: no GitHub API makes the write
 *     conditional on the review state.
 *   - The viewer is whoever `gh` is signed in as. After `gh auth switch`, the
 *     earlier account's comments count as another author's items.
 */

import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const SCRIPT = "re-request-review.mjs";

// The host is a DNS name (at most 253 characters); owner and repository use GitHub's
// 39-character login and 100-character repository-name limits.
const PR_URL_PATTERN = new RegExp(
  "^https://[A-Za-z0-9.-]{1,253}/[A-Za-z0-9._-]{1,39}/[A-Za-z0-9._-]{1,100}/pull/[0-9]+$",
);
// GitHub's login charset and 39-character limit, loose enough for the doubled and
// trailing hyphens older accounts keep. Only a login matching it reaches `reviewers[]=`.
const LOGIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
// `gh api` reports an HTTP error on stderr as `gh: <message> (HTTP <status>)`.
const HTTP_STATUS_PATTERN = /\(HTTP (\d{3})\)/;
// A whole line, so a marker quoted inside prose clears nothing; `\r?` admits CRLF bodies.
const OUTCOME_MARKER_PATTERN = /^<!-- feedback-outcome: (\S+) -->\r?$/gm;
// Ten URLs keep the report readable; the rest print as one `pending-more` count.
const MAX_PENDING_URL_LINES = 10;
// GitHub's GraphQL maximum for `first`.
const PAGE_SIZE = 100;
// 10 pages cap each connection at 1,000 nodes, so a huge PR fails closed instead of
// reading without bound.
const MAX_PAGES_PER_CONNECTION = 10;
// The first query carries up to 400 bodies (100 from each of four connections). At
// GitHub's 65,536-character body limit that is about 26 MB of one-byte text, so 64 MiB
// leaves room for multi-byte text. execFile's 1 MiB default fails on a few long bodies.
const GH_OUTPUT_LIMIT_BYTES = 64 * 1024 * 1024;

const EXIT_OK = 0;
const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;

const CONNECTION_SELECTIONS = {
  latestOpinionatedReviews:
    "nodes { state url body comments { totalCount } author { __typename login } }",
  reviewRequests: "nodes { requestedReviewer { __typename ... on User { login } } }",
  reviewThreads: `nodes {
    isResolved
    firstComment: comments(first: 1) { nodes { url } }
    latestComment: comments(last: 1) { nodes { author { login } body } }
  }`,
  reviews:
    "nodes { state submittedAt url body comments { totalCount } author { __typename login } }",
  comments: "nodes { url body author { __typename login } }",
};
const CONNECTION_NAMES = Object.keys(CONNECTION_SELECTIONS);

const connectionPage = (name, afterArgument) => `
      ${name}(first: ${PAGE_SIZE}${afterArgument}) {
        pageInfo { hasNextPage endCursor }
        ${CONNECTION_SELECTIONS[name]}
      }`;

const REVIEW_STATE_QUERY = `
query($owner: String!, $repo: String!, $number: Int!) {
  viewer { login }
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewDecision${CONNECTION_NAMES.map((name) => connectionPage(name, "")).join("")}
    }
  }
}`;

const FOLLOW_UP_QUERIES = Object.fromEntries(
  CONNECTION_NAMES.map((name) => [
    name,
    `
query($owner: String!, $repo: String!, $number: Int!, $after: String!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {${connectionPage(name, ", after: $after")}
    }
  }
}`,
  ]),
);

/**
 * `reviewState`: `{viewerLogin, reviewDecision}` plus one node array per
 * connection, fully read. `pullRequest`: `{host, owner, repo, number}`.
 * Returns the stdout lines and the logins to POST, in code-unit order.
 */
export function deriveReRequest(reviewState, pullRequest) {
  if (reviewState.reviewDecision === "APPROVED") {
    return { lines: ["not-requested review-decision APPROVED"], logins: [] };
  }

  const targets = checkTargets(reviewState);
  if (targets.writeSet.length === 0) {
    return { lines: [...targets.lines, "not-requested no-changes-requested-reviewer"], logins: [] };
  }

  const pendingLines = describePending(reviewState, pullRequest, targets.writeSet);
  if (pendingLines.length > 0) {
    return {
      lines: [...targets.lines, ...pendingLines, "not-requested pending-feedback"],
      logins: [],
    };
  }

  return { lines: targets.lines, logins: targets.writeSet.map((target) => target.login).sort() };
}

function checkTargets({ viewerLogin, latestOpinionatedReviews, reviewRequests }) {
  const requestedLogins = new Set(
    reviewRequests
      .map(({ requestedReviewer }) =>
        requestedReviewer?.__typename === "User" ? requestedReviewer.login : null,
      )
      .filter((login) => typeof login === "string"),
  );
  const lines = [];
  const writeSet = [];
  for (const review of latestOpinionatedReviews) {
    if (review.state !== "CHANGES_REQUESTED") continue;
    const { author } = review;
    if (author == null) {
      lines.push("skipped author-unavailable");
    } else if (typeof author.login !== "string" || !LOGIN_PATTERN.test(author.login)) {
      lines.push("skipped invalid-login");
    } else if (author.__typename !== "User") {
      lines.push(`skipped ${author.login} not-a-user`);
    } else if (author.login === viewerLogin) {
      continue;
    } else if (requestedLogins.has(author.login)) {
      lines.push(`already-requested ${author.login}`);
    } else {
      writeSet.push({ login: author.login, review });
    }
  }
  return { lines, writeSet };
}

function describePending(reviewState, pullRequest, writeSet) {
  const itemUrlPattern = pullRequestItemUrlPattern(pullRequest);
  const urlLines = pendingItemUrls(reviewState).map((url) =>
    typeof url === "string" && itemUrlPattern.test(url)
      ? `pending ${url}`
      : "pending url-unavailable",
  );
  const cappedUrlLines = urlLines.slice(0, MAX_PENDING_URL_LINES);
  if (urlLines.length > MAX_PENDING_URL_LINES) {
    cappedUrlLines.push(`pending-more ${urlLines.length - MAX_PENDING_URL_LINES}`);
  }
  const emptyChangesRequestLines = writeSet
    .filter(({ review }) => isEmptyBody(review.body) && review.comments?.totalCount === 0)
    .map(({ login }) => `pending empty-changes-request ${login}`);
  return [...cappedUrlLines, ...emptyChangesRequestLines];
}

function pendingItemUrls({ viewerLogin, reviewThreads, reviews, comments }) {
  const isOtherUser = (author) => author?.__typename === "User" && author.login !== viewerLogin;
  const threadUrls = reviewThreads
    .filter((thread) => !thread.isResolved && !isThreadMarked(thread, viewerLogin))
    .map((thread) => thread.firstComment?.nodes?.[0]?.url);

  const markedPullRequestItemUrls = new Set(
    comments
      .filter((comment) => comment.author?.login === viewerLogin)
      .flatMap((comment) => outcomeMarkerUrls(comment.body)),
  );
  const isUnmarked = (item) => !markedPullRequestItemUrls.has(item.url);
  const reviewUrls = reviews
    .filter(
      (review) =>
        review.state !== "PENDING" && !isEmptyBody(review.body) && isOtherUser(review.author),
    )
    .filter(isUnmarked)
    .map((review) => review.url);
  const commentUrls = comments
    .filter((comment) => isOtherUser(comment.author))
    .filter(isUnmarked)
    .map((comment) => comment.url);
  return [...threadUrls, ...reviewUrls, ...commentUrls];
}

function isThreadMarked(thread, viewerLogin) {
  const latestComment = thread.latestComment?.nodes?.[0];
  const firstCommentUrl = thread.firstComment?.nodes?.[0]?.url;
  if (latestComment?.author?.login !== viewerLogin || typeof firstCommentUrl !== "string")
    return false;
  return outcomeMarkerUrls(latestComment.body).includes(firstCommentUrl);
}

function outcomeMarkerUrls(body) {
  if (typeof body !== "string") return [];
  return Array.from(body.matchAll(OUTCOME_MARKER_PATTERN), (match) => match[1]);
}

function isEmptyBody(body) {
  return body == null || body === "";
}

function pullRequestItemUrlPattern({ host, owner, repo, number }) {
  const escape = (segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `^https://${escape(host)}/${escape(owner)}/${escape(repo)}/pull/${number}#(discussion_r|pullrequestreview-|issuecomment-)[0-9]+$`,
  );
}

const execFileAsync = promisify(execFile);

async function runGh(args) {
  try {
    const { stdout } = await execFileAsync("gh", args, { maxBuffer: GH_OUTPUT_LIMIT_BYTES });
    return { ok: true, stdout };
  } catch (error) {
    const exitCode = typeof error.code === "number" ? error.code : (error.signal ?? error.code);
    return { ok: false, error, exitCode, stderr: error.stderr ?? "" };
  }
}

function parsePullRequestUrl(url) {
  const [, , host, owner, repo, , number] = url.split("/");
  return { host, owner, repo, number: Number(number) };
}

const readFailure = (reason) => ({ failure: "review-state-read-failed", reason });

function ghFailure({ error, exitCode, stderr }) {
  if (error.code === "ENOENT")
    return { failure: "gh-unavailable", reason: `cannot run gh: ${error.message}` };
  if (error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
    return readFailure(`gh output exceeded ${GH_OUTPUT_LIMIT_BYTES} bytes`);
  }
  process.stderr.write(stderr);
  return readFailure(`gh api graphql exited ${exitCode}`);
}

function graphqlMessages(errors) {
  const messages = Array.isArray(errors)
    ? errors.map((error) => error?.message).filter((m) => typeof m === "string")
    : [];
  return messages.length > 0 ? messages.join("; ") : "no message";
}

async function readReviewState(pullRequest) {
  const firstPage = await readPage(pullRequest, REVIEW_STATE_QUERY, []);
  if (firstPage.failure) return firstPage;
  const viewerLogin = firstPage.response.data?.viewer?.login;
  const firstPullRequest = firstPage.response.data?.repository?.pullRequest;
  if (typeof viewerLogin !== "string") return readFailure("the response has no viewer login");
  if (!isObject(firstPullRequest)) return readFailure("the response has no pull request");

  const reviewState = { viewerLogin, reviewDecision: firstPullRequest.reviewDecision };
  for (const name of CONNECTION_NAMES) {
    const connection = await readConnection(pullRequest, name, firstPullRequest[name]);
    if (connection.failure) return connection;
    reviewState[name] = connection.nodes;
  }
  return { reviewState };
}

async function readConnection(pullRequest, name, firstPage) {
  let page = firstPage;
  const nodes = [];
  for (let pagesRead = 1; ; pagesRead++) {
    if (!isConnectionPage(page)) return readFailure(`page ${pagesRead} of ${name} is malformed`);
    nodes.push(...page.nodes);
    if (!page.pageInfo.hasNextPage) return { nodes };
    if (pagesRead === MAX_PAGES_PER_CONNECTION) {
      return {
        failure: "review-state-incomplete",
        reason: `${name} has more than ${MAX_PAGES_PER_CONNECTION} pages`,
      };
    }

    const next = await readPage(pullRequest, FOLLOW_UP_QUERIES[name], [
      "-f",
      `after=${page.pageInfo.endCursor}`,
    ]);
    if (next.failure) return next;
    page = next.response.data?.repository?.pullRequest?.[name];
  }
}

async function readPage(pullRequest, query, extraArgs) {
  const { host, owner, repo, number } = pullRequest;
  const result = await runGh([
    "api",
    "graphql",
    "--hostname",
    host,
    "-f",
    `query=${query}`,
    "-f",
    `owner=${owner}`,
    "-f",
    `repo=${repo}`,
    "-F",
    `number=${number}`,
    ...extraArgs,
  ]);
  if (!result.ok) return ghFailure(result);
  let response;
  try {
    response = JSON.parse(result.stdout);
  } catch {
    return readFailure("gh printed output that is not JSON");
  }
  if (!isObject(response)) return readFailure("gh printed JSON that is not an object");
  if ("errors" in response)
    return readFailure(`GraphQL errors: ${graphqlMessages(response.errors)}`);
  return { response };
}

function isObject(value) {
  return value !== null && typeof value === "object";
}

function isConnectionPage(value) {
  if (!Array.isArray(value?.nodes) || typeof value?.pageInfo?.hasNextPage !== "boolean")
    return false;
  return !value.pageInfo.hasNextPage || typeof value.pageInfo.endCursor === "string";
}

async function requestReview(pullRequest, login) {
  const { host, owner, repo, number } = pullRequest;
  const result = await runGh([
    "api",
    "--hostname",
    host,
    "--method",
    "POST",
    `repos/${owner}/${repo}/pulls/${number}/requested_reviewers`,
    "-f",
    `reviewers[]=${login}`,
  ]);
  if (result.ok) return { ok: true, line: `re-requested ${login}` };

  process.stderr.write(result.stderr);
  const httpStatus = HTTP_STATUS_PATTERN.exec(result.stderr)?.[1];
  const reason = httpStatus ? `http-${httpStatus}` : `gh-exit-${result.exitCode}`;
  return { ok: false, line: `failed ${login} ${reason}` };
}

async function main(argv) {
  if (argv.length !== 1 || !PR_URL_PATTERN.test(argv[0])) {
    process.stderr.write(`${SCRIPT}: usage: ${SCRIPT} https://<host>/<owner>/<repo>/pull/<n>\n`);
    return EXIT_USAGE;
  }
  const pullRequest = parsePullRequestUrl(argv[0]);

  const read = await readReviewState(pullRequest);
  if (read.failure) {
    process.stderr.write(`${SCRIPT}: ${read.reason}\n`);
    process.stdout.write(`not-requested ${read.failure}\n`);
    return EXIT_FAILURE;
  }

  const { lines, logins } = deriveReRequest(read.reviewState, pullRequest);
  for (const line of lines) process.stdout.write(`${line}\n`);

  let anyPostFailed = false;
  for (const login of logins) {
    const outcome = await requestReview(pullRequest, login);
    process.stdout.write(`${outcome.line}\n`);
    if (!outcome.ok) anyPostFailed = true;
  }
  return anyPostFailed ? EXIT_FAILURE : EXIT_OK;
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
