#!/usr/bin/env node

/**
 * One structural poll of a watched PR: recomputes the tracked set, the gate,
 * the re-review triggers, the third-party check, approval readiness, and the
 * merge-safety checks from GitHub state plus the watch's state file.
 *
 *     node "<skill-dir>/scripts/poll.mjs" <pr-url> --state <state.json>
 *
 * `<pr-url>` is the canonical `https://<host>/<owner>/<repo>/pull/<n>` that
 * `arm.mjs` printed. Requires `gh` on PATH, signed in to the host. The read
 * runs `../shared/scripts/fetch-pr-feedback.mjs --no-bodies`, so no comment
 * or review text ever reaches this script or its output. When any tracked
 * PR-level item is present it also reads the head commit's committer date.
 * The script never writes: the model edits the state file.
 *
 * State file, written by the model at arm and edited after each verdict:
 *
 *   {
 *     "armHead": "<sha>" | null,         // null: lost, the baseline is missing
 *     "autoMergeConfirmed": false,       // the user confirmed an auto-merge run
 *     "trackedItems": ["<node id>"],     // PR-level items the classification tracked
 *     "armCounts": { "threads": 0, "reviewSummaries": 0,
 *                    "conversationComments": 0 } | null,   // null: lost
 *     "resolvedBySkill": ["<thread id>"] | null,           // null: lost
 *     "verdicts": { "<item id>": { "key": "<trigger key>",
 *                   "verdict": "addressed" | "answered" | "pending" | "rejected" } }
 *   }
 *
 * Tracked set: every thread whose first comment is the viewer's and submitted
 * (never one from a PENDING review), resolved or not, plus each
 * `trackedItems` id that is still the viewer's review summary or conversation
 * comment. A PR-level item is engaged once the head commit's committer date is
 * later than the item's `submittedAt` or `createdAt`.
 *
 * Settlement key: a thread's is `<last non-viewer reply id or none>|<resolved
 * or open>`; an engaged PR-level item's is the head SHA. A verdict is current
 * only when its recorded `key` equals the item's key now, so a new reply, a
 * resolve, a reopen, or a later push voids it.
 *
 * Stdout, on exit 0 only, one line of JSON:
 *
 *   {
 *     "pr": { url, state, head, autoMerge },
 *     "viewer": "<login>",
 *     "counts": { threads: { tracked, resolved },
 *                 reviewSummaries: { tracked, engaged },
 *                 conversationComments: { tracked, engaged } },
 *     "items": [ { id, shape, url, path?, isResolved?, engaged?, viewerReplied?,
 *                  inGate, verdict } ],   // verdict: the current one, or null
 *     "gate": [ "<id>" ],                 // unresolved threads, unengaged items
 *     "triggers": [ { id, shape, kind, key, resolvedKey? } ],
 *     "thirdParty": [ { id, logins } ],   // unresolved threads only
 *     "vanished": [ "<id>" ],             // trackedItems no longer found
 *     "approvalReady": bool,
 *     "safety": { headDrift, autoMergeUnconfirmed, baselineMissing },
 *     "snapshot": "<one line>"
 *   }
 *
 * `shape` is `thread`, `reviewSummary`, or `conversationComment`; items keep
 * that order, then GitHub order. A trigger fires for a thread that is
 * resolved or carries a non-viewer reply, and for an engaged PR-level item,
 * when the item has no current verdict; `kind` is `resolved`, `reply`,
 * `reopened`, or `engaged`, and `key` is what to record with its verdict. A
 * thread trigger's `resolvedKey` is the key the thread holds once resolved
 * with no new reply. `viewerReplied` is true when a viewer comment sits below
 * the thread's first. A third login is neither the viewer nor the thread's
 * earliest non-viewer author; a deleted author prints as `(deleted)`.
 * `approvalReady` holds when the PR is OPEN, the tracked set is non-empty,
 * the gate and triggers are empty, and every item's current verdict is
 * `addressed` or `answered`. `headDrift` is true when the head differs from
 * a non-null `armHead`; `autoMergeUnconfirmed` when auto-merge is on and
 * `autoMergeConfirmed` is false; `baselineMissing` when `armHead` is null.
 *
 * Exit codes:
 *
 *   0    the poll is complete
 *   1    poll failure: a read failed or was incomplete; stdout is empty
 *   2    usage fault: bad arguments, a malformed URL, or a missing or
 *        malformed state file. Nothing was read
 *   127  `gh` is not on PATH
 */

import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  EXIT_FAILURE,
  EXIT_OK,
  EXIT_USAGE,
  Failure,
  SHA_PATTERN,
  fetchFeedback,
  parsePrUrl,
  runCli,
  runGh,
} from "./github.mjs";

