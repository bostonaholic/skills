#!/usr/bin/env node

/**
 * Settles one triage item on GitHub: posts the reply, resolves the thread,
 * places the reaction, then re-reads GitHub to confirm the result.
 *
 *     node "<skill-dir>/scripts/settle-item.mjs" <items-file> <item-id> --reply-file <file> \
 *       --react THUMBS_UP|THUMBS_DOWN|none [--resolve] [--no-marker]
 *
 * `<items-file>` holds the stdout of `scripts/build-items.mjs`; `<item-id>` is
 * one of its item `id`s. `<file>` holds the reply body, read as data and sent
 * on gh's stdin, never in shell text. Unless `--no-marker` (a reply that asks
 * for clarification), the script appends the item's outcome marker line
 * `<!-- feedback-outcome: <item url> -->` when the file does not already hold
 * it. `--resolve` resolves a thread item. `--react` names the reaction for
 * the item's opening comment; it is required, so the choice is always made.
 * Requires `gh` on PATH, signed in to the PR's host; every call passes
 * `--hostname`.
 *
 * Each write is skipped when GitHub already shows it, so a rerun after a
 * failure finishes the job without a second reply or reaction:
 *
 *   - reply: skipped when a viewer comment with the same body (after line
 *     endings and trailing whitespace are normalized) is among the latest
 *     COMMENTS_TO_SCAN comments of the thread, or of the PR for a PR-level
 *     item. A thread reply goes to the first comment's `databaseId`; a
 *     PR-level reply is a top-level PR comment.
 *   - resolve: skipped when the thread is already resolved.
 *   - reaction: skipped when `viewerHasReacted` is already true for it.
 *
 * Stdout, one token line each, in this order, stopping at the first failure:
 *
 *   replied <comment-url> | already-replied <comment-url> | reply-failed
 *   resolved <thread-id> | already-resolved <thread-id> | resolve-failed
 *                                                     (only with --resolve)
 *   reacted <content> | already-reacted <content> | reaction-failed <content>
 *                                                     (only when not none)
 *   verified | not-verified reply-missing | not-verified thread-unresolved
 *
 * A reaction failure is never fatal: the run goes on to verify. Stderr names
 * every failure as `settle-item.mjs: <reason>`, after any stderr gh wrote.
 *
 * Exit codes:
 *
 *   0  verified: the reply exists and, with --resolve, the thread is resolved
 *   1  a read, the reply, or the resolve failed, or verification failed
 *   2  usage fault: wrong arguments, an unreadable or malformed items file,
 *      an unknown item id, an empty reply file, --resolve on a PR-level item,
 *      --no-marker with --resolve or a reaction, or a reaction on the
 *      viewer's own comment. Nothing was written
 *   127  `gh` is not on PATH
 */

import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT = "settle-item.mjs";
// The skill file that explains each exit code.
const DOC_PATH = fileURLToPath(new URL("../references/settling-items.md", import.meta.url));
const USAGE = `${SCRIPT}: usage: ${SCRIPT} <items-file> <item-id> --reply-file <file> --react THUMBS_UP|THUMBS_DOWN|none [--resolve] [--no-marker]`;

const REACTIONS = new Set(["THUMBS_UP", "THUMBS_DOWN", "none"]);
// GitHub's GraphQL maximum for `last`. The reply this run looks for is the viewer's newest
// comment, so it is among the latest 100 unless 100 more land between the write and the read.
const COMMENTS_TO_SCAN = 100;
// A reply body is at most 65,536 characters; 16 MiB holds 100 of them in multi-byte text.
const GH_OUTPUT_LIMIT_BYTES = 16 * 1024 * 1024;

const EXIT_OK = 0;
const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;
const EXIT_NO_GH = 127;

class Failure extends Error {
  constructor(exitCode, message, token = null) {
    super(message);
    this.exitCode = exitCode;
    this.token = token;
  }
}

const usage = (message) => new Failure(EXIT_USAGE, message);

export function outcomeMarker(url) {
  return `<!-- feedback-outcome: ${url} -->`;
}

/** The body to post: the reply plus the item's marker line unless it is already there. */
export function replyBody(reply, url, withMarker) {
  const text = reply.replace(/\r\n/g, "\n").trimEnd();
  if (!withMarker || text.split("\n").includes(outcomeMarker(url))) return text;
  return `${text}\n\n${outcomeMarker(url)}`;
}

const normalize = (body) => (typeof body === "string" ? body.replace(/\r\n/g, "\n").trimEnd() : "");

