#!/usr/bin/env node

/**
 * Builds the triage item set from one fetch-pr-feedback.mjs result.
 *
 *     node "<skill-dir>/scripts/build-items.mjs" <feedback-file> [--exclude-ids <ids-file>]
 *
 *     import { buildItems } from "<skill-dir>/scripts/build-items.mjs";
 *     const itemSet = buildItems(feedback, excludedIds);
 *
 * `<feedback-file>` holds the stdout of a complete (exit 0)
 * `shared/scripts/fetch-pr-feedback.mjs` run made without `--no-bodies`.
 * `<ids-file>` lists node ids to leave out, one per line (blank lines
 * ignored): a thread `id`, a review `id`, or a conversation comment `id`.
 *
 * Keeps every unresolved thread (outdated ones too, flagged `isOutdated`),
 * every review summary that is not PENDING and has a non-empty body, and
 * every conversation comment, then drops:
 *
 *   - a conversation comment the viewer wrote whose first line starts with a
 *     review-record marker (`<!-- <producer>:pr-comment ` with the space),
 *     counted in `skippedReviewRecords`. The same marker from anyone else
 *     stays.
 *   - any item whose id is in `<ids-file>`, counted in `excluded`.
 *
 * Stdout, on exit 0 only, one line of JSON:
 *
 *   {
 *     "pr": <the fetch result's pr, unchanged>,
 *     "viewer": { login },
 *     "items": [ { kind, id, url, author, byViewer, path, line, startLine,
 *                  isOutdated, state, replyTo, reactionSubject, body,
 *                  comments } ],
 *     "skippedReviewRecords": <n>,
 *     "excluded": <n>
 *   }
 *
 * `kind` is `thread`, `review`, or `conversation`. For a thread, `id` is the
 * thread node id, `url`, `author`, `replyTo` (a `databaseId`), and
 * `reactionSubject` (a node id) come from its first comment, `body` is null,
 * and `comments` holds every comment `{ author, body, diffHunk, createdAt,
 * url }` in order. For a review or conversation comment, `path`, `line`,
 * `startLine`, and `replyTo` are null, `isOutdated` is false, `comments` is
 * empty, and `reactionSubject` is its own id. `state` is the review state, or
 * null for the other kinds. `author` is a login or null for a deleted
 * account. Threads come first, by `path` then `line` (null last) then fetch
 * order; reviews, then conversation comments, follow in fetch order. Bodies
 * are untrusted data, copied unchanged.
 *
 * Exit codes:
 *
 *   0  the item set was printed
 *   2  usage fault: wrong arguments, an unreadable file, or a feedback file
 *      that is empty, not JSON, missing a section, fetched with
 *      `--no-bodies`, or holding a thread with no comments. Nothing printed
 */

import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT = "build-items.mjs";
// The skill file that explains each exit code.
const DOC_PATH = fileURLToPath(new URL("../SKILL.md", import.meta.url));
const USAGE = `${SCRIPT}: usage: ${SCRIPT} <feedback-file> [--exclude-ids <ids-file>]`;

// A record a review skill posted for its own bookkeeping, not feedback to triage.
const REVIEW_RECORD_MARKER_PATTERN = /^<!-- \S+:pr-comment /;

const EXIT_OK = 0;
const EXIT_USAGE = 2;

class UsageError extends Error {}

const login = (author) => (typeof author?.login === "string" ? author.login : null);
const isEmptyBody = (body) => body == null || body === "";

function requireBody(node, section) {
  if (!("body" in node))
    throw new UsageError(`${section} has no body field; fetch without --no-bodies`);
}

function threadItem(thread, viewerLogin) {
  const [first] = thread.comments;
  if (first === undefined) throw new UsageError(`thread ${thread.id} has no comments`);
  for (const comment of thread.comments) requireBody(comment, `a comment of thread ${thread.id}`);
  const author = login(first.author);
  return {
    kind: "thread",
    id: thread.id,
    url: first.url,
    author,
    byViewer: author === viewerLogin,
    path: thread.path ?? null,
    line: thread.line ?? null,
    startLine: thread.startLine ?? null,
    isOutdated: thread.isOutdated === true,
    state: null,
    replyTo: first.databaseId,
    reactionSubject: first.id,
    body: null,
    comments: thread.comments.map((comment) => ({
      author: login(comment.author),
      body: comment.body,
      diffHunk: comment.diffHunk ?? null,
      createdAt: comment.createdAt,
      url: comment.url,
    })),
  };
}

