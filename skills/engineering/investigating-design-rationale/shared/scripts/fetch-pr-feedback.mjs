#!/usr/bin/env node
// Canonical file: shared/scripts/fetch-pr-feedback.mjs at the repository root. Edit it there,
// then run npm run sync-shared.

/**
 * Fetches every piece of feedback on one pull request, fully paginated, and
 * prints it as one JSON object.
 *
 *     node "<skill-dir>/shared/scripts/fetch-pr-feedback.mjs" [<pr>] [--hostname <host>] [--no-bodies]
 *
 * `<pr>` is a PR number, a PR URL `https://<host>/<owner>/<repo>/pull/<n>`, or
 * omitted for the current branch's PR. A number or no argument resolves
 * through `gh pr view` in the working directory's repository. `--hostname`
 * names the GitHub host; when the PR resolves to a different host the run is
 * a usage fault. `--no-bodies` drops every `body` and `diffHunk` field, for a
 * structural poll that never reads untrusted text. Requires `gh` on PATH,
 * signed in to the host. Every `gh api` call passes `--hostname`, so a
 * `GH_HOST` in the environment never redirects the read.
 *
 * Stdout, on exit 0 only, one line of JSON:
 *
 *   {
 *     "pr": { host, owner, repo, number, url, state, headRefOid,
 *             reviewDecision, autoMergeEnabled },
 *     "viewer": { login },
 *     "conversationComments": [ { id, databaseId, author, body, createdAt,
 *                                 url, reactionGroups } ],
 *     "reviewSummaries": [ { id, databaseId, author, body, state,
 *                            submittedAt, url, reactionGroups } ],
 *     "reviewThreads": [ { id, isResolved, isOutdated, path, line,
 *                          startLine, comments: [ { id, databaseId, author,
 *                          body, diffHunk, state, createdAt, url,
 *                          reactionGroups } ] } ]
 *   }
 *
 * Field names match GitHub's GraphQL schema; `author` is `{ login }` or null
 * for a deleted account. Each array keeps GitHub's order, merged across pages
 * by node `id`. Nothing is filtered: resolved threads, PENDING reviews, and
 * empty bodies all appear, and each consumer applies its own rules.
 *
 * Exit codes:
 *
 *   0  complete: every connection, including each thread's comments, read to
 *      its last page
 *   1  a read failed, a page was malformed, or a connection passed the page
 *      cap. Stdout is empty; stderr names the failure
 *   2  usage fault: an unknown flag, a malformed PR argument or host, a PR
 *      that `gh pr view` cannot resolve, or a host mismatch. Nothing was read
 *   127  `gh` is not on PATH
 */

import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SCRIPT = "fetch-pr-feedback.mjs";
const USAGE = `${SCRIPT}: usage: ${SCRIPT} [<number>|<pr-url>] [--hostname <host>] [--no-bodies]`;

// A DNS name is at most 253 characters.
const HOST_PATTERN = /^[A-Za-z0-9.-]{1,253}$/;
// Owner and repository use GitHub's 39-character login and 100-character repository-name limits.
const PR_URL_PATTERN =
  /^https:\/\/([A-Za-z0-9.-]{1,253})\/([A-Za-z0-9._-]{1,39})\/([A-Za-z0-9._-]{1,100})\/pull\/([1-9][0-9]*)\/?$/;
const PR_NUMBER_PATTERN = /^[1-9][0-9]*$/;
// GitHub's GraphQL maximum for `first`.
const PAGE_SIZE = 100;
// 10 pages cap each connection at 1,000 nodes, so a huge PR fails closed instead of
// reading without bound.
const MAX_PAGES_PER_CONNECTION = 10;
// The first query carries up to 100 x 100 thread comments plus 200 other nodes, each
// with a body of at most 65,536 characters. 256 MiB holds a worst-case page of
// multi-byte text; spawnSync's 1 MiB default fails on a few long bodies.
const GH_OUTPUT_LIMIT_BYTES = 256 * 1024 * 1024;

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

const REACTIONS = "reactionGroups { content viewerHasReacted }";

