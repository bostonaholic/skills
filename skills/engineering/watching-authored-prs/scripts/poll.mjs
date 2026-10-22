#!/usr/bin/env node

/**
 * Runs one watch poll on an authored PR: reads its head and checks, fetches
 * its feedback with the shared fetch script, compares both against the
 * watch's state file, and prints what changed.
 *
 *     node "<skill-dir>/scripts/poll.mjs" <pr-url> --state <state.json> --out <feedback.json> \
 *       --feedback-grant <present-then-stop|authorized> --ci-grant <report|rerun|fix>
 *
 * `<pr-url>` is `https://<host>/<owner>/<repo>/pull/<n>`. Requires `gh` on
 * PATH, signed in to `<host>`; every `gh` call names the host.
 *
 * Reads, in order: `gh pr view` for the head SHA, the status-check rollup
 * length, and the mergeable state; `gh pr checks` when that length is above
 * 0; then `../shared/scripts/fetch-pr-feedback.mjs`, whose `pr.headRefOid` is
 * the second head read. The two head reads bracket the checks read.
 *
 * `--out` receives the fetch script's complete JSON, bodies included, for
 * `addressing-pr-comments`. Stdout never carries a comment body.
 *
 * State file. A missing `--state` file means cycle 0 of a new arming: the
 * baseline is empty, so every unresolved thread and every PR-level item is
 * new. After each successful poll the script writes the file (whole, through a
 * rename) as:
 *
 *   {
 *     "version": 2,
 *     "pr": "<pr-url>",
 *     "head": "<40-hex head SHA at this poll>",
 *     "state": "OPEN" | "MERGED" | "CLOSED",
 *     "reviewDecision": "<GitHub reviewDecision>" | null,
 *     "unresolvedThreadIds": [ "<thread id>", ... ],
 *     "triagedPrLevelIds": [ "<review or comment id>", ... ],
 *     "reportedFailures": [ [ "<head SHA>", "<workflow>", "<name>", "<jobId>" | "" ], ... ]
 *   }
 *
 * Arrays are sorted. A PR-level id joins `triagedPrLevelIds` when a poll
 * reports it in `newPrLevelIds`, because every reported id goes to triage in
 * that cycle and an item triage leaves open stops the loop. A failure event
 * joins `reportedFailures` when a poll reports it in `newFailures`.
 *
 * Rules:
 *
 *   - PR-level item: a conversation comment, or a review summary whose state
 *     is not PENDING and whose body is not blank, by anyone but the viewer
 *     (a null author counts as someone else).
 *   - feedbackChange: a new PR-level id, or, against a prior state, a
 *     different unresolved-thread set or a changed `state` or
 *     `reviewDecision`. At cycle 0: any unresolved thread or PR-level item.
 *   - thirdParty: each unresolved thread that has a viewer comment and a
 *     third login, as `shared/watch-loop.md` defines it (a null author is a
 *     third login).
 *   - emptyChangesRequested: each non-viewer reviewer whose latest APPROVED,
 *     CHANGES_REQUESTED, or DISMISSED review is CHANGES_REQUESTED with a blank
 *     body, and who has no comment in any review thread.
 *   - CI buckets: `pass` and `skipping` pass, `pending` is pending, anything
 *     else fails. A logical check is `workflow` plus `name`; a failure event is
 *     the head SHA, the logical check, and its `jobId` ("" with none), so a
 *     re-run job that fails again on the same head is a new event.
 *   - newFailures: failing checks whose failure event is not yet reported,
 *     sorted by workflow then name. A `fail` whose link is an Actions job URL
 *     of this repository carries its numeric `jobId`; at most
 *     MAX_LOG_FAILURES_PER_CYCLE of those are reported per poll, and the rest
 *     stay unreported (counted in `deferredFailures`) for a later poll. A
 *     failure with no readable log carries `jobId: null` and a `noLog` reason.
 *   - When the two head reads differ, `ciSkipped` is "head-moved" and no
 *     failure is reported.
 *   - conflicting: GitHub's mergeable state is CONFLICTING. UNKNOWN, while
 *     GitHub computes it, is not a conflict; a later poll reads it again.
 *
 * Stdout, on exit 0 only, one line of JSON:
 *
 *   {
 *     "head": "<40-hex>", "snapshot": "<the snapshot line>",
 *     "terminal": "MERGED" | "CLOSED" | null,
 *     "approved": <bool>,
 *     "conflicting": <bool>,
 *     "thirdParty": [ { "thread": "<id>", "logins": [ "<login>" | null ] } ],
 *     "emptyChangesRequested": [ "<login>" | null ],
 *     "feedbackChange": <bool>,
 *     "newPrLevelIds": [ "<id>" ],
 *     "ciSkipped": "head-moved" | null,
 *     "newFailures": [ { "check": "<display name>", "bucket": "<bucket>",
 *                        "state": "<state>", "jobId": "<digits>" | null,
 *                        "noLog": "not-an-actions-job" | "bucket-<bucket>" | null } ],
 *     "deferredFailures": <n>
 *   }
 *
 * The display name is `<workflow> / <name>`, or `<name>` with no workflow.
 * The snapshot line is:
 *
 *   feedback <grant>, CI <grant> | head <7-hex> | threads <n>, summaries <n>, comments <n> | CI <p> pending, <n> passing, <f> failing[ | failing: `<name>`, ...][ | pending: `<name>`, ...]
 *
 * where threads counts unresolved threads and summaries and comments count new
 * PR-level items. The CI part reads `CI 0 checks` with an empty rollup and
 * `CI head moved during poll` when the head moved.
 *
 * Exit codes:
 *
 *   0  the poll is complete; stdout, `--out`, and `--state` are written
 *   1  poll failure: a read failed or was incomplete, a head SHA is not 40 hex
 *      characters, `gh pr view` printed no mergeable state, or a non-empty
 *      rollup came with an empty or non-JSON checks list. Nothing is written; stderr names the failure
 *   2  usage fault: a bad argument, a state file for another PR or of another
 *      shape or version, or a PR the fetch script cannot resolve. Nothing is
 *      written
 *   127  `gh` is not on PATH
 */