function parseArgs(argv) {
  const options = { positional: [], replyFile: null, react: null, resolve: false, marker: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--reply-file" && i + 1 < argv.length) options.replyFile = argv[++i];
    else if (arg === "--react" && i + 1 < argv.length) options.react = argv[++i];
    else if (arg === "--resolve") options.resolve = true;
    else if (arg === "--no-marker") options.marker = false;
    else if (!arg.startsWith("-")) options.positional.push(arg);
    else throw usage(USAGE);
  }
  if (options.positional.length !== 2 || options.replyFile === null || options.react === null)
    throw usage(USAGE);
  if (!REACTIONS.has(options.react)) throw usage(`unknown reaction: ${options.react}`);
  if (!options.marker && (options.resolve || options.react !== "none"))
    throw usage("--no-marker takes no --resolve and only --react none");
  return options;
}

function readText(path, label) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    throw usage(`cannot read ${label} ${path}: ${error.code ?? error.message}`);
  }
}

function loadItem(itemsPath, itemId) {
  let itemSet;
  try {
    itemSet = JSON.parse(readText(itemsPath, "items file"));
  } catch (error) {
    if (error instanceof Failure) throw error;
    throw usage(`${itemsPath} is not JSON`);
  }
  const { pr } = itemSet ?? {};
  if (
    typeof pr?.host !== "string" ||
    typeof pr?.owner !== "string" ||
    typeof pr?.repo !== "string" ||
    !Number.isInteger(pr?.number) ||
    !Array.isArray(itemSet.items)
  )
    throw usage(`${itemsPath} is not build-items.mjs output`);
  const item = itemSet.items.find((candidate) => candidate?.id === itemId);
  if (item === undefined) throw usage(`no item ${itemId} in ${itemsPath}`);
  if (typeof item.url !== "string" || typeof item.reactionSubject !== "string")
    throw usage(`item ${itemId} has no url or reactionSubject`);
  if (item.kind === "thread" && !Number.isInteger(item.replyTo))
    throw usage(`thread ${itemId} has no replyTo databaseId`);
  return { pr, item };
}

function runGh(args, input) {
  const run = spawnSync("gh", args, {
    encoding: "utf8",
    input,
    maxBuffer: GH_OUTPUT_LIMIT_BYTES,
  });
  if (run.error?.code === "ENOENT") throw new Failure(EXIT_NO_GH, "gh is not on PATH");
  if (run.error) return { ok: false, reason: `cannot run gh: ${run.error.message}` };
  if (run.status !== 0) {
    process.stderr.write(run.stderr);
    return { ok: false, reason: `gh exited ${run.status ?? run.signal}` };
  }
  try {
    return { ok: true, response: JSON.parse(run.stdout) };
  } catch {
    return { ok: false, reason: "gh printed output that is not JSON" };
  }
}

function graphql(host, query, variables) {
  const args = ["api", "graphql", "--hostname", host, "-f", `query=${query}`];
  for (const [name, value] of Object.entries(variables))
    args.push(typeof value === "number" ? "-F" : "-f", `${name}=${value}`);
  const result = runGh(args);
  if (!result.ok) return result;
  const { response } = result;
  if (response === null || typeof response !== "object")
    return { ok: false, reason: "gh printed JSON that is not an object" };
  if ("errors" in response) {
    const messages = Array.isArray(response.errors)
      ? response.errors.map((error) => error?.message).filter((m) => typeof m === "string")
      : [];
    return { ok: false, reason: `GraphQL errors: ${messages.join("; ") || "no message"}` };
  }
  return { ok: true, data: response.data };
}

const COMMENT_NODES = `comments(last: ${COMMENTS_TO_SCAN}) { nodes { author { login } body url } }`;
const SUBJECT =
  "subject: node(id: $subject) { ... on Reactable { reactionGroups { content viewerHasReacted } } }";
const THREAD_STATE_QUERY = `query($thread: ID!, $subject: ID!) {
  viewer { login }
  thread: node(id: $thread) { ... on PullRequestReviewThread { isResolved ${COMMENT_NODES} } }
  ${SUBJECT}
}`;
const PULL_REQUEST_STATE_QUERY = `query($owner: String!, $repo: String!, $number: Int!, $subject: ID!) {
  viewer { login }
  repository(owner: $owner, name: $repo) { pullRequest(number: $number) { ${COMMENT_NODES} } }
  ${SUBJECT}
}`;
const RESOLVE_MUTATION = `mutation($id: ID!) {
  resolveReviewThread(input: {threadId: $id}) { thread { isResolved } }
}`;
const REACT_MUTATION = `mutation($subjectId: ID!, $content: ReactionContent!) {
  addReaction(input: {subjectId: $subjectId, content: $content}) { reaction { content } }
}`;

