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
 * repository, matching `PR_URL_PATTERN`, with no owner or repository of `.`
 * or `..`. `<head-sha>` is the 40-character commit the reviewer diffed.
 * `<report-file>` holds the report alone, its first line the
 * `**Verdict: ...**` line: the token, optionally after one of the emoji ✅,
 * ❌, or 💬 and a space. The last argument is the at-head flag from Input. Run the script from the reviewed checkout. Requires `gh`
 * on PATH, signed in to `<host>`. Every `gh` call passes `--hostname <host>`,
 * github.com included, so a `GH_HOST` in the environment never redirects the
 * read or the write.
 *
 * Right after the argument checks, before any `git` or `gh` call, the
 * script scans the report for credential patterns (`CREDENTIAL_PATTERNS`):
 * GitHub, AWS, and Slack tokens, `sk-` API keys, and private key headers.
 * The reviewer reads text the PR author wrote, so that text can steer it
 * into quoting a secret. On a match nothing runs, and stderr names the kind
 * of credential but never the matched text.
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
 *   self-authored     APPROVE or REQUEST CHANGES on the viewer's own PR
 *   untrusted-author  APPROVE when the PR's `authorAssociation` is not
 *                     OWNER, MEMBER, or COLLABORATOR, or is missing: the
 *                     verdict comes from a model that read text the author
 *                     wrote
 *   auto-merge        APPROVE while auto-merge is on
 *   head-moved        APPROVE when the PR head is no longer `<head-sha>`
 *   off-head          APPROVE when the flag is `off-head` or the post-time
 *                     check fails
 *
 * The review body is always the whole report. Each finding under
 * `### Findings` that opens with a Conventional Comments label line
 * (`**<label>:**` or `**<label> (<decoration>):**`, optionally after a `- `,
 * `* `, or `1. ` list marker) and carries a `file:` or `**file:**` line is a
 * located finding when that line's first comma-separated location,
 * `<path>:<line>` or `<path>:<start>-<end>` with any backticks around it
 * dropped, names a repo-relative path after normalizing: a leading `./` is
 * dropped, an absolute path under `git rev-parse --show-toplevel` becomes
 * relative, and any other absolute path or a `..` segment drops the finding.
 * When at least one finding is located and the PR head is still `<head-sha>`,
 * the script reads the PR's changed files and posts each located finding
 * whose line is on the right side of the diff as an inline comment holding
 * that finding's text, without its list marker. A range anchors to all its
 * lines when every one is in a single hunk, else to its end line alone. An
 * inline comment's `suggestion` fences become `text` fences, so no comment
 * offers a one-click commit of text the reviewer may have been steered into
 * writing. At most `MAX_INLINE_COMMENTS` post inline; every finding stays in
 * the body unchanged.
 *
 * Stdout, one token line each. The outcome line always comes first:
 *
 *   posted <EVENT> <review-url>    posted and read back
 *   not-posted secret-suspected    the report matches a credential pattern
 *   not-posted pr-merged           the PR merged before the post
 *   not-posted pr-closed           the PR closed before the post
 *   not-posted read-failed         stderr names the failure
 *   not-posted gh-unavailable      `gh` could not be run
 *   failed http-<status>           from gh's "(HTTP <status>)" stderr
 *   failed gh-exit-<code>          gh failed with no HTTP status
 *   unverified no-review-id        the POST response names no review id
 *   unverified read-back-failed    the GET of the new review or its comments
 *                                  failed
 *   unverified state-mismatch      the review state is not the posted event's
 *   unverified commit-mismatch     the review is not on `<head-sha>`
 *   unverified author-mismatch     the review author is not the viewer
 *   unverified url-mismatch        the review url is not on `<pr-url>`
 *   unverified inline-comments-mismatch
 *                                  the review holds a different number of
 *                                  inline comments than were sent
 *
 * After a `posted`, `failed`, or `unverified` outcome, one note line per
 * downgrade reason, in the order above, then the new head when it moved:
 *
 *   downgraded <APPROVE|REQUEST_CHANGES> <reason>
 *   head-moved <current-sha>
 *
 * Last, after a `posted` outcome for a report with a located finding, one
 * inline line:
 *
 *   inline <posted> <located>          <posted> inline comments of <located>
 *                                      located findings
 *   inline-skipped head-moved          the PR head moved; no inline comments
 *   inline-skipped files-read-failed   the changed-files read failed; no
 *                                      inline comments
 *   inline-skipped post-rejected       GitHub rejected the POST with inline
 *                                      comments (HTTP 422), so the review
 *                                      posted again with the body only
 *
 * No stdout line carries a report byte. Stderr carries gh's own stderr, then
 * `post-review.mjs: <reason>`.
 *
 * Exit codes:
 *
 *   0  posted and read back
 *   1  any other outcome after the argument checks. For
 *      `secret-suspected`, nothing ran
 *   2  usage fault: a bad argument count, PR URL, SHA, or at-head flag, an
 *      unreadable report file, or a first line that is not a verdict line.
 *      Nothing ran
 *
 * Constraints:
 *
 *   - The body travels on gh's stdin, never in argv: as `-F body=@-` with no
 *     inline comment, else inside the `--input -` JSON payload with them.
 *   - GitHub rejects a body of 65,536 characters or more with HTTP 422.
 *   - The PR can merge, close, move its head, or enable auto-merge between
 *     the read and the POST: GitHub has no conditional create-review call.
 *   - The head can also move between the PR read and the changed-files read,
 *     so the files can describe a newer diff than `<head-sha>`. A comment on a
 *     line that diff does not hold fails the POST with HTTP 422, which the
 *     body-only retry below covers.
 *   - The post-time check cannot see an untracked file that predates the
 *     review; only the Input flag covers it.
 *   - One retry only: a POST with inline comments that fails with HTTP 422
 *     posts again once with the body-only argv. A 422 means GitHub created no
 *     review, so the retry cannot post twice. Nothing else retries. A
 *     `gh-exit` failure can follow a review GitHub accepted, so the caller
 *     checks the PR before a rerun.
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
// `.` and `..` match the owner and repository classes but would rewrite the REST path.
const DOT_SEGMENTS = new Set([".", ".."]);
const SHA_PATTERN = /^[0-9a-f]{40}$/;
// Only a verdict emoji may precede the token, so `**Verdict: NOT APPROVE**` is no verdict line.
const VERDICT_LINE_PATTERN =
  /^\*\*Verdict: (?:[✅❌💬] )?(APPROVE|REQUEST CHANGES|COMMENT)\*\*\r?$/u;