import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT = "poll.mjs";
const USAGE = `${SCRIPT}: usage: ${SCRIPT} <pr-url> --state <state.json> --out <feedback.json> --feedback-grant <present-then-stop|authorized> --ci-grant <report|rerun|fix>`;
// The skill file that explains each exit code.
const DOC_PATH = fileURLToPath(new URL("../SKILL.md", import.meta.url));
const FETCH_SCRIPT = fileURLToPath(
  new URL("../shared/scripts/fetch-pr-feedback.mjs", import.meta.url),
);

// Same shape fetch-pr-feedback.mjs accepts: GitHub's 39-character login and
// 100-character repository-name limits, a DNS name of at most 253 characters.
const PR_URL_PATTERN =
  /^https:\/\/([A-Za-z0-9.-]{1,253})\/([A-Za-z0-9._-]{1,39})\/([A-Za-z0-9._-]{1,100})\/pull\/([1-9][0-9]*)$/;
// A full SHA-1 object name; a short or empty head cannot key a failure event.
const SHA_PATTERN = /^[0-9a-f]{40}$/;
// Seven characters is git's default abbreviation.
const SHORT_SHA_LENGTH = 7;
// Each log read costs a call and up to 200 lines of context, so a burst of
// failures is reported a few at a time across polls.
const MAX_LOG_FAILURES_PER_CYCLE = 3;
// The fetch script allows 256 MiB of gh output; its own JSON can be as large.
const OUTPUT_LIMIT_BYTES = 256 * 1024 * 1024;
const FEEDBACK_GRANTS = ["present-then-stop", "authorized"];
const CI_GRANTS = ["report", "rerun", "fix"];
const PASSING_BUCKETS = new Set(["pass", "skipping"]);
const OPINIONATED_REVIEW_STATES = new Set(["APPROVED", "CHANGES_REQUESTED", "DISMISSED"]);

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

