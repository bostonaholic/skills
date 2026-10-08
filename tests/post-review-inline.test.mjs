// Fails when post-review.mjs misreads a finding's `file:` location, anchors an inline comment to a
// line outside the diff, sends more than 50 inline comments, changes the body-only POST argv,
// posts inline comments after the head moved, fails the post when the files read fails, or
// prints `posted` when the review holds a different number of inline comments than were sent.
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
const { parseFindings, planInlineComments, rightSideLines } = await import(scriptUrl.href);

// The user's global git config (signing, identity) must never reach a fixture repository.
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
const SCRIPT_TIMEOUT_MS = 30_000;

const PR_URL = "https://github.com/o/r/pull/412";
const REVIEW_URL = `${PR_URL}#pullrequestreview-9001`;
const MOVED_SHA = "2222222222222222222222222222222222222222";

const IN_DIFF_FINDING = `**suggestion (non-blocking):** Name the retry limit.
file: src/app.mjs:3`;

const OUT_OF_DIFF_FINDING = `**suggestion (non-blocking):** Name the retry limit.
file: src/app.mjs:40`;

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

const APP_PATCH = "@@ -1,2 +1,3 @@\n a\n+b\n c";
const FILES_STDOUT = `${JSON.stringify({ filename: "src/app.mjs", patch: APP_PATCH })}\n`;

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
process.exit(response.exitCode ?? 0);
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

const POST_ENDPOINT_ARGV = [
  "api",
  "--hostname",
  "github.com",
  "--method",
  "POST",
  "repos/o/r/pulls/412/reviews",
];

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

// ---------------------------------------------------------------------------------------
// parseFindings
// ---------------------------------------------------------------------------------------

const TOPLEVEL = "/work/repo";

const PARSE_ROWS = [
  {
    name: "a finding with one location",
    findings: IN_DIFF_FINDING,
    expected: [{ body: IN_DIFF_FINDING, path: "src/app.mjs", line: 3 }],
  },
  {
    name: "a line range keeps its start and anchors to its end",
    findings: "**issue (blocking):** Drops the error.\nfile: src/app.mjs:10-14",
    expected: [
      {
        body: "**issue (blocking):** Drops the error.\nfile: src/app.mjs:10-14",
        path: "src/app.mjs",
        line: 14,
        startLine: 10,
      },
    ],
  },
  {
    name: "several locations use the first",
    findings: "**nitpick (non-blocking):** Typo.\nfile: src/a.mjs:7, src/b.mjs:9",
    expected: [
      {
        body: "**nitpick (non-blocking):** Typo.\nfile: src/a.mjs:7, src/b.mjs:9",
        path: "src/a.mjs",
        line: 7,
      },
    ],
  },
  {
    name: "a leading ./ is dropped",
    findings: "**praise:** Clear name.\nfile: ./src/a.mjs:2",
    expected: [
      { body: "**praise:** Clear name.\nfile: ./src/a.mjs:2", path: "src/a.mjs", line: 2 },
    ],
  },
  {
    name: "an absolute path under the top level becomes repo-relative",
    findings: `**issue (blocking):** Leaks a handle.\nfile: ${TOPLEVEL}/src/a.mjs:5`,
    expected: [
      {
        body: `**issue (blocking):** Leaks a handle.\nfile: ${TOPLEVEL}/src/a.mjs:5`,
        path: "src/a.mjs",
        line: 5,
      },
    ],
  },
  {
    name: "an absolute path outside the top level is dropped",
    findings: "**issue (blocking):** Leaks a handle.\nfile: /elsewhere/src/a.mjs:5",
    expected: [],
  },
  {
    name: "a path with a .. segment is dropped",
    findings: "**issue (blocking):** Leaks a handle.\nfile: src/../../etc/a.mjs:5",
    expected: [],
  },
  {
    name: "a finding with no file line is dropped",
    findings: "**thought:** Consider a cache.",
    expected: [],
  },
  {
    name: "trailing blank lines are trimmed and each label line starts a new finding",
    findings: `${IN_DIFF_FINDING}\n\n\n**question:** Why retry?\nfile: src/b.mjs:1\n\n`,
    expected: [
      { body: IN_DIFF_FINDING, path: "src/app.mjs", line: 3 },
      { body: "**question:** Why retry?\nfile: src/b.mjs:1", path: "src/b.mjs", line: 1 },
    ],
  },
];