// `gh api` reports an HTTP error on stderr as `gh: <message> (HTTP <status>)`.
const HTTP_STATUS_PATTERN = /\(HTTP (\d{3})\)/;
const CHECKOUT_FLAGS = new Set(["at-head", "off-head"]);
// Each pattern is a literal prefix and one character class, so a scan is linear in the report.
// The lookbehind keeps a prefix inside a longer word, such as `risk-...`, from matching.
const CREDENTIAL_PATTERNS = [
  ["GitHub token", /(?<![A-Za-z0-9_])gh[pousr]_[A-Za-z0-9]{36}/],
  ["GitHub token", /(?<![A-Za-z0-9_])github_pat_[A-Za-z0-9_]{20}/],
  ["AWS access key id", /(?<![A-Za-z0-9_])AKIA[0-9A-Z]{16}/],
  ["private key", /-----BEGIN [A-Z ]{0,40}PRIVATE KEY-----/],
  ["Slack token", /(?<![A-Za-z0-9_])xox[abprs]-[A-Za-z0-9-]{10}/],
  ["API key", /(?<![A-Za-z0-9_-])sk-[A-Za-z0-9_-]{20}/],
];

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
// GitHub's authorAssociation values for authors with write access or org membership.
const TRUSTED_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
const NOT_POSTED_STATES = { MERGED: "pr-merged", CLOSED: "pr-closed" };
const PR_STATES = new Set(["OPEN", ...Object.keys(NOT_POSTED_STATES)]);