function parseArgs(argv) {
  const flags = { "--state": null, "--out": null, "--feedback-grant": null, "--ci-grant": null };
  let url = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg in flags && flags[arg] === null && i + 1 < argv.length) flags[arg] = argv[++i];
    else if (!arg.startsWith("-") && url === null) url = arg;
    else throw new Failure(EXIT_USAGE, USAGE);
  }
  if (url === null || Object.values(flags).some((value) => value === null))
    throw new Failure(EXIT_USAGE, USAGE);
  const match = url.match(PR_URL_PATTERN);
  if (!match) throw new Failure(EXIT_USAGE, `not a PR URL: ${url}`);
  if (!FEEDBACK_GRANTS.includes(flags["--feedback-grant"]))
    throw new Failure(EXIT_USAGE, `unknown feedback grant: ${flags["--feedback-grant"]}`);
  if (!CI_GRANTS.includes(flags["--ci-grant"]))
    throw new Failure(EXIT_USAGE, `unknown CI grant: ${flags["--ci-grant"]}`);
  const [, host, owner, repo, number] = match;
  return {
    pr: { url, host, owner, repo, number },
    statePath: flags["--state"],
    outPath: flags["--out"],
    grants: { feedback: flags["--feedback-grant"], ci: flags["--ci-grant"] },
  };
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function loadState(path, url) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw new Failure(EXIT_FAILURE, `cannot read state file ${path}: ${error.message}`);
  }
  let state;
  try {
    state = JSON.parse(text);
  } catch {
    state = null;
  }
  const valid =
    state !== null &&
    typeof state === "object" &&
    state.version === 2 &&
    state.pr === url &&
    typeof state.head === "string" &&
    typeof state.state === "string" &&
    (state.reviewDecision === null || typeof state.reviewDecision === "string") &&
    isStringArray(state.unresolvedThreadIds) &&
    isStringArray(state.triagedPrLevelIds) &&
    Array.isArray(state.reportedFailures) &&
    state.reportedFailures.every((event) => isStringArray(event) && event.length === 4);
  if (!valid) throw new Failure(EXIT_USAGE, `${path} is not a version 2 watch state for ${url}`);
  return state;
}

function spawn(command, args) {
  const run = spawnSync(command, args, { encoding: "utf8", maxBuffer: OUTPUT_LIMIT_BYTES });
  if (run.error?.code === "ENOENT") throw new Failure(EXIT_NO_GH, `${command} is not on PATH`);
  if (run.error) throw new Failure(EXIT_FAILURE, `cannot run ${command}: ${run.error.message}`);
  return run;
}

function gh(args, label) {
  const run = spawn("gh", args);
  if (run.status !== 0) {
    process.stderr.write(run.stderr);
    throw new Failure(EXIT_FAILURE, `${label} exited ${run.status ?? run.signal}`);
  }
  return run.stdout;
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Failure(EXIT_FAILURE, `${label} printed output that is not JSON`);
  }
}

function readHead(pr) {
  const view = parseJson(
    gh(
      [
        "pr",
        "view",
        pr.number,
        "--repo",
        `${pr.host}/${pr.owner}/${pr.repo}`,
        "--json",
        "headRefOid,statusCheckRollup,mergeable",
        "--jq",
        "{headRefOid, checks: (.statusCheckRollup | length), mergeable}",
      ],
      "gh pr view",
    ),
    "gh pr view",
  );
  if (!SHA_PATTERN.test(view?.headRefOid ?? ""))
    throw new Failure(EXIT_FAILURE, "gh pr view printed a head SHA that is not 40 hex characters");
  if (!Number.isInteger(view.checks) || view.checks < 0)
    throw new Failure(EXIT_FAILURE, "gh pr view printed no status-check rollup length");
  if (typeof view.mergeable !== "string" || view.mergeable === "")
    throw new Failure(EXIT_FAILURE, "gh pr view printed no mergeable state");
  return view;
}

function readChecks(pr) {
  // gh pr checks exits non-zero for failing or pending checks, so only its stdout is judged.
  const run = spawn("gh", [
    "pr",
    "checks",
    pr.number,
    "--repo",
    `${pr.host}/${pr.owner}/${pr.repo}`,
    "--json",
    "workflow,name,bucket,state,link",
  ]);
  let checks;
  try {
    checks = JSON.parse(run.stdout);
  } catch {
    checks = null;
  }
  const wellFormed =
    Array.isArray(checks) &&
    checks.length > 0 &&
    checks.every(
      (check) =>
        typeof check?.name === "string" &&
        typeof check.bucket === "string" &&
        (check.workflow == null || typeof check.workflow === "string") &&
        (check.link == null || typeof check.link === "string"),
    );
  if (!wellFormed) {
    process.stderr.write(run.stderr);
    throw new Failure(EXIT_FAILURE, "the rollup has checks but gh pr checks printed no check list");
  }
  return checks.map((check) => ({
    workflow: check.workflow ?? "",
    name: check.name,
    bucket: check.bucket,
    state: typeof check.state === "string" ? check.state : "",
    link: check.link ?? "",
  }));
}

