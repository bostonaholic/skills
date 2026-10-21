#!/usr/bin/env node

/**
 * Resolves the PR to watch, checks the arm refusals GitHub state decides, and
 * prints the viewer's PR-level feedback for the arm-time classification.
 *
 *     node "<skill-dir>/scripts/arm.mjs" [<pr-number>|<pr-url>]
 *
 * `<pr-url>` is `https://<host>/<owner>/<repo>/pull/<n>`. A number, or no
 * argument for the current branch's PR, resolves through `gh pr view` in the
 * working directory's repository. Requires `gh` on PATH, signed in to the
 * host. Host, owner, repo, and number come from the canonical `url` that
 * `gh pr view` returns: the base repository, never a fork's.
 *
 * Stdout, one line of JSON, on exit 0 and exit 3:
 *
 *   {
 *     "pr": { url, state, isDraft, author, head, autoMerge },
 *     "viewer": "<login>",
 *     "refusal": null | "merged" | "closed" | "viewer-is-author",
 *     "pendingReview": true when the viewer holds an unsubmitted review,
 *     "viewerLatestReview": state of the viewer's latest submitted review, or null,
 *     "threads": { tracked, resolved },
 *     "prLevel": [ { id, shape, url, at, body } ]
 *   }
 *
 * A tracked thread is one whose first comment is the viewer's and submitted.
 * `prLevel` lists, in GitHub order, the viewer's submitted review summaries
 * with a non-blank body (`shape: "reviewSummary"`, `at` its `submittedAt`)
 * and the viewer's conversation comments (`shape: "conversationComment"`,
 * `at` its `createdAt`). These are the only bodies printed: no thread text
 * and no other author's text. On a refusal `prLevel` is empty.
 *
 * Exit codes:
 *
 *   0    armable: classify `prLevel`, then write the state file
 *   1    a read failed or was incomplete; stdout is empty
 *   2    usage fault: a malformed argument, or a PR `gh pr view` cannot
 *        resolve (a bare number outside a checkout of its repository)
 *   3    refused: `refusal` names why; stdout still holds the JSON
 *   127  `gh` is not on PATH
 */

import { realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  EXIT_OK,
  EXIT_USAGE,
  Failure,
  fetchFeedback,
  parsePrUrl,
  runCli,
  runGh,
} from "./github.mjs";

const SCRIPT = "arm.mjs";
// The skill file that explains each exit code.
const DOC_PATH = fileURLToPath(new URL("../references/arm.md", import.meta.url));
const USAGE = `usage: ${SCRIPT} [<pr-number>|<pr-url>]`;
const EXIT_REFUSED = 3;
const PR_NUMBER_PATTERN = /^[1-9][0-9]*$/;

const loginOf = (node) => node.author?.login ?? null;

export function isTrackedThread(thread, viewer) {
  const first = thread.comments[0];
  return first !== undefined && loginOf(first) === viewer && first.state !== "PENDING";
}

export function summarizeArm(view, feedback) {
  const viewer = feedback.viewer.login;
  const pr = {
    url: feedback.pr.url,
    state: feedback.pr.state,
    isDraft: view.isDraft === true,
    author: view.author?.login ?? null,
    head: feedback.pr.headRefOid,
    autoMerge: feedback.pr.autoMergeEnabled,
  };
  let refusal = null;
  if (pr.state === "MERGED") refusal = "merged";
  else if (pr.state === "CLOSED") refusal = "closed";
  else if (pr.author === viewer) refusal = "viewer-is-author";

  const viewerReviews = feedback.reviewSummaries.filter((review) => loginOf(review) === viewer);
  const submitted = viewerReviews.filter((review) => review.state !== "PENDING");
  const threads = feedback.reviewThreads.filter((thread) => isTrackedThread(thread, viewer));

  const prLevel =
    refusal !== null
      ? []
      : [
          ...submitted
            .filter((review) => typeof review.body === "string" && review.body.trim() !== "")
            .map((review) => ({
              id: review.id,
              shape: "reviewSummary",
              url: review.url,
              at: review.submittedAt,
              body: review.body,
            })),
          ...feedback.conversationComments
            .filter((comment) => loginOf(comment) === viewer)
            .map((comment) => ({
              id: comment.id,
              shape: "conversationComment",
              url: comment.url,
              at: comment.createdAt,
              body: comment.body,
            })),
        ];

  return {
    pr,
    viewer,
    refusal,
    pendingReview: viewerReviews.some((review) => review.state === "PENDING"),
    viewerLatestReview: submitted.at(-1)?.state ?? null,
    threads: {
      tracked: threads.length,
      resolved: threads.filter((thread) => thread.isResolved).length,
    },
    prLevel,
  };
}

function resolvePr(target) {
  // --json limits the read to these fields, so the title and body never print.
  const run = runGh([
    "pr",
    "view",
    ...(target === null ? [] : [target]),
    "--json",
    "url,isDraft,author",
  ]);
  if (run.status !== 0) {
    process.stderr.write(run.stderr);
    throw new Failure(EXIT_USAGE, `gh pr view could not resolve ${target ?? "the current branch"}`);
  }
  let view;
  try {
    view = JSON.parse(run.stdout);
  } catch {
    throw new Failure(EXIT_USAGE, "gh pr view printed output that is not JSON");
  }
  parsePrUrl(view?.url);
  return view;
}

function main(argv) {
  if (argv.length > 1) throw new Failure(EXIT_USAGE, USAGE);
  const target = argv[0] ?? null;
  if (target !== null && !PR_NUMBER_PATTERN.test(target)) {
    try {
      parsePrUrl(target);
    } catch {
      throw new Failure(EXIT_USAGE, `${USAGE}: not a PR number or URL: ${target}`);
    }
  }
  const view = resolvePr(target);
  const summary = summarizeArm(view, fetchFeedback(view.url, { bodies: true }));
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  if (summary.refusal !== null) throw new Failure(EXIT_REFUSED, `refused: ${summary.refusal}`);
  return EXIT_OK;
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  runCli(SCRIPT, DOC_PATH, main);
}
