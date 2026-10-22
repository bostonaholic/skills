#!/usr/bin/env node

/**
 * Renders the approval body from the watch's state file and the final poll.
 *
 *     node "<skill-dir>/scripts/render-approval.mjs" <state.json> <poll.json>
 *
 * `<state.json>` is the state file `poll.mjs` documents; `<poll.json>` is the
 * saved stdout of the final `poll.mjs` run. Reads no network.
 *
 * Stdout, on exit 0 only: the body, one paragraph and a trailing newline.
 * The counts T, S, and C are the final poll's tracked threads, review
 * summaries, and conversation comments; R is the tracked threads listed in
 * `resolvedBySkill`. The rendering rules:
 *
 *   - With no tracked PR-level items, the body says "all <T> review threads
 *     opened by @<viewer> are resolved" and drops the sentence on how
 *     PR-level settlement was judged.
 *   - The resolved-by-this-review sentence drops when R is zero, and says the
 *     record was lost when `resolvedBySkill` is null.
 *   - A count that differs from its `armCounts` count names both, and a null
 *     `armCounts` says the arm-time count was lost.
 *   - Equal arm and approval SHAs collapse into one sentence; a null
 *     `armHead` says the baseline was unrecoverable and the user confirmed.
 *
 * The body never names this skill, a command, or an agent. Any disclosure
 * marker the user or project prescribes is appended by the caller.
 *
 * Exit codes:
 *
 *   0  rendered
 *   2  usage fault: wrong arguments, an unreadable or malformed file, or a
 *      poll whose `approvalReady` is not true
 */

import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { EXIT_OK, EXIT_USAGE, Failure, runCli } from "./github.mjs";
import { validateState } from "./poll.mjs";

const SCRIPT = "render-approval.mjs";
// The skill file that explains each exit code.
const DOC_PATH = fileURLToPath(new URL("../references/approve.md", import.meta.url));
const USAGE = `usage: ${SCRIPT} <state.json> <poll.json>`;

function count(n, noun, armCount) {
  const text = `${n} ${noun}`;
  if (armCount === undefined) return `${text} (arm-time count lost)`;
  return armCount === n ? text : `${text} (${armCount} at arm)`;
}

export function renderApproval(state, poll) {
  const wellFormed =
    typeof poll?.viewer === "string" &&
    typeof poll?.pr?.head === "string" &&
    Array.isArray(poll?.items) &&
    ["threads", "reviewSummaries", "conversationComments"].every((shape) =>
      Number.isInteger(poll?.counts?.[shape]?.tracked),
    );
  if (!wellFormed) throw new Failure(EXIT_USAGE, "malformed poll output");
  if (poll.approvalReady !== true) throw new Failure(EXIT_USAGE, "the poll is not approval-ready");
  const arm = state.armCounts ?? {};
  const t = poll.counts.threads.tracked;
  const s = poll.counts.reviewSummaries.tracked;
  const c = poll.counts.conversationComments.tracked;
  const threads = count(t, "review threads", arm.threads);
  const viewer = `@${poll.viewer}`;
  const sentences = [];

  if (s + c === 0) {
    sentences.push(
      `Approved automatically: all ${threads} opened by ${viewer} are resolved, and each settlement was re-reviewed against the diff and accepted.`,
    );
  } else {
    const summaries = count(s, "review summaries", arm.reviewSummaries);
    const comments = count(c, "conversation comments", arm.conversationComments);
    sentences.push(
      `Approved automatically: all ${threads}, ${summaries}, and ${comments} from ${viewer} are settled, and each settlement was re-reviewed against the diff and accepted.`,
    );
  }

  if (state.resolvedBySkill === null) {
    sentences.push(
      "The record of which threads this review resolved was lost; each was resolved only after its reply was checked against the branch.",
    );
  } else {
    const threadIds = new Set(poll.items.filter((i) => i.shape === "thread").map((i) => i.id));
    const r = state.resolvedBySkill.filter((id) => threadIds.has(id)).length;
    if (r > 0)
      sentences.push(
        `${r} of those threads were resolved by this review after the reply was checked against the branch; the rest the author resolved.`,
      );
  }

  if (s + c > 0)
    sentences.push(
      "Review summaries and conversation comments carry no resolve state, so their settlement was judged from the change and the replies rather than read from a resolved flag.",
    );

  const head = poll.pr.head;
  if (state.armHead === null)
    sentences.push(
      `Head commit at approval time: ${head}. The arm-time head commit was unrecoverable, and the reviewer confirmed the approval without it.`,
    );
  else if (state.armHead === head) sentences.push(`Head commit at arm and approval time: ${head}.`);
  else
    sentences.push(
      `Head commit at approval time: ${head}. Armed at head commit: ${state.armHead}.`,
    );

  return `${sentences.join(" ")}\n`;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Failure(EXIT_USAGE, `cannot read ${path}: ${error.code ?? error.message}`);
  }
}

function main(argv) {
  if (argv.length !== 2) throw new Failure(EXIT_USAGE, USAGE);
  const state = validateState(readJson(argv[0]));
  process.stdout.write(renderApproval(state, readJson(argv[1])));
  return EXIT_OK;
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  runCli(SCRIPT, DOC_PATH, main);
}