function fetchFeedback(pr) {
  const run = spawn(process.execPath, [FETCH_SCRIPT, pr.url, "--hostname", pr.host]);
  process.stderr.write(run.stderr);
  if (run.status === EXIT_USAGE || run.status === EXIT_NO_GH)
    throw new Failure(run.status, `fetch-pr-feedback.mjs exited ${run.status}`);
  if (run.status !== 0)
    throw new Failure(EXIT_FAILURE, `fetch-pr-feedback.mjs exited ${run.status ?? run.signal}`);
  const feedback = parseJson(run.stdout, "fetch-pr-feedback.mjs");
  if (!SHA_PATTERN.test(feedback?.pr?.headRefOid ?? ""))
    throw new Failure(EXIT_FAILURE, "the feedback head SHA is not 40 hex characters");
  return { feedback, text: run.stdout };
}

const loginOf = (node) => node?.author?.login ?? null;

function prLevelItems(feedback, viewer) {
  const comments = feedback.conversationComments
    .filter((comment) => loginOf(comment) !== viewer)
    .map((comment) => ({ id: comment.id, kind: "comment" }));
  const summaries = feedback.reviewSummaries
    .filter(
      (review) =>
        loginOf(review) !== viewer &&
        review.state !== "PENDING" &&
        typeof review.body === "string" &&
        review.body.trim() !== "",
    )
    .map((review) => ({ id: review.id, kind: "summary" }));
  return [...summaries, ...comments];
}

function thirdPartyThreads(threads, viewer) {
  const found = [];
  for (const thread of threads) {
    const logins = thread.comments.map(loginOf);
    if (!logins.includes(viewer)) continue;
    const counterpart = logins.find((login) => login !== viewer && login !== null);
    const third = [...new Set(logins.filter((login) => login !== viewer && login !== counterpart))];
    if (third.length > 0) found.push({ thread: thread.id, logins: third });
  }
  return found;
}

function emptyChangesRequests(feedback, viewer) {
  const latest = new Map();
  for (const review of feedback.reviewSummaries)
    if (loginOf(review) !== viewer && OPINIONATED_REVIEW_STATES.has(review.state))
      latest.set(loginOf(review), review);
  const threadAuthors = new Set(
    feedback.reviewThreads.flatMap((thread) => thread.comments.map(loginOf)),
  );
  return [...latest]
    .filter(
      ([login, review]) =>
        review.state === "CHANGES_REQUESTED" &&
        (review.body ?? "").trim() === "" &&
        !threadAuthors.has(login),
    )
    .map(([login]) => login);
}

const displayName = (check) => (check.workflow ? `${check.workflow} / ${check.name}` : check.name);

function codeSpan(text) {
  const flat = text.replace(/[\r\n]+/g, " ");
  return flat.includes("`") ? `\`\` ${flat} \`\`` : `\`${flat}\``;
}

function jobIdOf(check, pr) {
  const escape = (text) => text.replace(/[.]/g, "\\.");
  const pattern = new RegExp(
    `^https://${escape(pr.host)}/${escape(pr.owner)}/${escape(pr.repo)}/actions/runs/[0-9]+/job/([0-9]+)$`,
    "i",
  );
  return check.link.match(pattern)?.[1] ?? null;
}

function classifyCi(checks, head, reported, pr) {
  const sorted = [...checks].sort(
    (a, b) => a.workflow.localeCompare(b.workflow) || a.name.localeCompare(b.name),
  );
  const passing = sorted.filter((check) => PASSING_BUCKETS.has(check.bucket));
  const pending = sorted.filter((check) => check.bucket === "pending");
  const failing = sorted.filter(
    (check) => !PASSING_BUCKETS.has(check.bucket) && check.bucket !== "pending",
  );
  const seen = new Set(reported.map((event) => JSON.stringify(event)));
  const newFailures = [];
  const newEvents = [];
  let logged = 0;
  let deferred = 0;
  for (const check of failing) {
    const jobId = check.bucket === "fail" ? jobIdOf(check, pr) : null;
    const event = [head, check.workflow, check.name, jobId ?? ""];
    const key = JSON.stringify(event);
    if (seen.has(key)) continue;
    seen.add(key);
    if (jobId !== null && logged === MAX_LOG_FAILURES_PER_CYCLE) {
      deferred++;
      continue;
    }
    if (jobId !== null) logged++;
    const noLog =
      jobId !== null
        ? null
        : check.bucket === "fail"
          ? "not-an-actions-job"
          : `bucket-${check.bucket}`;
    newFailures.push({
      check: displayName(check),
      bucket: check.bucket,
      state: check.state,
      jobId,
      noLog,
    });
    newEvents.push(event);
  }
  return { passing, pending, failing, newFailures, newEvents, deferred };
}