function selections(withBodies) {
  const body = withBodies ? "body" : "";
  return {
    conversationComments: `id databaseId author { login } ${body} createdAt url ${REACTIONS}`,
    reviewSummaries: `id databaseId author { login } ${body} state submittedAt url ${REACTIONS}`,
    threadComment: `id databaseId author { login } ${body} ${withBodies ? "diffHunk" : ""} state createdAt url ${REACTIONS}`,
  };
}

function queries(withBodies) {
  const fields = selections(withBodies);
  const page = (after) => `(first: ${PAGE_SIZE}${after ? ", after: $after" : ""})`;
  const connection = (header, nodes) =>
    `${header} { pageInfo { hasNextPage endCursor } nodes { ${nodes} } }`;
  const threadNodes = `id isResolved isOutdated path line startLine ${connection(
    `comments${page(false)}`,
    fields.threadComment,
  )}`;
  const prConnections = (after) => ({
    conversationComments: connection(
      `conversationComments: comments${page(after)}`,
      fields.conversationComments,
    ),
    reviewSummaries: connection(`reviewSummaries: reviews${page(after)}`, fields.reviewSummaries),
    reviewThreads: connection(`reviewThreads${page(after)}`, threadNodes),
  });
  const vars = "$owner: String!, $repo: String!, $number: Int!";
  const first = `query(${vars}) {
  viewer { login }
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      url state headRefOid reviewDecision autoMergeRequest { enabledAt }
      ${Object.values(prConnections(false)).join("\n      ")}
    }
  }
}`;
  const followUp = Object.fromEntries(
    Object.entries(prConnections(true)).map(([name, selection]) => [
      name,
      `query(${vars}, $after: String!) {
  repository(owner: $owner, name: $repo) { pullRequest(number: $number) { ${selection} } }
}`,
    ]),
  );
  const threadComments = `query($id: ID!, $after: String!) {
  node(id: $id) { ... on PullRequestReviewThread { ${connection(
    `comments${page(true)}`,
    fields.threadComment,
  )} } }
}`;
  return { first, followUp, threadComments };
}

function runGh(args) {
  const run = spawnSync("gh", args, { encoding: "utf8", maxBuffer: GH_OUTPUT_LIMIT_BYTES });
  if (run.error?.code === "ENOENT") throw new Failure(EXIT_NO_GH, "gh is not on PATH");
  if (run.error?.code === "ENOBUFS")
    throw new Failure(EXIT_FAILURE, `gh output exceeded ${GH_OUTPUT_LIMIT_BYTES} bytes`);
  if (run.error) throw new Failure(EXIT_FAILURE, `cannot run gh: ${run.error.message}`);
  return run;
}

function parseArgs(argv) {
  const options = { target: null, hostname: null, withBodies: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--no-bodies") options.withBodies = false;
    else if (arg === "--hostname" && i + 1 < argv.length) options.hostname = argv[++i];
    else if (arg.startsWith("--hostname=")) options.hostname = arg.slice("--hostname=".length);
    else if (!arg.startsWith("-") && options.target === null) options.target = arg;
    else throw new Failure(EXIT_USAGE, USAGE);
  }
  if (options.hostname !== null && !HOST_PATTERN.test(options.hostname))
    throw new Failure(EXIT_USAGE, `malformed host: ${options.hostname}`);
  if (
    options.target !== null &&
    !PR_NUMBER_PATTERN.test(options.target) &&
    !PR_URL_PATTERN.test(options.target)
  )
    throw new Failure(EXIT_USAGE, `not a PR number or URL: ${options.target}`);
  return options;
}

function resolvePullRequestUrl(target) {
  if (target !== null && PR_URL_PATTERN.test(target)) return target;
  const run = runGh(["pr", "view", ...(target === null ? [] : [target]), "--json", "url"]);
  if (run.status !== 0) {
    process.stderr.write(run.stderr);
    throw new Failure(EXIT_USAGE, `gh pr view could not resolve ${target ?? "the current branch"}`);
  }
  let url;
  try {
    url = JSON.parse(run.stdout).url;
  } catch {
    url = undefined;
  }
  if (typeof url !== "string" || !PR_URL_PATTERN.test(url))
    throw new Failure(EXIT_USAGE, "gh pr view printed no PR URL");
  return url;
}