function readState(pr, item) {
  const result =
    item.kind === "thread"
      ? graphql(pr.host, THREAD_STATE_QUERY, { thread: item.id, subject: item.reactionSubject })
      : graphql(pr.host, PULL_REQUEST_STATE_QUERY, {
          owner: pr.owner,
          repo: pr.repo,
          number: pr.number,
          subject: item.reactionSubject,
        });
  if (!result.ok) throw new Failure(EXIT_FAILURE, `read failed: ${result.reason}`);
  const { data } = result;
  const viewerLogin = data?.viewer?.login;
  const holder = item.kind === "thread" ? data?.thread : data?.repository?.pullRequest;
  const comments = holder?.comments?.nodes;
  const reactionGroups = data?.subject?.reactionGroups;
  if (typeof viewerLogin !== "string" || !Array.isArray(comments) || !Array.isArray(reactionGroups))
    throw new Failure(EXIT_FAILURE, "read failed: the response is missing the item");
  return {
    viewerLogin,
    isResolved: holder.isResolved === true,
    comments,
    reacted: (content) =>
      reactionGroups.some((group) => group?.content === content && group.viewerHasReacted === true),
  };
}

function findReply(state, body) {
  return state.comments.find(
    (comment) => comment?.author?.login === state.viewerLogin && normalize(comment.body) === body,
  );
}

function postReply(pr, item, body) {
  const endpoint =
    item.kind === "thread"
      ? `repos/${pr.owner}/${pr.repo}/pulls/${pr.number}/comments`
      : `repos/${pr.owner}/${pr.repo}/issues/${pr.number}/comments`;
  const payload = item.kind === "thread" ? { body, in_reply_to: item.replyTo } : { body };
  const result = runGh(
    ["api", "--hostname", pr.host, "--method", "POST", endpoint, "--input", "-"],
    JSON.stringify(payload),
  );
  if (!result.ok) throw new Failure(EXIT_FAILURE, `reply failed: ${result.reason}`, "reply-failed");
  const url = result.response?.html_url;
  if (typeof url !== "string")
    throw new Failure(EXIT_FAILURE, "reply failed: the response has no html_url", "reply-failed");
  return url;
}

function settle(options) {
  const { pr, item } = loadItem(options.positional[0], options.positional[1]);
  const reply = readText(options.replyFile, "reply file");
  if (reply.trim() === "") throw usage(`${options.replyFile} is empty`);
  if (options.resolve && item.kind !== "thread")
    throw usage(`--resolve needs a thread; ${item.id} is a ${item.kind}`);
  const body = replyBody(reply, item.url, options.marker);

  const before = readState(pr, item);
  if (options.react !== "none" && item.author === before.viewerLogin)
    throw usage(`${item.id} is the viewer's own comment; pass --react none`);

  const emit = (line) => process.stdout.write(`${line}\n`);

  const existing = findReply(before, body);
  emit(existing ? `already-replied ${existing.url}` : `replied ${postReply(pr, item, body)}`);

  if (options.resolve) {
    if (before.isResolved) emit(`already-resolved ${item.id}`);
    else {
      const result = graphql(pr.host, RESOLVE_MUTATION, { id: item.id });
      if (!result.ok)
        throw new Failure(EXIT_FAILURE, `resolve failed: ${result.reason}`, "resolve-failed");
      emit(`resolved ${item.id}`);
    }
  }

  if (options.react !== "none") {
    if (before.reacted(options.react)) emit(`already-reacted ${options.react}`);
    else {
      const result = graphql(pr.host, REACT_MUTATION, {
        subjectId: item.reactionSubject,
        content: options.react,
      });
      if (result.ok) emit(`reacted ${options.react}`);
      else {
        process.stderr.write(`${SCRIPT}: reaction failed: ${result.reason}\n`);
        emit(`reaction-failed ${options.react}`);
      }
    }
  }

  const after = readState(pr, item);
  if (findReply(after, body) === undefined)
    throw new Failure(EXIT_FAILURE, "the reply is not on GitHub", "not-verified reply-missing");
  if (options.resolve && !after.isResolved)
    throw new Failure(EXIT_FAILURE, "the thread is not resolved", "not-verified thread-unresolved");
  emit("verified");
  return EXIT_OK;
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    process.exitCode = settle(parseArgs(process.argv.slice(2)));
  } catch (error) {
    if (!(error instanceof Failure)) throw error;
    if (error.token) process.stdout.write(`${error.token}\n`);
    process.stderr.write(
      error.message.startsWith(`${SCRIPT}:`)
        ? `${error.message}\n`
        : `${SCRIPT}: ${error.message}\n`,
    );
    process.stderr.write(`see ${DOC_PATH}\n`);
    process.exitCode = error.exitCode;
  }
}
