// Fails when post-review.mjs misreads a finding's `file:` location, anchors an inline comment to a
// line outside the diff, sends more than 50 inline comments or a committable suggestion, changes
// the body-only POST argv, posts inline comments after the head moved, fails the post when the
// files read fails or GitHub rejects the inline comments, or prints `posted` when the review holds
// a different number of inline comments than were sent.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptUrl = new URL(
  "../skills/engineering/reviewing-code/scripts/post-review.mjs",
  import.meta.url,
);
const scriptPath = fileURLToPath(scriptUrl);

// The user's global git config (signing, identity) must never reach a fixture repository.
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
const SCRIPT_TIMEOUT_MS = 30_000;

const PR_URL = "https://github.com/o/r/pull/412";
const REVIEW_URL = `${PR_URL}#pullrequestreview-9001`;
const MOVED_SHA = "2222222222222222222222222222222222222222";

function commentReport(finding) {
  return `**Verdict: 💬 COMMENT**

### Summary

Reviewed the PR diff. Non-blocking findings only.

### Findings

${finding}

### Checks

- Test suite: npm test, 41 passed.
`;
}

// Right-side lines 1-5 (the deleted `d` takes no number) and 41-42, as two hunks.
const APP_PATCH = "@@ -1,4 +1,5 @@\n a\n+b\n c\n-d\n+D\n e\n@@ -40,2 +41,2 @@\n x\n-y\n+Y";

function filesStdout(files) {
  return files.map((file) => `${JSON.stringify(file)}\n`).join("");
}

const FILES_STDOUT = filesStdout([
  { filename: "src/app.mjs", patch: APP_PATCH },
  { filename: "logo.png", patch: null },
]);

// The fake records each call's argv and every stdin byte, base64-encoded.
const FAKE_GH_SOURCE = `
const { appendFileSync, existsSync, readFileSync, readSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
function readStdin() {
  const chunks = [];
  const buffer = Buffer.alloc(65536);
  for (;;) {
    let count;
    try {
      count = readSync(0, buffer, 0, buffer.length, null);
    } catch (error) {
      if (error.code === "EAGAIN") continue;
      if (error.code === "EOF") break;
      throw error;
    }
    if (count === 0) break;
    chunks.push(Buffer.from(buffer.subarray(0, count)));
  }
  return Buffer.concat(chunks);
}
const stateDir = process.env.FAKE_GH_STATE;
const stdin = readStdin();
appendFileSync(
  join(stateDir, "calls.jsonl"),
  JSON.stringify({ argv: process.argv.slice(2), stdin: stdin.toString("base64") }) + "\\n",
);
const counterPath = join(stateDir, "counter");
const index = existsSync(counterPath) ? Number(readFileSync(counterPath, "utf8")) : 0;
writeFileSync(counterPath, String(index + 1));
const response = JSON.parse(readFileSync(join(stateDir, "responses.json"), "utf8"))[index];
if (response === undefined) {
  process.stderr.write("unexpected gh call\\n");
  process.exit(99);
}
process.stdout.write(response.stdout ?? "");
process.stderr.write(response.stderr ?? "");
// Exiting naturally lets a large stdout drain into the pipe.
process.exitCode = response.exitCode ?? 0;
`;

function scratchDir(t, prefix) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function runScript(t, { cwd, args, responses }) {
  const binDir = scratchDir(t, "post-review-inline-bin-");
  const stateDir = scratchDir(t, "post-review-inline-state-");
  const fakeGhPath = join(binDir, "gh");
  writeFileSync(fakeGhPath, `#!${process.execPath}\n${FAKE_GH_SOURCE}`);
  chmodSync(fakeGhPath, 0o755);
  writeFileSync(join(stateDir, "responses.json"), JSON.stringify(responses));

  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd,
    encoding: "utf8",
    timeout: SCRIPT_TIMEOUT_MS,
    env: { ...GIT_ENV, PATH: `${binDir}${delimiter}${process.env.PATH}`, FAKE_GH_STATE: stateDir },
  });
  const callsPath = join(stateDir, "calls.jsonl");
  const calls = existsSync(callsPath)
    ? readFileSync(callsPath, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
        .map(({ argv, stdin }) => ({ argv, stdin: Buffer.from(stdin, "base64").toString("utf8") }))
    : [];
  const lines = result.stdout === "" ? [] : result.stdout.replace(/\n$/, "").split("\n");
  return { status: result.status, stderr: result.stderr, lines, calls };
}