const FINDINGS_HEADING = "### Findings";
const LIST_MARKER_PATTERN = /^(?:[-*]|[0-9]+\.)[ \t]+/;
// `**file:**` is a finding's location key, never a label.
const FINDING_LABEL_PATTERN = /^\*\*(?!file:)[a-z]+(?: \([^)]*\))?:\*\*/;
const FILE_LINE_PATTERN = /^\s*(?:\*\*file:\*\*|file:)\s*(.*)$/;
const SUGGESTION_FENCE_PATTERN = /^([ \t]*(?:`{3,}|~{3,})[ \t]*)suggestion(?=\s|$)/gim;
const LOCATION_PATTERN = /^(.+):([1-9][0-9]*)(?:-([1-9][0-9]*))?$/;
const HUNK_HEADER_PATTERN = /^@@ -[0-9]+(?:,[0-9]+)? \+([0-9]+)(?:,[0-9]+)? @@/;
// Bounds one review's inline comments; the body still carries every finding.
const MAX_INLINE_COMMENTS = 50;
// execFile's 1 MiB default would drop inline comments on a PR with large patches.
const FILES_READ_MAX_BUFFER = 32 * 1024 * 1024;

const EXIT_OK = 0;
const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;

const PR_FACTS_QUERY = `
query($owner: String!, $repo: String!, $number: Int!) {
  viewer { login }
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      author { login }
      authorAssociation
      state
      headRefOid
      autoMergeRequest { enabledAt }
    }
  }
}`;

/**
 * `facts`: `{verdict, viewerLogin, authorLogin, authorAssociation, state,
 * autoMerge, currentHeadSha, reviewedHeadSha, inputFlag,
 * postTimeCheckPassed}`. `verdict` is a verdict token, `state` is OPEN,
 * MERGED, or CLOSED, `authorLogin` is null for a deleted account,
 * `authorAssociation` is GitHub's value or null, and `inputFlag` is
 * `at-head` or `off-head`. Returns `notPosted` (`pr-merged`, `pr-closed`,
 * or null), the event to post, and the note lines in their fixed order.
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
  const { viewerLogin, authorLogin, authorAssociation, autoMerge, inputFlag, postTimeCheckPassed } =
    facts;
  const selfAuthored = authorLogin !== null && authorLogin === viewerLogin;
  const untrustedAuthor = !TRUSTED_ASSOCIATIONS.has(authorAssociation);
  const offHead = inputFlag === "off-head" || !postTimeCheckPassed;
  const approve = verdictEvent === "APPROVE";
  const reasons = [
    ["self-authored", verdictEvent !== "COMMENT" && selfAuthored],
    ["untrusted-author", approve && untrustedAuthor],
    ["auto-merge", approve && autoMerge],
    ["head-moved", approve && headMoved],
    ["off-head", approve && offHead],
  ];
  return reasons.filter(([, applies]) => applies).map(([reason]) => reason);
}

/**
 * Returns `{body, path, line, startLine?}` for each finding under the report's
 * `### Findings` heading that has a usable `file:` location. `toplevel` is the
 * checkout's top-level directory, or null; an absolute path outside it is
 * dropped. For a range, `line` is its end and `startLine` its start.
 */
function parseFindings(report, toplevel = null) {
  return findingBlocks(report).flatMap((lines) => {
    const location = findingLocation(lines, toplevel);
    return location ? [{ body: lines.join("\n"), ...location }] : [];
  });
}

function findingBlocks(report) {
  const lines = report.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trimEnd() === FINDINGS_HEADING);
  if (start === -1) return [];
  const blocks = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("### ")) break;
    const unmarked = line.replace(LIST_MARKER_PATTERN, "");
    if (FINDING_LABEL_PATTERN.test(unmarked)) blocks.push([unmarked]);
    else blocks.at(-1)?.push(line);
  }
  return blocks.map(trimTrailingBlankLines);
}

function trimTrailingBlankLines(lines) {
  let end = lines.length;
  while (end > 0 && lines[end - 1].trim() === "") end -= 1;
  return lines.slice(0, end);
}

function findingLocation(lines, toplevel) {
  const fileLine = lines.map((line) => FILE_LINE_PATTERN.exec(line)).find(Boolean);
  const firstLocation = fileLine?.[1].split(",")[0].trim().replace(/^`|`$/g, "");
  const match = firstLocation && LOCATION_PATTERN.exec(firstLocation);
  if (!match) return null;
  const path = repoRelativePath(match[1], toplevel);
  const start = Number(match[2]);
  const end = Number(match[3] ?? match[2]);
  if (!path || end < start) return null;
  return end > start ? { path, line: end, startLine: start } : { path, line: end };
}