const SCRIPT = "poll.mjs";
const USAGE = `usage: ${SCRIPT} <pr-url> --state <state.json>`;
const VERDICTS = ["addressed", "answered", "pending", "rejected"];
const PASSING = new Set(["addressed", "answered"]);
const PR_LEVEL_SHAPES = ["reviewSummary", "conversationComment"];
const COUNT_FIELDS = ["threads", "reviewSummaries", "conversationComments"];

const loginOf = (node) => node.author?.login ?? null;
const isStringArray = (value) => Array.isArray(value) && value.every((v) => typeof v === "string");
const isCount = (value) => Number.isInteger(value) && value >= 0;

export function validateState(state) {
  const fault = (field) => {
    throw new Failure(EXIT_USAGE, `malformed state file: ${field}`);
  };
  if (state === null || typeof state !== "object" || Array.isArray(state)) fault("not an object");
  if (state.armHead !== null && !SHA_PATTERN.test(state.armHead ?? "")) fault("armHead");
  if (typeof state.autoMergeConfirmed !== "boolean") fault("autoMergeConfirmed");
  if (!isStringArray(state.trackedItems)) fault("trackedItems");
  if (
    state.armCounts !== null &&
    !(typeof state.armCounts === "object" && COUNT_FIELDS.every((f) => isCount(state.armCounts[f])))
  )
    fault("armCounts");
  if (state.resolvedBySkill !== null && !isStringArray(state.resolvedBySkill))
    fault("resolvedBySkill");
  if (
    state.verdicts === null ||
    typeof state.verdicts !== "object" ||
    Array.isArray(state.verdicts)
  )
    fault("verdicts");
  for (const [id, record] of Object.entries(state.verdicts))
    if (typeof record?.key !== "string" || !VERDICTS.includes(record?.verdict))
      fault(`verdicts.${id}`);
  return state;
}

function threadItem(thread, viewer, recorded) {
  const [first, ...replies] = thread.comments;
  const lastReply = replies.filter((comment) => loginOf(comment) !== viewer).at(-1);
  const replyId = lastReply?.id ?? "none";
  const key = `${replyId}|${thread.isResolved ? "resolved" : "open"}`;
  const resolvedKey = `${replyId}|resolved`;
  const current = recorded?.key === key ? recorded.verdict : null;

  let kind = null;
  if (current === null) {
    if (recorded === undefined) {
      if (thread.isResolved) kind = "resolved";
      else if (lastReply !== undefined) kind = "reply";
    } else if (thread.isResolved && recorded.key === `${replyId}|open`) kind = "resolved";
    else if (!thread.isResolved && recorded.key === resolvedKey) kind = "reopened";
    else kind = "reply";
  }

  let counterpart;
  const thirdLogins = [];
  for (const comment of thread.comments) {
    const login = loginOf(comment);
    if (login === viewer) continue;
    if (login !== null && counterpart === undefined) counterpart = login;
    else if (login !== counterpart) {
      const name = login ?? "(deleted)";
      if (!thirdLogins.includes(name)) thirdLogins.push(name);
    }
  }

  return {
    item: {
      id: thread.id,
      shape: "thread",
      url: first.url,
      path: thread.path,
      isResolved: thread.isResolved,
      viewerReplied: replies.some((comment) => loginOf(comment) === viewer),
      inGate: !thread.isResolved,
      verdict: current,
    },
    trigger: kind === null ? null : { id: thread.id, shape: "thread", kind, key, resolvedKey },
    thirdLogins: thread.isResolved ? [] : thirdLogins,
  };
}

function prLevelItem(node, shape, head, headCommittedAt, recorded) {
  const at = shape === "reviewSummary" ? node.submittedAt : node.createdAt;
  const engaged = headCommittedAt !== null && Date.parse(headCommittedAt) > Date.parse(at);
  const current = engaged && recorded?.key === head ? recorded.verdict : null;
  return {
    item: { id: node.id, shape, url: node.url, engaged, inGate: !engaged, verdict: current },
    trigger:
      engaged && current === null ? { id: node.id, shape, kind: "engaged", key: head } : null,
  };
}

export function trackedPrLevel(feedback, state) {
  const viewer = feedback.viewer.login;
  const tracked = new Set(state.trackedItems);
  const pick = (nodes) => nodes.filter((node) => tracked.has(node.id) && loginOf(node) === viewer);
  return {
    reviewSummary: pick(feedback.reviewSummaries),
    conversationComment: pick(feedback.conversationComments),
  };
}