function git(cwd, ...args) {
  const run = spawnSync("git", args, { cwd, env: GIT_ENV, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout.trim();
}

// A clean checkout whose HEAD is the one commit it holds.
function cleanCheckout(t) {
  const dir = scratchDir(t, "post-review-inline-checkout-");
  git(dir, "init", "-q");
  writeFileSync(join(dir, "app.txt"), "v1\n");
  git(dir, "add", "--", ".");
  git(dir, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-q", "-m", "1");
  return { dir, headSha: git(dir, "rev-parse", "HEAD") };
}

function writeReport(t, text) {
  const path = join(scratchDir(t, "post-review-inline-report-"), "report.md");
  writeFileSync(path, text);
  return path;
}

function jsonResponse(value) {
  return { stdout: JSON.stringify(value) };
}

function prRead(headRefOid) {
  return jsonResponse({
    data: {
      viewer: { login: "me" },
      repository: {
        pullRequest: {
          author: { login: "alice" },
          authorAssociation: "MEMBER",
          state: "OPEN",
          headRefOid,
          autoMergeRequest: null,
        },
      },
    },
  });
}

function review(commitId) {
  return jsonResponse({
    id: 9001,
    html_url: REVIEW_URL,
    state: "COMMENTED",
    commit_id: commitId,
    user: { login: "me" },
  });
}

const FILES_ARGV = [
  "api",
  "--hostname",
  "github.com",
  "--paginate",
  "repos/o/r/pulls/412/files",
  "--jq",
  ".[] | {filename, patch}",
];

const REVIEW_COMMENTS_ARGV = [
  "api",
  "--hostname",
  "github.com",
  "--paginate",
  "repos/o/r/pulls/412/reviews/9001/comments",
  "--jq",
  "length",
];

const HTTP_422 = { stderr: "gh: Validation Failed (HTTP 422)\n", exitCode: 1 };

const POST_ENDPOINT_ARGV = [
  "api",
  "--hostname",
  "github.com",
  "--method",
  "POST",
  "repos/o/r/pulls/412/reviews",
];

const INLINE_POST_ARGV = [...POST_ENDPOINT_ARGV, "--input", "-"];

function bodyOnlyPostArgv(headSha) {
  return [
    ...POST_ENDPOINT_ARGV,
    "-f",
    "event=COMMENT",
    "-f",
    `commit_id=${headSha}`,
    "-F",
    "body=@-",
  ];
}

// Responses for a run that reads the files, posts inline comments, and reads back `count` of them.
function anchoredResponses(headSha, count, files = FILES_STDOUT) {
  return [
    prRead(headSha),
    { stdout: files },
    review(headSha),
    review(headSha),
    { stdout: `${count}\n` },
  ];
}

function postPayload(run) {
  return JSON.parse(run.calls[2].stdin);
}

function runReport(t, report, responsesFor) {
  const checkout = cleanCheckout(t);
  const run = runScript(t, {
    cwd: checkout.dir,
    args: [PR_URL, checkout.headSha, writeReport(t, report), "at-head"],
    responses: responsesFor(checkout.headSha),
  });
  return { ...run, headSha: checkout.headSha };
}

function comment(line, body, range = {}) {
  return { path: "src/app.mjs", line, side: "RIGHT", body, ...range };
}

// ---------------------------------------------------------------------------------------
// Findings that anchor to the diff
// ---------------------------------------------------------------------------------------

const ADDED = "**suggestion (non-blocking):** Name the limit.\nfile: src/app.mjs:2";
const CONTEXT = "**nitpick (non-blocking):** Typo.\nfile: src/app.mjs:1";
const SECOND_HUNK = "**issue (blocking):** Drops the error.\nfile: src/app.mjs:42";
const RANGE_IN_HUNK = "**issue (blocking):** Drops the error.\nfile: src/app.mjs:2-4";
const RANGE_ACROSS_HUNKS = "**issue (blocking):** Drops the error.\nfile: src/app.mjs:3-41";
const SEVERAL = "**nitpick (non-blocking):** Typo.\nfile: src/app.mjs:2, src/other.mjs:9";
const DOT_SLASH = "**praise:** Clear name.\nfile: ./src/app.mjs:2";
const BACKTICKS = "**praise:** Clear name.\nfile: `src/app.mjs:2`";
const BOLD_KEY = "**praise:** Clear name.\n**file:** src/app.mjs:2";
const BACKTICK_SUGGESTION =
  "**suggestion (non-blocking):** Use a constant.\nfile: src/app.mjs:2\n\n```suggestion\nb = LIMIT\n```";
const TILDE_SUGGESTION =
  "**suggestion (non-blocking):** Use a constant.\nfile: src/app.mjs:2\n\n~~~suggestion\nb = LIMIT\n~~~";

const ANCHORED_ROWS = [
  { name: "an added line", findings: ADDED, comments: [comment(2, ADDED)] },
  { name: "a context line", findings: CONTEXT, comments: [comment(1, CONTEXT)] },
  {
    name: "a line in the second hunk",
    findings: SECOND_HUNK,
    comments: [comment(42, SECOND_HUNK)],
  },
  {
    name: "a range inside one hunk keeps its start",
    findings: RANGE_IN_HUNK,
    comments: [comment(4, RANGE_IN_HUNK, { start_line: 2, start_side: "RIGHT" })],
  },
  {
    name: "a range spanning two hunks anchors to its end line",
    findings: RANGE_ACROSS_HUNKS,
    comments: [comment(41, RANGE_ACROSS_HUNKS)],
  },
  { name: "several locations use the first", findings: SEVERAL, comments: [comment(2, SEVERAL)] },
  { name: "a leading ./ is dropped", findings: DOT_SLASH, comments: [comment(2, DOT_SLASH)] },
  { name: "backticks around the location", findings: BACKTICKS, comments: [comment(2, BACKTICKS)] },
  { name: "a **file:** key", findings: BOLD_KEY, comments: [comment(2, BOLD_KEY)] },
  ...["- ", "* ", "1. "].map((marker) => ({
    name: `a ${marker.trim()} list marker is dropped from the comment`,
    findings: `${marker}${ADDED}`,
    comments: [comment(2, ADDED)],
  })),
  {
    name: "a backtick suggestion fence becomes a text fence",
    findings: BACKTICK_SUGGESTION,
    comments: [comment(2, BACKTICK_SUGGESTION.replace("```suggestion", "```text"))],
  },
  {
    name: "a tilde suggestion fence becomes a text fence",
    findings: TILDE_SUGGESTION,
    comments: [comment(2, TILDE_SUGGESTION.replace("~~~suggestion", "~~~text"))],
  },
];

test("a located finding on a diff line posts as an inline comment beside the full body", async (t) => {
  for (const row of ANCHORED_ROWS) {
    await t.test(row.name, (st) => {
      const report = commentReport(row.findings);
      const run = runReport(st, report, (headSha) => anchoredResponses(headSha, 1));

      assert.deepEqual(run.lines, [`posted COMMENT ${REVIEW_URL}`, "inline 1 1"]);
      assert.deepEqual(run.calls[1]?.argv, FILES_ARGV);
      assert.deepEqual(run.calls[2]?.argv, INLINE_POST_ARGV);
      assert.deepEqual(postPayload(run), {
        event: "COMMENT",
        commit_id: run.headSha,
        body: report,
        comments: row.comments,
      });
      assert.deepEqual(run.calls[4]?.argv, REVIEW_COMMENTS_ARGV);
      assert.equal(run.status, 0);
    });
  }
});

test("an absolute path under the checkout's top level anchors as a repo-relative path", (t) => {
  const checkout = cleanCheckout(t);
  const finding = `**issue (blocking):** Leaks a handle.\nfile: ${checkout.dir}/src/app.mjs:2`;
  const run = runScript(t, {
    cwd: checkout.dir,
    args: [PR_URL, checkout.headSha, writeReport(t, commentReport(finding)), "at-head"],
    responses: anchoredResponses(checkout.headSha, 1),
  });

  assert.deepEqual(run.lines, [`posted COMMENT ${REVIEW_URL}`, "inline 1 1"]);
  assert.deepEqual(postPayload(run).comments, [comment(2, finding)]);
});

test("each label line starts a new finding with trailing blank lines trimmed", (t) => {
  const run = runReport(t, commentReport(`${ADDED}\n\n\n${CONTEXT}\n\n`), (headSha) =>
    anchoredResponses(headSha, 2),
  );

  assert.deepEqual(run.lines, [`posted COMMENT ${REVIEW_URL}`, "inline 2 2"]);
  assert.deepEqual(postPayload(run).comments, [comment(2, ADDED), comment(1, CONTEXT)]);
});

test("at most 50 inline comments post, the first 50 findings", (t) => {
  const findings = Array.from(
    { length: 51 },
    (_, index) => `**note:** n${index}\nfile: src/app.mjs:2`,
  );
  const run = runReport(t, commentReport(findings.join("\n\n")), (headSha) =>
    anchoredResponses(headSha, 50),
  );

  assert.deepEqual(run.lines, [`posted COMMENT ${REVIEW_URL}`, "inline 50 51"]);
  assert.equal(postPayload(run).comments.length, 50);
  assert.equal(postPayload(run).comments.at(-1).body, findings[49]);
});

test("a PR whose patches exceed 1 MiB still gets inline comments", (t) => {
  const bigPatch = `@@ -1,1 +1,1 @@\n ${"x".repeat(2 * 1024 * 1024)}`;
  const files = filesStdout([
    { filename: "big.txt", patch: bigPatch },
    { filename: "src/app.mjs", patch: APP_PATCH },
  ]);
  const run = runReport(t, commentReport(ADDED), (headSha) => anchoredResponses(headSha, 1, files));

  assert.deepEqual(run.lines, [`posted COMMENT ${REVIEW_URL}`, "inline 1 1"]);
});

// ---------------------------------------------------------------------------------------
// Located findings that do not anchor
// ---------------------------------------------------------------------------------------

const UNANCHORED_ROWS = [
  {
    name: "a line past the first hunk, since a deleted line takes no right-side number",
    findings: "**issue (blocking):** X.\nfile: src/app.mjs:6",
  },
  { name: "a file outside the diff", findings: "**issue (blocking):** X.\nfile: src/other.mjs:2" },
  { name: "a file with no patch", findings: "**issue (blocking):** X.\nfile: logo.png:1" },
  {
    name: "a range whose end is outside the diff",
    findings: "**issue (blocking):** X.\nfile: src/app.mjs:4-6",
  },
];

test("a located finding off the diff posts the body with the body-only argv", async (t) => {
  for (const row of UNANCHORED_ROWS) {
    await t.test(row.name, (st) => {
      const report = commentReport(row.findings);
      const run = runReport(st, report, (headSha) => [
        prRead(headSha),
        { stdout: FILES_STDOUT },
        review(headSha),
        review(headSha),
      ]);

      assert.deepEqual(run.lines, [`posted COMMENT ${REVIEW_URL}`, "inline 0 1"]);
      assert.deepEqual(run.calls[2]?.argv, bodyOnlyPostArgv(run.headSha));
      assert.equal(run.calls[2].stdin, report);
      assert.equal(run.calls.length, 4);
      assert.equal(run.status, 0);
    });
  }
});

// ---------------------------------------------------------------------------------------
// Findings with no usable location
// ---------------------------------------------------------------------------------------

const UNLOCATED_ROWS = [
  {
    name: "a path with a .. segment",
    report: commentReport("**issue (blocking):** X.\nfile: src/../../etc/app.mjs:2"),
  },
  {
    name: "an absolute path outside the top level",
    report: commentReport("**issue (blocking):** X.\nfile: /elsewhere/src/app.mjs:2"),
  },
  { name: "a finding with no file line", report: commentReport("**thought:** Consider a cache.") },
  {
    name: "a range whose start is after its end",
    report: commentReport("**issue (blocking):** X.\nfile: src/app.mjs:4-2"),
  },
  {
    name: "a finding with no bold label",
    report: commentReport("- issue (blocking): X.\nfile: src/app.mjs:2"),
  },
  {
    name: "a finding outside the Findings section",
    report: `**Verdict: 💬 COMMENT**\n\n### Summary\n\n${ADDED}\n\n### Checks\n\n- ok\n`,
  },
  {
    name: "a finding after the next ### heading",
    report: `**Verdict: 💬 COMMENT**\n\n### Findings\n\nNo findings.\n\n### Checks\n\n${ADDED}\n`,
  },
];

test("a report with no located finding never reads the PR files", async (t) => {
  for (const row of UNLOCATED_ROWS) {
    await t.test(row.name, (st) => {
      const run = runReport(st, row.report, (headSha) => [
        prRead(headSha),
        review(headSha),
        review(headSha),
      ]);

      assert.deepEqual(run.lines, [`posted COMMENT ${REVIEW_URL}`]);
      assert.deepEqual(run.calls[1]?.argv, bodyOnlyPostArgv(run.headSha));
      assert.equal(run.calls.length, 3);
    });
  }
});

// ---------------------------------------------------------------------------------------
// Skips and failures
// ---------------------------------------------------------------------------------------

test("a moved head posts the body only and never reads the PR files", (t) => {
  const run = runReport(t, commentReport(ADDED), (headSha) => [
    prRead(MOVED_SHA),
    review(headSha),
    review(headSha),
  ]);

  assert.deepEqual(run.lines, [
    `posted COMMENT ${REVIEW_URL}`,
    `head-moved ${MOVED_SHA}`,
    "inline-skipped head-moved",
  ]);
  assert.deepEqual(run.calls[1]?.argv, bodyOnlyPostArgv(run.headSha));
  assert.equal(run.calls.length, 3);
  assert.equal(run.status, 0);
});

test("a failed PR files read posts the body only", (t) => {
  const run = runReport(t, commentReport(ADDED), (headSha) => [
    prRead(headSha),
    { stderr: "gh: Not Found (HTTP 404)\n", exitCode: 1 },
    review(headSha),
    review(headSha),
  ]);

  assert.deepEqual(run.lines, [`posted COMMENT ${REVIEW_URL}`, "inline-skipped files-read-failed"]);
  assert.deepEqual(run.calls[2]?.argv, bodyOnlyPostArgv(run.headSha));
  assert.equal(run.status, 0);
});

test("an HTTP 422 on the inline POST posts once more with the body-only argv", (t) => {
  const report = commentReport(ADDED);
  const run = runReport(t, report, (headSha) => [
    prRead(headSha),
    { stdout: FILES_STDOUT },
    HTTP_422,
    review(headSha),
    review(headSha),
  ]);

  assert.deepEqual(run.lines, [`posted COMMENT ${REVIEW_URL}`, "inline-skipped post-rejected"]);
  assert.deepEqual(run.calls[2]?.argv, INLINE_POST_ARGV);
  assert.deepEqual(run.calls[3]?.argv, bodyOnlyPostArgv(run.headSha));
  assert.equal(run.calls[3].stdin, report);
  assert.equal(run.calls.length, 5);
  assert.equal(run.status, 0);
});

test("any other failure of the inline POST is not retried", (t) => {
  const run = runReport(t, commentReport(ADDED), (headSha) => [
    prRead(headSha),
    { stdout: FILES_STDOUT },
    { stderr: "gh: Server Error (HTTP 500)\n", exitCode: 1 },
  ]);

  assert.deepEqual(run.lines, ["failed http-500"]);
  assert.equal(run.calls.length, 3);
  assert.equal(run.status, 1);
});

test("a review whose inline comment count differs from the sent count is unverified", (t) => {
  const run = runReport(t, commentReport(ADDED), (headSha) => anchoredResponses(headSha, 0));

  assert.deepEqual(run.lines, ["unverified inline-comments-mismatch"]);
  assert.equal(run.status, 1);
});