function repoRelativePath(rawPath, toplevel) {
  let path = rawPath.startsWith("./") ? rawPath.slice(2) : rawPath;
  if (path.startsWith("/")) {
    if (!toplevel || !path.startsWith(`${toplevel}/`)) return null;
    path = path.slice(toplevel.length + 1);
  }
  if (path === "" || path.split("/").includes("..")) return null;
  return path;
}

/**
 * `files`: `[{filename, patch}]` from the PR files API. Returns a Map from each
 * filename with a patch to the set of right-side line numbers its hunks show,
 * added and context lines alike. A file with no patch (binary or too large) has
 * no entry.
 */
function rightSideLines(files) {
  const map = new Map();
  for (const { filename, patch } of files) {
    if (typeof patch === "string") map.set(filename, patchRightSideLines(patch));
  }
  return map;
}

function patchRightSideLines(patch) {
  const lines = new Set();
  let next = null;
  for (const text of patch.split("\n")) {
    const hunk = HUNK_HEADER_PATTERN.exec(text);
    if (hunk) next = Number(hunk[1]);
    else if (next !== null && (text.startsWith("+") || text.startsWith(" "))) lines.add(next++);
  }
  return lines;
}

/**
 * Returns the review API's `comments` for the findings whose line is in the
 * diff, at most `MAX_INLINE_COMMENTS`, in finding order. A range keeps its
 * start only when every line of it is in the diff: hunks never touch, so that
 * holds only within one hunk, as GitHub requires.
 */
function planInlineComments(findings, diffLines) {
  const comments = [];
  for (const { body, path, line, startLine } of findings) {
    const lines = diffLines.get(path);
    if (!lines?.has(line)) continue;
    const comment = {
      path,
      line,
      side: "RIGHT",
      body: body.replace(SUGGESTION_FENCE_PATTERN, "$1text"),
    };
    if (startLine !== undefined && rangeInDiff(lines, startLine, line))
      Object.assign(comment, { start_line: startLine, start_side: "RIGHT" });
    comments.push(comment);
  }
  return comments.slice(0, MAX_INLINE_COMMENTS);
}

function rangeInDiff(lines, start, end) {
  if (end - start + 1 > lines.size) return false;
  for (let line = start; line <= end; line += 1) if (!lines.has(line)) return false;
  return true;
}

// Returns `{ args }` or `{ usage }`, the clause naming the fault.
function parseArguments(argv) {
  if (argv.length !== 4) return { usage: `usage: ${USAGE}` };
  const [prUrl, headSha, reportPath, inputFlag] = argv;
  const pullRequest = PR_URL_PATTERN.test(prUrl) ? parsePullRequestUrl(prUrl) : null;
  if (!pullRequest || DOT_SEGMENTS.has(pullRequest.owner) || DOT_SEGMENTS.has(pullRequest.repo))
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

  return { args: { pullRequest, prUrl, headSha, report, verdict, inputFlag } };
}