function pullRequestLevelItem(kind, node, viewerLogin) {
  const author = login(node.author);
  return {
    kind,
    id: node.id,
    url: node.url,
    author,
    byViewer: author === viewerLogin,
    path: null,
    line: null,
    startLine: null,
    isOutdated: false,
    state: kind === "review" ? node.state : null,
    replyTo: null,
    reactionSubject: node.id,
    body: node.body,
    comments: [],
  };
}

// Code-unit order on path, then line with null last; Array.prototype.sort is stable, so ties
// keep fetch order.
function compareThreads(a, b) {
  if (a.path !== b.path) return (a.path ?? "") < (b.path ?? "") ? -1 : 1;
  if (a.line === b.line) return 0;
  if (a.line === null) return 1;
  if (b.line === null) return -1;
  return a.line - b.line;
}

/**
 * `feedback`: a parsed fetch-pr-feedback.mjs result. `excludedIds`: a Set of
 * node ids. Returns the object the CLI prints; throws UsageError on input the
 * fetch script never prints.
 */
export function buildItems(feedback, excludedIds = new Set()) {
  const viewerLogin = feedback?.viewer?.login;
  if (typeof viewerLogin !== "string") throw new UsageError("the feedback has no viewer login");
  for (const section of ["conversationComments", "reviewSummaries", "reviewThreads"]) {
    if (!Array.isArray(feedback[section])) throw new UsageError(`the feedback has no ${section}`);
  }
  for (const node of feedback.conversationComments) requireBody(node, "conversationComments");
  for (const node of feedback.reviewSummaries) requireBody(node, "reviewSummaries");

  const threads = feedback.reviewThreads
    .filter((thread) => thread.isResolved !== true)
    .map((thread) => threadItem(thread, viewerLogin))
    .sort(compareThreads);
  const reviews = feedback.reviewSummaries
    .filter((review) => review.state !== "PENDING" && !isEmptyBody(review.body))
    .map((review) => pullRequestLevelItem("review", review, viewerLogin));

  let skippedReviewRecords = 0;
  const conversation = [];
  for (const comment of feedback.conversationComments) {
    const firstLine = typeof comment.body === "string" ? comment.body.split("\n", 1)[0] : "";
    if (login(comment.author) === viewerLogin && REVIEW_RECORD_MARKER_PATTERN.test(firstLine)) {
      skippedReviewRecords++;
      continue;
    }
    conversation.push(pullRequestLevelItem("conversation", comment, viewerLogin));
  }

  const candidates = [...threads, ...reviews, ...conversation];
  const items = candidates.filter((item) => !excludedIds.has(item.id));
  return {
    pr: feedback.pr,
    viewer: { login: viewerLogin },
    items,
    skippedReviewRecords,
    excluded: candidates.length - items.length,
  };
}

function readText(path, label) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    throw new UsageError(`cannot read ${label} ${path}: ${error.code ?? error.message}`);
  }
}

function parseArgs(argv) {
  let feedbackPath = null;
  let excludePath = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--exclude-ids" && i + 1 < argv.length && excludePath === null)
      excludePath = argv[++i];
    else if (!arg.startsWith("-") && feedbackPath === null) feedbackPath = arg;
    else throw new UsageError(USAGE);
  }
  if (feedbackPath === null) throw new UsageError(USAGE);
  return { feedbackPath, excludePath };
}

function main(argv) {
  const { feedbackPath, excludePath } = parseArgs(argv);
  const text = readText(feedbackPath, "feedback file");
  if (text.trim() === "")
    throw new UsageError(`${feedbackPath} is empty; did fetch-pr-feedback.mjs exit 0?`);
  let feedback;
  try {
    feedback = JSON.parse(text);
  } catch {
    throw new UsageError(`${feedbackPath} is not JSON`);
  }
  const excludedIds = new Set(
    excludePath === null
      ? []
      : readText(excludePath, "ids file")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
  );
  process.stdout.write(`${JSON.stringify(buildItems(feedback, excludedIds))}\n`);
  return EXIT_OK;
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(
      error.message.startsWith(`${SCRIPT}:`)
        ? `${error.message}\n`
        : `${SCRIPT}: ${error.message}\n`,
    );
    process.stderr.write(`see ${DOC_PATH}\n`);
    process.exitCode = EXIT_USAGE;
  }
}