function graphql(host, query, variables) {
  const args = ["api", "graphql", "--hostname", host, "-f", `query=${query}`];
  for (const [name, value] of Object.entries(variables))
    args.push(typeof value === "number" ? "-F" : "-f", `${name}=${value}`);
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
  if (response === null || typeof response !== "object")
    throw new Failure(EXIT_FAILURE, "gh printed JSON that is not an object");
  if ("errors" in response) {
    const messages = Array.isArray(response.errors)
      ? response.errors.map((error) => error?.message).filter((m) => typeof m === "string")
      : [];
    throw new Failure(
      EXIT_FAILURE,
      `GraphQL errors: ${messages.length ? messages.join("; ") : "no message"}`,
    );
  }
  return response.data;
}

function isConnectionPage(value) {
  if (!Array.isArray(value?.nodes) || typeof value?.pageInfo?.hasNextPage !== "boolean")
    return false;
  if (!value.nodes.every((node) => typeof node?.id === "string")) return false;
  return !value.pageInfo.hasNextPage || typeof value.pageInfo.endCursor === "string";
}

// Reads `firstPage` and every page after it, merging nodes by `id` in first-seen order.
function readConnection(label, firstPage, fetchPage) {
  const byId = new Map();
  let page = firstPage;
  for (let pagesRead = 1; ; pagesRead++) {
    if (!isConnectionPage(page))
      throw new Failure(EXIT_FAILURE, `page ${pagesRead} of ${label} is malformed`);
    for (const node of page.nodes) if (!byId.has(node.id)) byId.set(node.id, node);
    if (!page.pageInfo.hasNextPage) return [...byId.values()];
    if (pagesRead === MAX_PAGES_PER_CONNECTION)
      throw new Failure(
        EXIT_FAILURE,
        `incomplete: ${label} has more than ${MAX_PAGES_PER_CONNECTION} pages`,
      );
    page = fetchPage(page.pageInfo.endCursor);
  }
}

function fetchFeedback(pr, withBodies) {
  const { first, followUp, threadComments } = queries(withBodies);
  const prVariables = { owner: pr.owner, repo: pr.repo, number: pr.number };
  const data = graphql(pr.host, first, prVariables);
  const viewerLogin = data?.viewer?.login;
  const pullRequest = data?.repository?.pullRequest;
  if (typeof viewerLogin !== "string")
    throw new Failure(EXIT_FAILURE, "the response has no viewer login");
  if (pullRequest === null || typeof pullRequest !== "object")
    throw new Failure(EXIT_FAILURE, "the response has no pull request");

  const connections = {};
  for (const name of ["conversationComments", "reviewSummaries", "reviewThreads"]) {
    connections[name] = readConnection(
      name,
      pullRequest[name],
      (after) =>
        graphql(pr.host, followUp[name], { ...prVariables, after })?.repository?.pullRequest?.[
          name
        ],
    );
  }

  const reviewThreads = connections.reviewThreads.map((thread) => ({
    ...thread,
    comments: readConnection(
      `comments of thread ${thread.id}`,
      thread.comments,
      (after) => graphql(pr.host, threadComments, { id: thread.id, after })?.node?.comments,
    ),
  }));

  return {
    pr: {
      ...pr,
      url: pullRequest.url,
      state: pullRequest.state,
      headRefOid: pullRequest.headRefOid,
      reviewDecision: pullRequest.reviewDecision,
      autoMergeEnabled: pullRequest.autoMergeRequest != null,
    },
    viewer: { login: viewerLogin },
    conversationComments: connections.conversationComments,
    reviewSummaries: connections.reviewSummaries,
    reviewThreads,
  };
}

function main(argv) {
  const options = parseArgs(argv);
  const url = resolvePullRequestUrl(options.target);
  const [, host, owner, repo, number] = url.match(PR_URL_PATTERN);
  if (options.hostname !== null && options.hostname.toLowerCase() !== host.toLowerCase())
    throw new Failure(EXIT_USAGE, `the PR is on ${host}, not --hostname ${options.hostname}`);
  const feedback = fetchFeedback({ host, owner, repo, number: Number(number) }, options.withBodies);
  process.stdout.write(`${JSON.stringify(feedback)}\n`);
  return EXIT_OK;
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
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