// Returns the kind of the first credential pattern the report matches, or null.
function credentialKind(report) {
  const text = report.toString("utf8");
  return CREDENTIAL_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

function parsePullRequestUrl(url) {
  const [, , host, owner, repo, , number] = url.split("/");
  return { host, owner, repo, number: Number(number) };
}

const execFileAsync = promisify(execFile);

// Always ends gh's stdin, so a gh that reads fd 0 never waits for input.
async function runGh(args, input, options = {}) {
  const pending = execFileAsync("gh", args, options);
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

async function checkoutTopLevel() {
  const result = await runGit(["rev-parse", "--show-toplevel"]);
  return result.ok ? result.stdout.trim() : null;
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
  const { authorAssociation } = pullRequest;
  return {
    facts: {
      viewerLogin,
      authorLogin: typeof authorLogin === "string" ? authorLogin : null,
      authorAssociation: typeof authorAssociation === "string" ? authorAssociation : null,
      state: pullRequest.state,
      autoMerge: pullRequest.autoMergeRequest != null,
      currentHeadSha: pullRequest.headRefOid,
    },
  };
}

// Returns `{ comments, notes }`: the inline comments to send and the inline stdout line.
async function inlineComments(pullRequest, findings, headMoved) {
  if (findings.length === 0) return { comments: [], notes: [] };
  if (headMoved) return { comments: [], notes: ["inline-skipped head-moved"] };
  const files = await readChangedFiles(pullRequest);
  if (!files) {
    process.stderr.write(`${SCRIPT}: the PR files read failed; posting without inline comments\n`);
    return { comments: [], notes: ["inline-skipped files-read-failed"] };
  }
  const comments = planInlineComments(findings, rightSideLines(files));
  return { comments, notes: [`inline ${comments.length} ${findings.length}`] };
}

// The projection keeps everything but each file's name and patch out of memory.
async function readChangedFiles({ host, owner, repo, number }) {
  const result = await runGh(
    [
      "api",
      "--hostname",
      host,
      "--paginate",
      `repos/${owner}/${repo}/pulls/${number}/files`,
      "--jq",
      ".[] | {filename, patch}",
    ],
    undefined,
    { maxBuffer: FILES_READ_MAX_BUFFER },
  );
  if (!result.ok) {
    process.stderr.write(result.stderr);
    return null;
  }
  const files = nonEmptyLines(result.stdout).map(parseJsonObject);
  const valid = files.every(
    (file) =>
      typeof file?.filename === "string" && (file.patch == null || typeof file.patch === "string"),
  );
  return valid ? files : null;
}

function nonEmptyLines(text) {
  return text.split("\n").filter((line) => line.trim() !== "");
}

// A 422 means GitHub created no review, so one body-only retry cannot post twice.
async function postReviewWithFallback(pullRequest, event, headSha, report, inline) {
  const post = await postReview(pullRequest, event, headSha, report, inline.comments);
  if (post.failed !== "http-422" || inline.comments.length === 0) return { post, inline };
  process.stderr.write(`${SCRIPT}: GitHub rejected the inline comments; posting the body only\n`);
  return {
    post: await postReview(pullRequest, event, headSha, report, []),
    inline: { comments: [], notes: ["inline-skipped post-rejected"] },
  };
}

async function postReview({ host, owner, repo, number }, event, headSha, report, comments) {
  const [fields, input] =
    comments.length === 0
      ? [["-f", `event=${event}`, "-f", `commit_id=${headSha}`, "-F", "body=@-"], report]
      : [
          ["--input", "-"],
          JSON.stringify({ event, commit_id: headSha, body: report.toString("utf8"), comments }),
        ];
  const result = await runGh(
    [
      "api",
      "--hostname",
      host,
      "--method",
      "POST",
      `repos/${owner}/${repo}/pulls/${number}/reviews`,
      ...fields,
    ],
    input,
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
  if (expected.commentCount > 0) {
    const count = await readReviewCommentCount({ host, owner, repo, number }, reviewId);
    if (count === null) return { unverified: "read-back-failed" };
    if (count !== expected.commentCount) return { unverified: "inline-comments-mismatch" };
  }
  return { reviewUrl: review.html_url };
}

// Each page prints its own length, so the count is their sum.
async function readReviewCommentCount({ host, owner, repo, number }, reviewId) {
  const result = await runGh([
    "api",
    "--hostname",
    host,
    "--paginate",
    `repos/${owner}/${repo}/pulls/${number}/reviews/${reviewId}/comments`,
    "--jq",
    "length",
  ]);
  if (!result.ok) process.stderr.write(result.stderr);
  const pages = result.ok ? nonEmptyLines(result.stdout).map((line) => line.trim()) : [];
  if (pages.length === 0 || !pages.every((page) => /^[0-9]+$/.test(page))) return null;
  return pages.reduce((sum, page) => sum + Number(page), 0);
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

  const credential = credentialKind(report);
  if (credential) {
    process.stderr.write(`${SCRIPT}: the report matches a ${credential} pattern\n`);
    printLines(["not-posted secret-suspected"]);
    return EXIT_FAILURE;
  }

  const findings = parseFindings(report.toString("utf8"), await checkoutTopLevel());
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

  const { post, inline } = await postReviewWithFallback(
    pullRequest,
    decision.event,
    headSha,
    report,
    await inlineComments(pullRequest, findings, read.facts.currentHeadSha !== headSha),
  );
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
    commentCount: inline.comments.length,
  });
  if (readBack.unverified) {
    process.stderr.write(`${SCRIPT}: the posted review did not read back as sent\n`);
    printLines([`unverified ${readBack.unverified}`, ...decision.notes]);
    return EXIT_FAILURE;
  }

  printLines([
    `posted ${decision.event} ${readBack.reviewUrl}`,
    ...decision.notes,
    ...inline.notes,
  ]);
  return EXIT_OK;
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