test("parseFindings returns each located finding with its full text", async (t) => {
  for (const row of PARSE_ROWS) {
    await t.test(row.name, () => {
      assert.deepEqual(parseFindings(commentReport(row.findings), TOPLEVEL), row.expected);
    });
  }
});

test("parseFindings reads only the Findings section", () => {
  const report = `**Verdict: 💬 COMMENT**\n\n### Summary\n\n${IN_DIFF_FINDING}\n\n### Checks\n\n- ok\n`;

  assert.deepEqual(parseFindings(report, TOPLEVEL), []);
});

test("parseFindings stops at the next ### heading", () => {
  const report = `### Findings\n\nNo findings.\n\n### Checks\n\n${IN_DIFF_FINDING}\n`;

  assert.deepEqual(parseFindings(report, TOPLEVEL), []);
});

// ---------------------------------------------------------------------------------------
// rightSideLines
// ---------------------------------------------------------------------------------------

test("rightSideLines keeps added and context lines and skips deleted ones", () => {
  const patch = "@@ -1,4 +1,4 @@\n a\n-b\n+B\n c\n@@ -20,2 +20,1 @@\n-x\n y";

  const lines = rightSideLines([{ filename: "src/a.mjs", patch }]);

  assert.deepEqual([...lines.get("src/a.mjs")], [1, 2, 3, 20]);
});

test("rightSideLines leaves out a file with no patch", () => {
  const lines = rightSideLines([{ filename: "logo.png" }, { filename: "big.json", patch: null }]);

  assert.equal(lines.size, 0);
});

// ---------------------------------------------------------------------------------------
// planInlineComments
// ---------------------------------------------------------------------------------------

// Right-side lines 1-5 and 20-22, as two hunks.
const DIFF_LINES = new Map([["src/a.mjs", new Set([1, 2, 3, 4, 5, 20, 21, 22])]]);

const PLAN_ROWS = [
  {
    name: "a line in the diff becomes a comment",
    finding: { body: "B", path: "src/a.mjs", line: 4 },
    expected: [{ path: "src/a.mjs", line: 4, side: "RIGHT", body: "B" }],
  },
  {
    name: "a line outside the diff is dropped",
    finding: { body: "B", path: "src/a.mjs", line: 10 },
    expected: [],
  },
  {
    name: "a file outside the diff is dropped",
    finding: { body: "B", path: "src/other.mjs", line: 4 },
    expected: [],
  },
  {
    name: "a range inside one hunk keeps its start",
    finding: { body: "B", path: "src/a.mjs", line: 5, startLine: 2 },
    expected: [
      {
        path: "src/a.mjs",
        line: 5,
        side: "RIGHT",
        body: "B",
        start_line: 2,
        start_side: "RIGHT",
      },
    ],
  },
  {
    name: "a range spanning two hunks anchors to its end line",
    finding: { body: "B", path: "src/a.mjs", line: 21, startLine: 3 },
    expected: [{ path: "src/a.mjs", line: 21, side: "RIGHT", body: "B" }],
  },
  {
    name: "a range whose end is outside the diff is dropped",
    finding: { body: "B", path: "src/a.mjs", line: 8, startLine: 4 },
    expected: [],
  },
];

test("planInlineComments anchors only findings on right-side diff lines", async (t) => {
  for (const row of PLAN_ROWS) {
    await t.test(row.name, () => {
      assert.deepEqual(planInlineComments([row.finding], DIFF_LINES), row.expected);
    });
  }
});

test("planInlineComments sends at most 50 comments, the first 50 findings", () => {
  const findings = Array.from({ length: 51 }, (_, index) => ({
    body: `finding ${index}`,
    path: "src/a.mjs",
    line: 1,
  }));

  const comments = planInlineComments(findings, DIFF_LINES);

  assert.equal(comments.length, 50);
  assert.equal(comments.at(-1).body, "finding 49");
});

// ---------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------