export function evaluatePoll(feedback, state, headCommittedAt) {
  const viewer = feedback.viewer.login;
  const head = feedback.pr.headRefOid;
  const results = feedback.reviewThreads
    .filter((thread) => {
      const first = thread.comments[0];
      return first !== undefined && loginOf(first) === viewer && first.state !== "PENDING";
    })
    .map((thread) => threadItem(thread, viewer, state.verdicts[thread.id]));
  const prLevel = trackedPrLevel(feedback, state);
  for (const shape of PR_LEVEL_SHAPES)
    for (const node of prLevel[shape])
      results.push(prLevelItem(node, shape, head, headCommittedAt, state.verdicts[node.id]));

  const items = results.map((result) => result.item);
  const triggers = results.map((result) => result.trigger).filter((trigger) => trigger !== null);
  const gate = items.filter((item) => item.inGate).map((item) => item.id);
  const found = new Set(items.map((item) => item.id));
  const ofShape = (shape) => items.filter((item) => item.shape === shape);
  const engagedCount = (shape) => ofShape(shape).filter((item) => item.engaged).length;
  const counts = {
    threads: {
      tracked: ofShape("thread").length,
      resolved: ofShape("thread").filter((item) => item.isResolved).length,
    },
    reviewSummaries: {
      tracked: ofShape("reviewSummary").length,
      engaged: engagedCount("reviewSummary"),
    },
    conversationComments: {
      tracked: ofShape("conversationComment").length,
      engaged: engagedCount("conversationComment"),
    },
  };
  const pr = {
    url: feedback.pr.url,
    state: feedback.pr.state,
    head,
    autoMerge: feedback.pr.autoMergeEnabled,
  };
  const approvalReady =
    pr.state === "OPEN" &&
    items.length > 0 &&
    gate.length === 0 &&
    triggers.length === 0 &&
    items.every((item) => PASSING.has(item.verdict));
  const safety = {
    headDrift: state.armHead !== null && state.armHead !== head,
    autoMergeUnconfirmed: pr.autoMerge && !state.autoMergeConfirmed,
    baselineMissing: state.armHead === null,
  };
  const snapshot = [
    `threads ${counts.threads.resolved}/${counts.threads.tracked} resolved`,
    `review summaries ${counts.reviewSummaries.engaged}/${counts.reviewSummaries.tracked} engaged`,
    `conversation comments ${counts.conversationComments.engaged}/${counts.conversationComments.tracked} engaged`,
    `head ${head} (armed ${state.armHead ?? "unknown"})`,
    `auto-merge ${pr.autoMerge ? "on" : "off"}`,
    `verdicts ${items.map((item) => `${item.id}=${item.verdict ?? "none"}`).join(", ") || "none"}`,
  ].join("; ");

  return {
    pr,
    viewer,
    counts,
    items,
    gate,
    triggers,
    thirdParty: results
      .filter((result) => result.thirdLogins?.length > 0)
      .map((result) => ({ id: result.item.id, logins: result.thirdLogins })),
    vanished: state.trackedItems.filter((id) => !found.has(id)),
    approvalReady,
    safety,
    snapshot,
  };
}

function headCommittedDate(pr, head) {
  const run = runGh([
    "api",
    "--hostname",
    pr.host,
    `repos/${pr.owner}/${pr.repo}/commits/${head}`,
    "--jq",
    ".commit.committer.date",
  ]);
  const date = run.stdout.trim();
  if (run.status !== 0) {
    process.stderr.write(run.stderr);
    throw new Failure(EXIT_FAILURE, `cannot read the date of head commit ${head}`);
  }
  if (Number.isNaN(Date.parse(date)))
    throw new Failure(EXIT_FAILURE, `head commit ${head} has no committer date`);
  return date;
}

function readState(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    throw new Failure(EXIT_USAGE, `cannot read state file ${path}: ${error.code ?? error.message}`);
  }
  try {
    return validateState(JSON.parse(text));
  } catch (error) {
    if (error instanceof Failure) throw error;
    throw new Failure(EXIT_USAGE, `state file ${path} is not JSON`);
  }
}

function main(argv) {
  if (argv.length !== 3 || argv[1] !== "--state") throw new Failure(EXIT_USAGE, USAGE);
  const [url, , statePath] = argv;
  const pr = parsePrUrl(url);
  const state = readState(statePath);
  const feedback = fetchFeedback(url, { bodies: false });
  const prLevel = trackedPrLevel(feedback, state);
  const needsDate = PR_LEVEL_SHAPES.some((shape) => prLevel[shape].length > 0);
  const committedAt = needsDate ? headCommittedDate(pr, feedback.pr.headRefOid) : null;
  process.stdout.write(`${JSON.stringify(evaluatePoll(feedback, state, committedAt))}\n`);
  return EXIT_OK;
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  runCli(SCRIPT, main);
}