function snapshotLine({ grants, head, threads, newItems, rollup, ci, headMoved }) {
  const count = (kind) => newItems.filter((item) => item.kind === kind).length;
  const parts = [
    `feedback ${grants.feedback}, CI ${grants.ci}`,
    `head ${head.slice(0, SHORT_SHA_LENGTH)}`,
    `threads ${threads}, summaries ${count("summary")}, comments ${count("comment")}`,
  ];
  if (headMoved) parts.push("CI head moved during poll");
  else if (rollup === 0) parts.push("CI 0 checks");
  else {
    parts.push(
      `CI ${ci.pending.length} pending, ${ci.passing.length} passing, ${ci.failing.length} failing`,
    );
    const names = (checks) => checks.map((check) => codeSpan(displayName(check))).join(", ");
    if (ci.failing.length > 0) parts.push(`failing: ${names(ci.failing)}`);
    if (ci.pending.length > 0) parts.push(`pending: ${names(ci.pending)}`);
  }
  return parts.join(" | ");
}

const sortedUnique = (values) => [...new Set(values)].sort();

function writeAtomically(path, text) {
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, text);
    renameSync(temporary, path);
  } catch (error) {
    throw new Failure(EXIT_FAILURE, `cannot write ${path}: ${error.message}`);
  }
}

function poll(argv) {
  const { pr, statePath, outPath, grants } = parseArgs(argv);
  const prior = loadState(statePath, pr.url);
  const view = readHead(pr);
  const checks = view.checks > 0 ? readChecks(pr) : [];
  const { feedback, text } = fetchFeedback(pr);
  const head = feedback.pr.headRefOid;
  const headMoved = head !== view.headRefOid;
  const viewer = feedback.viewer.login;

  const unresolved = feedback.reviewThreads.filter((thread) => thread.isResolved === false);
  const unresolvedIds = sortedUnique(unresolved.map((thread) => thread.id));
  const triaged = new Set(prior?.triagedPrLevelIds ?? []);
  const newItems = prLevelItems(feedback, viewer).filter((item) => !triaged.has(item.id));
  const newPrLevelIds = newItems.map((item) => item.id);

  const feedbackChange =
    newPrLevelIds.length > 0 ||
    (prior === null
      ? unresolvedIds.length > 0
      : JSON.stringify(unresolvedIds) !== JSON.stringify(prior.unresolvedThreadIds) ||
        feedback.pr.state !== prior.state ||
        feedback.pr.reviewDecision !== prior.reviewDecision);

  const reported = prior?.reportedFailures ?? [];
  const ci = classifyCi(checks, head, reported, pr);
  const newFailures = headMoved ? [] : ci.newFailures;
  const newEvents = headMoved ? [] : ci.newEvents;

  const result = {
    head,
    snapshot: snapshotLine({
      grants,
      head,
      threads: unresolvedIds.length,
      newItems,
      rollup: view.checks,
      ci,
      headMoved,
    }),
    terminal: ["MERGED", "CLOSED"].includes(feedback.pr.state) ? feedback.pr.state : null,
    approved: feedback.pr.reviewDecision === "APPROVED",
    conflicting: view.mergeable === "CONFLICTING",
    thirdParty: thirdPartyThreads(unresolved, viewer),
    emptyChangesRequested: emptyChangesRequests(feedback, viewer),
    feedbackChange,
    newPrLevelIds,
    ciSkipped: headMoved ? "head-moved" : null,
    newFailures,
    deferredFailures: headMoved ? 0 : ci.deferred,
  };

  const state = {
    version: 2,
    pr: pr.url,
    head,
    state: feedback.pr.state,
    reviewDecision: feedback.pr.reviewDecision ?? null,
    unresolvedThreadIds: unresolvedIds,
    triagedPrLevelIds: sortedUnique([...triaged, ...newPrLevelIds]),
    reportedFailures: sortedUnique([...reported, ...newEvents].map((e) => JSON.stringify(e))).map(
      (key) => JSON.parse(key),
    ),
  };

  writeAtomically(outPath, text.endsWith("\n") ? text : `${text}\n`);
  writeAtomically(statePath, `${JSON.stringify(state, null, 2)}\n`);
  return result;
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    process.stdout.write(`${JSON.stringify(poll(process.argv.slice(2)))}\n`);
    process.exitCode = EXIT_OK;
  } catch (error) {
    if (!(error instanceof Failure)) throw error;
    process.stderr.write(
      error.message.startsWith(`${SCRIPT}:`)
        ? `${error.message}\n`
        : `${SCRIPT}: ${error.message}\n`,
    );
    process.stderr.write(`see ${DOC_PATH}\n`);
    process.exitCode = error.exitCode;
  }
}