test("a located finding in the diff posts as an inline comment with the full body", (t) => {
  const checkout = cleanCheckout(t);
  const report = commentReport(IN_DIFF_FINDING);
  const run = runScript(t, {
    cwd: checkout.dir,
    args: [PR_URL, checkout.headSha, writeReport(t, report), "at-head"],
    responses: [
      prRead(checkout.headSha),
      { stdout: FILES_STDOUT },
      review(checkout.headSha),
      review(checkout.headSha),
      { stdout: "1\n" },
    ],
  });

  assert.deepEqual(run.lines, [`posted COMMENT ${REVIEW_URL}`, "inline 1 1"]);
  assert.deepEqual(run.calls[1]?.argv, FILES_ARGV);
  assert.deepEqual(run.calls[2]?.argv, [...POST_ENDPOINT_ARGV, "--input", "-"]);
  assert.deepEqual(JSON.parse(run.calls[2].stdin), {
    event: "COMMENT",
    commit_id: checkout.headSha,
    body: report,
    comments: [{ path: "src/app.mjs", line: 3, side: "RIGHT", body: IN_DIFF_FINDING }],
  });
  assert.deepEqual(run.calls[4]?.argv, REVIEW_COMMENTS_ARGV);
  assert.equal(run.status, 0);
});

test("a located finding outside the diff posts the body with the body-only argv", (t) => {
  const checkout = cleanCheckout(t);
  const report = commentReport(OUT_OF_DIFF_FINDING);
  const run = runScript(t, {
    cwd: checkout.dir,
    args: [PR_URL, checkout.headSha, writeReport(t, report), "at-head"],
    responses: [
      prRead(checkout.headSha),
      { stdout: FILES_STDOUT },
      review(checkout.headSha),
      review(checkout.headSha),
    ],
  });

  assert.deepEqual(run.lines, [`posted COMMENT ${REVIEW_URL}`, "inline 0 1"]);
  assert.deepEqual(run.calls[2]?.argv, bodyOnlyPostArgv(checkout.headSha));
  assert.equal(run.calls[2].stdin, report);
  assert.equal(run.calls.length, 4);
  assert.equal(run.status, 0);
});

test("a moved head posts the body only and never reads the PR files", (t) => {
  const checkout = cleanCheckout(t);
  const run = runScript(t, {
    cwd: checkout.dir,
    args: [PR_URL, checkout.headSha, writeReport(t, commentReport(IN_DIFF_FINDING)), "at-head"],
    responses: [prRead(MOVED_SHA), review(checkout.headSha), review(checkout.headSha)],
  });

  assert.deepEqual(run.lines, [
    `posted COMMENT ${REVIEW_URL}`,
    `head-moved ${MOVED_SHA}`,
    "inline-skipped head-moved",
  ]);
  assert.deepEqual(run.calls[1]?.argv, bodyOnlyPostArgv(checkout.headSha));
  assert.equal(run.calls.length, 3);
  assert.equal(run.status, 0);
});

test("a failed PR files read posts the body only", (t) => {
  const checkout = cleanCheckout(t);
  const run = runScript(t, {
    cwd: checkout.dir,
    args: [PR_URL, checkout.headSha, writeReport(t, commentReport(IN_DIFF_FINDING)), "at-head"],
    responses: [
      prRead(checkout.headSha),
      { stderr: "gh: Not Found (HTTP 404)\n", exitCode: 1 },
      review(checkout.headSha),
      review(checkout.headSha),
    ],
  });

  assert.deepEqual(run.lines, [`posted COMMENT ${REVIEW_URL}`, "inline-skipped files-read-failed"]);
  assert.deepEqual(run.calls[2]?.argv, bodyOnlyPostArgv(checkout.headSha));
  assert.equal(run.status, 0);
});

test("a review whose inline comment count differs from the sent count is unverified", (t) => {
  const checkout = cleanCheckout(t);
  const run = runScript(t, {
    cwd: checkout.dir,
    args: [PR_URL, checkout.headSha, writeReport(t, commentReport(IN_DIFF_FINDING)), "at-head"],
    responses: [
      prRead(checkout.headSha),
      { stdout: FILES_STDOUT },
      review(checkout.headSha),
      review(checkout.headSha),
      { stdout: "0\n" },
    ],
  });

  assert.deepEqual(run.lines, ["unverified inline-comments-mismatch"]);
  assert.equal(run.status, 1);
});
