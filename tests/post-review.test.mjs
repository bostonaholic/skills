// Fails when post-review.mjs posts the wrong event, lets an APPROVE reach a self-authored,
// auto-merging, moved, or off-head PR, puts a report byte in argv or stdout, prints `posted`
// without a matching read-back, or calls gh after a usage fault.
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
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptUrl = new URL(
  "../skills/engineering/reviewing-code/scripts/post-review.mjs",
  import.meta.url,
);
const scriptPath = fileURLToPath(scriptUrl);

// A missing or broken script must fail each test through an assertion, not abort the file.
const scriptModule = await import(scriptUrl.href).catch((error) => ({ loadError: error }));

// The user's global git config (signing, identity) must never reach a fixture repository.
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
const SCRIPT_TIMEOUT_MS = 30_000;

const PR_URL = "https://github.com/o/r/pull/412";
const REVIEW_URL = `${PR_URL}#pullrequestreview-9001`;
const BODY_SENTINEL = "BODY-SENTINEL-q9z4";
const REVIEWED_SHA = "1111111111111111111111111111111111111111";
const MOVED_SHA = "2222222222222222222222222222222222222222";
const AUTO_MERGE_ENABLED_AT = "2026-10-08T12:00:00Z";
const ANY_STDERR = /(?:)/;

const APPROVE_REPORT = `**Verdict: ✅ APPROVE**

### Summary

Reviewed the PR diff. All done criteria are met. ${BODY_SENTINEL}

### Findings

No findings.

### Checks

- Test suite: npm test, 41 passed.
`;

const REQUEST_CHANGES_REPORT = `**Verdict: ❌ REQUEST CHANGES**

### Summary

Reviewed the PR diff. One blocking finding. ${BODY_SENTINEL}

### Findings

- issue (blocking): src/app.mjs:12 drops the error.

### Checks

- Test suite: npm test, 41 passed.
`;

const COMMENT_REPORT = `**Verdict: 💬 COMMENT**

### Summary

Reviewed the PR diff. Non-blocking findings only. ${BODY_SENTINEL}

### Findings

- suggestion (non-blocking): src/app.mjs:20 could name the constant.

### Checks

- Test suite: npm test, 41 passed.
`;

const NO_FINDINGS_COMMENT_REPORT = `**Verdict: 💬 COMMENT**

### Summary

Reviewed the PR diff without a test run. ${BODY_SENTINEL}

### Findings

No findings.

### Checks

- Test suite: not run (the checkout is not at the PR head).
`;

function decide(facts) {
  assert.equal(
    typeof scriptModule.decideReview,
    "function",
    `post-review.mjs must export decideReview (load error: ${scriptModule.loadError?.message ?? "none"})`,
  );
  return scriptModule.decideReview(facts);
}

// Facts for an open PR by someone else, auto-merge off, head unmoved, checkout at the head.
function prFacts(fields) {
  return {
    verdict: "APPROVE",
    viewerLogin: "me",
    authorLogin: "alice",
    state: "OPEN",
    autoMerge: false,
    currentHeadSha: REVIEWED_SHA,
    reviewedHeadSha: REVIEWED_SHA,
    inputFlag: "at-head",
    postTimeCheckPassed: true,
    ...fields,
  };
}

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
const responses = JSON.parse(readFileSync(join(stateDir, "responses.json"), "utf8"));
const response = responses[index];
if (response === undefined) {
  process.stderr.write("unexpected gh call\\n");
  process.exit(99);
}
process.stdout.write(response.stdout);
process.stderr.write(response.stderr);
process.exit(response.exitCode);
`;

function runScript(t, { args, responses, cwd, env = {} }) {
  const binDir = mkdtempSync(join(tmpdir(), "pr-fake-gh-bin-"));
  const stateDir = mkdtempSync(join(tmpdir(), "pr-fake-gh-state-"));
  t.after(() => {
    rmSync(binDir, { recursive: true, force: true });
    rmSync(stateDir, { recursive: true, force: true });
  });
  const fakeGhPath = join(binDir, "gh");
  writeFileSync(fakeGhPath, `#!${process.execPath}\n${FAKE_GH_SOURCE}`);
  chmodSync(fakeGhPath, 0o755);
  writeFileSync(join(stateDir, "responses.json"), JSON.stringify(responses));

  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd,
    encoding: "utf8",
    timeout: SCRIPT_TIMEOUT_MS,
    env: {
      ...GIT_ENV,
      PATH: `${binDir}${delimiter}${process.env.PATH}`,
      FAKE_GH_STATE: stateDir,
      ...env,
    },
  });
  assert.notEqual(
    result.error?.code,
    "ETIMEDOUT",
    "post-review.mjs did not exit; a gh call likely waited on a stdin that was never ended",
  );

  const callsPath = join(stateDir, "calls.jsonl");
  const calls = existsSync(callsPath)
    ? readFileSync(callsPath, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
        .map(({ argv, stdin }) => ({ argv, stdin: Buffer.from(stdin, "base64") }))
    : [];
  const lines = result.stdout === "" ? [] : result.stdout.replace(/\n$/, "").split("\n");
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, lines, calls };
}

function scratchDir(t, prefix) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeReport(t, text) {
  const path = join(scratchDir(t, "post-review-report-"), "report.md");
  writeFileSync(path, text);
  return path;
}

function git(cwd, ...args) {
  const run = spawnSync("git", args, { cwd, env: GIT_ENV, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout.trim();
}

function commitAll(cwd, message) {
  git(cwd, "add", "--", ".");
  git(
    cwd,
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.com",
    "commit",
    "-q",
    "-m",
    message,
  );
  return git(cwd, "rev-parse", "HEAD");
}

// A clean checkout whose HEAD is the one commit it holds.
function cleanCheckout(t) {
  const dir = scratchDir(t, "post-review-checkout-");
  git(dir, "init", "-q");
  writeFileSync(join(dir, "app.txt"), "v1\n");
  return { dir, headSha: commitAll(dir, "first") };
}

function prRead({
  viewer = { login: "me" },
  authorLogin = "alice",
  state = "OPEN",
  autoMerge = false,
  headRefOid,
}) {
  const data = {
    viewer,
    repository: {
      pullRequest: {
        author: authorLogin === null ? null : { login: authorLogin },
        state,
        headRefOid,
        autoMergeRequest: autoMerge ? { enabledAt: AUTO_MERGE_ENABLED_AT } : null,
      },
    },
  };
  return { stdout: JSON.stringify({ data }), stderr: "", exitCode: 0 };
}

function reviewCreated({ state, commitId, body }) {
  return {
    stdout: JSON.stringify({
      id: 9001,
      html_url: REVIEW_URL,
      state,
      commit_id: commitId,
      user: { login: "me" },
      body,
    }),
    stderr: "",
    exitCode: 0,
  };
}

function reviewReadBack({ state, commitId, login = "me", body }) {
  return {
    stdout: JSON.stringify({
      id: 9001,
      html_url: REVIEW_URL,
      state,
      commit_id: commitId,
      user: { login },
      body,
    }),
    stderr: "",
    exitCode: 0,
  };
}

function postReviewArgv(event, headSha) {
  return [
    "api",
    "--hostname",
    "github.com",
    "--method",
    "POST",
    "repos/o/r/pulls/412/reviews",
    "-f",
    `event=${event}`,
    "-f",
    `commit_id=${headSha}`,
    "-F",
    "body=@-",
  ];
}

const GET_REVIEW_ARGV = ["api", "--hostname", "github.com", "repos/o/r/pulls/412/reviews/9001"];

function hostnameOf(argv) {
  return argv[argv.indexOf("--hostname") + 1];
}

// ---------------------------------------------------------------------------------------
// Slice 1: post a PR review at the PR head
// ---------------------------------------------------------------------------------------

const POSTED_ROWS = [
  { name: "APPROVE", report: APPROVE_REPORT, event: "APPROVE", state: "APPROVED" },
  {
    name: "REQUEST CHANGES",
    report: REQUEST_CHANGES_REPORT,
    event: "REQUEST_CHANGES",
    state: "CHANGES_REQUESTED",
  },
  { name: "COMMENT", report: COMMENT_REPORT, event: "COMMENT", state: "COMMENTED" },
  {
    name: "a No findings. COMMENT report",
    report: NO_FINDINGS_COMMENT_REPORT,
    event: "COMMENT",
    state: "COMMENTED",
  },
];

test("posts the report as one review pinned to the reviewed commit", async (t) => {
  for (const row of POSTED_ROWS) {
    await t.test(row.name, (st) => {
      const checkout = cleanCheckout(st);
      const reportPath = writeReport(st, row.report);
      const run = runScript(st, {
        cwd: checkout.dir,
        args: [PR_URL, checkout.headSha, reportPath, "at-head"],
        responses: [
          prRead({ headRefOid: checkout.headSha }),
          reviewCreated({ state: row.state, commitId: checkout.headSha, body: row.report }),
          reviewReadBack({ state: row.state, commitId: checkout.headSha, body: row.report }),
        ],
      });

      assert.deepEqual(run.lines, [`posted ${row.event} ${REVIEW_URL}`]);
      assert.equal(run.calls.length, 3, "expected one read, one POST, and one read-back");
      assert.deepEqual(run.calls[1].argv, postReviewArgv(row.event, checkout.headSha));
      assert.deepEqual(run.calls[1].stdin, Buffer.from(row.report));
      assert.deepEqual(run.calls[2].argv, GET_REVIEW_ARGV);
      assert.deepEqual(
        run.calls.map((call) => hostnameOf(call.argv)),
        ["github.com", "github.com", "github.com"],
      );
      assert.doesNotMatch(JSON.stringify(run.calls.map((call) => call.argv)), /BODY-SENTINEL-q9z4/);
      assert.doesNotMatch(run.stdout, /BODY-SENTINEL-q9z4/);
      assert.equal(run.status, 0);
    });
  }
});

const DECISION_ROWS = [
  {
    name: "APPROVE maps to APPROVE",
    facts: prFacts({ verdict: "APPROVE" }),
    expected: { event: "APPROVE", notes: [] },
  },
  {
    name: "REQUEST CHANGES maps to REQUEST_CHANGES",
    facts: prFacts({ verdict: "REQUEST CHANGES" }),
    expected: { event: "REQUEST_CHANGES", notes: [] },
  },
  {
    name: "COMMENT maps to COMMENT",
    facts: prFacts({ verdict: "COMMENT" }),
    expected: { event: "COMMENT", notes: [] },
  },
  {
    name: "a self-authored APPROVE posts COMMENT",
    facts: prFacts({ verdict: "APPROVE", authorLogin: "me" }),
    expected: { event: "COMMENT", notes: ["downgraded APPROVE self-authored"] },
  },
  {
    name: "a self-authored REQUEST CHANGES posts COMMENT",
    facts: prFacts({ verdict: "REQUEST CHANGES", authorLogin: "me" }),
    expected: { event: "COMMENT", notes: ["downgraded REQUEST_CHANGES self-authored"] },
  },
  {
    name: "auto-merge caps APPROVE at COMMENT",
    facts: prFacts({ verdict: "APPROVE", autoMerge: true }),
    expected: { event: "COMMENT", notes: ["downgraded APPROVE auto-merge"] },
  },
  {
    name: "auto-merge leaves REQUEST CHANGES as REQUEST_CHANGES",
    facts: prFacts({ verdict: "REQUEST CHANGES", autoMerge: true }),
    expected: { event: "REQUEST_CHANGES", notes: [] },
  },
  {
    name: "a moved head caps APPROVE at COMMENT and names the new head",
    facts: prFacts({ verdict: "APPROVE", currentHeadSha: MOVED_SHA }),
    expected: {
      event: "COMMENT",
      notes: ["downgraded APPROVE head-moved", `head-moved ${MOVED_SHA}`],
    },
  },
  {
    name: "a moved head leaves REQUEST CHANGES and still names the new head",
    facts: prFacts({ verdict: "REQUEST CHANGES", currentHeadSha: MOVED_SHA }),
    expected: { event: "REQUEST_CHANGES", notes: [`head-moved ${MOVED_SHA}`] },
  },
  {
    name: "a null author never equals the viewer",
    facts: prFacts({ verdict: "APPROVE", authorLogin: null }),
    expected: { event: "APPROVE", notes: [] },
  },
  {
    name: "three reasons note in the fixed order with head-moved <sha> last",
    facts: prFacts({
      verdict: "APPROVE",
      authorLogin: "me",
      autoMerge: true,
      currentHeadSha: MOVED_SHA,
    }),
    expected: {
      event: "COMMENT",
      notes: [
        "downgraded APPROVE self-authored",
        "downgraded APPROVE auto-merge",
        "downgraded APPROVE head-moved",
        `head-moved ${MOVED_SHA}`,
      ],
    },
  },
];

// Slice 2 rows of the decision test.
const OFF_HEAD_DECISION_ROWS = [
  {
    name: "the off-head flag caps APPROVE at COMMENT",
    facts: prFacts({ verdict: "APPROVE", inputFlag: "off-head" }),
    expected: { event: "COMMENT", notes: ["downgraded APPROVE off-head"] },
  },
  {
    name: "the off-head flag leaves REQUEST CHANGES as REQUEST_CHANGES",
    facts: prFacts({ verdict: "REQUEST CHANGES", inputFlag: "off-head" }),
    expected: { event: "REQUEST_CHANGES", notes: [] },
  },
  {
    name: "four reasons note in the fixed order with off-head after head-moved",
    facts: prFacts({
      verdict: "APPROVE",
      authorLogin: "me",
      autoMerge: true,
      currentHeadSha: MOVED_SHA,
      inputFlag: "off-head",
    }),
    expected: {
      event: "COMMENT",
      notes: [
        "downgraded APPROVE self-authored",
        "downgraded APPROVE auto-merge",
        "downgraded APPROVE head-moved",
        "downgraded APPROVE off-head",
        `head-moved ${MOVED_SHA}`,
      ],
    },
  },
];

test("decides the posted event and notes from the verdict and PR facts", async (t) => {
  for (const row of [...DECISION_ROWS, ...OFF_HEAD_DECISION_ROWS]) {
    await t.test(row.name, () => {
      const result = decide(row.facts);
      assert.deepEqual({ event: result.event, notes: result.notes }, row.expected);
    });
  }
});

const USAGE_FAULT_ROWS = [
  {
    name: "three arguments, with no at-head flag, exit 2 with no gh call",
    args: ({ reportPath }) => [PR_URL, REVIEWED_SHA, reportPath],
  },
  {
    name: "a PR URL with a trailing shell character exits 2 with no gh call",
    args: ({ reportPath }) => [`${PR_URL};echo`, REVIEWED_SHA, reportPath, "at-head"],
  },
  {
    name: "a short head SHA exits 2 with no gh call",
    args: ({ reportPath }) => [PR_URL, "1111111", reportPath, "at-head"],
  },
  {
    name: "a report file that does not exist exits 2 with no gh call",
    args: ({ missingPath }) => [PR_URL, REVIEWED_SHA, missingPath, "at-head"],
  },
  {
    name: "a report whose first line is not a verdict line exits 2 with no gh call",
    args: ({ headingFirstPath }) => [PR_URL, REVIEWED_SHA, headingFirstPath, "at-head"],
  },
  // Slice 2 row.
  {
    name: "an at-head value other than at-head or off-head exits 2 with no gh call",
    args: ({ reportPath }) => [PR_URL, REVIEWED_SHA, reportPath, "yes"],
  },
];

const RUNTIME_FAILURE_ROWS = [
  {
    name: "a failed GraphQL read prints not-posted read-failed and sends no POST",
    read: () => ({ stdout: "", stderr: "gh: Bad credentials (HTTP 401)\n", exitCode: 1 }),
    post: [],
    lines: ["not-posted read-failed"],
    stderr: /^gh: Bad credentials \(HTTP 401\)$/m,
    calls: 1,
  },
  {
    name: "a read with no viewer login prints not-posted read-failed and sends no POST",
    read: (headSha) => prRead({ viewer: null, headRefOid: headSha }),
    post: [],
    lines: ["not-posted read-failed"],
    stderr: /^post-review\.mjs: /m,
    calls: 1,
  },
  {
    name: "a PR merged at post time prints not-posted pr-merged and sends no POST",
    read: (headSha) => prRead({ state: "MERGED", headRefOid: headSha }),
    post: [],
    lines: ["not-posted pr-merged"],
    stderr: ANY_STDERR,
    calls: 1,
  },
  {
    name: "a PR closed at post time prints not-posted pr-closed and sends no POST",
    read: (headSha) => prRead({ state: "CLOSED", headRefOid: headSha }),
    post: [],
    lines: ["not-posted pr-closed"],
    stderr: ANY_STDERR,
    calls: 1,
  },
  {
    name: "a POST answered 422 prints failed http-422, passes gh's stderr, and does not retry",
    read: (headSha) => prRead({ headRefOid: headSha }),
    post: [{ stdout: "", stderr: "gh: Validation Failed (HTTP 422)\n", exitCode: 1 }],
    lines: ["failed http-422"],
    stderr: /^gh: Validation Failed \(HTTP 422\)$/m,
    calls: 2,
  },
  {
    name: "a POST answered 403 prints failed http-403, passes gh's stderr, and does not retry",
    read: (headSha) => prRead({ headRefOid: headSha }),
    post: [
      {
        stdout: "",
        stderr: "gh: Resource not accessible by personal access token (HTTP 403)\n",
        exitCode: 1,
      },
    ],
    lines: ["failed http-403"],
    stderr: /^gh: Resource not accessible by personal access token \(HTTP 403\)$/m,
    calls: 2,
  },
  {
    name: "a POST that exits with no HTTP status prints failed gh-exit-<code>",
    read: (headSha) => prRead({ headRefOid: headSha }),
    post: [{ stdout: "", stderr: "error connecting to api.github.com\n", exitCode: 4 }],
    lines: ["failed gh-exit-4"],
    stderr: /^error connecting to api\.github\.com$/m,
    calls: 2,
  },
  {
    name: "a self-authored POST that fails prints failed http-403, then the downgrade note",
    read: (headSha) => prRead({ authorLogin: "me", headRefOid: headSha }),
    post: [
      {
        stdout: "",
        stderr: "gh: Resource not accessible by personal access token (HTTP 403)\n",
        exitCode: 1,
      },
    ],
    lines: ["failed http-403", "downgraded APPROVE self-authored"],
    stderr: /^gh: Resource not accessible by personal access token \(HTTP 403\)$/m,
    calls: 2,
  },
];

const UNVERIFIED_ROWS = [
  {
    name: "a read-back state that differs from the posted event prints unverified",
    readBack: (headSha) => reviewReadBack({ state: "COMMENTED", commitId: headSha }),
  },
  {
    name: "a read-back commit_id that differs from the reviewed SHA prints unverified",
    readBack: () => reviewReadBack({ state: "APPROVED", commitId: MOVED_SHA }),
  },
  {
    name: "a read-back user.login that differs from the viewer prints unverified",
    readBack: (headSha) =>
      reviewReadBack({ state: "APPROVED", commitId: headSha, login: "someone-else" }),
  },
];

test("reports a refused, failed, or unverified post without a posted line", async (t) => {
  for (const row of USAGE_FAULT_ROWS) {
    await t.test(row.name, (st) => {
      const dir = scratchDir(st, "post-review-usage-");
      const reportPath = join(dir, "report.md");
      const headingFirstPath = join(dir, "heading-first.md");
      writeFileSync(reportPath, APPROVE_REPORT);
      writeFileSync(headingFirstPath, `### Summary\n\n${APPROVE_REPORT}`);
      const run = runScript(st, {
        cwd: dir,
        args: row.args({ reportPath, headingFirstPath, missingPath: join(dir, "missing.md") }),
        responses: [],
      });

      assert.equal(run.status, 2);
      assert.match(run.stderr, /^post-review\.mjs: /m);
      assert.deepEqual(run.calls, []);
      assert.deepEqual(run.lines, []);
    });
  }

  await t.test("gh missing from PATH prints not-posted gh-unavailable", (st) => {
    const emptyBinDir = scratchDir(st, "post-review-no-gh-");
    const reportPath = writeReport(st, APPROVE_REPORT);
    const result = spawnSync(
      process.execPath,
      [scriptPath, PR_URL, REVIEWED_SHA, reportPath, "at-head"],
      {
        cwd: dirname(reportPath),
        encoding: "utf8",
        timeout: SCRIPT_TIMEOUT_MS,
        env: { PATH: emptyBinDir },
      },
    );

    assert.equal(result.stdout, "not-posted gh-unavailable\n");
    assert.equal(result.status, 1);
  });

  for (const row of RUNTIME_FAILURE_ROWS) {
    await t.test(row.name, (st) => {
      const checkout = cleanCheckout(st);
      const reportPath = writeReport(st, APPROVE_REPORT);
      const run = runScript(st, {
        cwd: checkout.dir,
        args: [PR_URL, checkout.headSha, reportPath, "at-head"],
        responses: [row.read(checkout.headSha), ...row.post],
      });

      assert.deepEqual(run.lines, row.lines);
      assert.match(run.stderr, row.stderr);
      assert.equal(run.calls.length, row.calls);
      assert.equal(run.status, 1);
    });
  }

  for (const row of UNVERIFIED_ROWS) {
    await t.test(row.name, (st) => {
      const checkout = cleanCheckout(st);
      const reportPath = writeReport(st, APPROVE_REPORT);
      const run = runScript(st, {
        cwd: checkout.dir,
        args: [PR_URL, checkout.headSha, reportPath, "at-head"],
        responses: [
          prRead({ headRefOid: checkout.headSha }),
          reviewCreated({ state: "APPROVED", commitId: checkout.headSha, body: APPROVE_REPORT }),
          row.readBack(checkout.headSha),
        ],
      });

      assert.equal(run.lines.length, 1, `expected only the outcome line, got ${run.stdout}`);
      assert.match(run.lines[0], /^unverified [a-z0-9-]+$/);
      assert.equal(run.status, 1);
    });
  }
});

// ---------------------------------------------------------------------------------------
// Slice 2: post a review made from another checkout
// ---------------------------------------------------------------------------------------

const LEFT_HEAD_ROWS = [
  {
    name: "HEAD at another commit posts COMMENT with downgraded APPROVE off-head",
    prepare: (t) => {
      const checkout = cleanCheckout(t);
      writeFileSync(join(checkout.dir, "app.txt"), "v2\n");
      commitAll(checkout.dir, "second");
      return { cwd: checkout.dir, headSha: checkout.headSha, env: {} };
    },
  },
  {
    name: "a tracked file edited posts COMMENT with downgraded APPROVE off-head",
    prepare: (t) => {
      const checkout = cleanCheckout(t);
      writeFileSync(join(checkout.dir, "app.txt"), "edited\n");
      return { cwd: checkout.dir, headSha: checkout.headSha, env: {} };
    },
  },
  {
    name: "a cwd outside any repository posts COMMENT with downgraded APPROVE off-head",
    prepare: (t) => {
      const outside = scratchDir(t, "post-review-outside-");
      return {
        cwd: outside,
        headSha: REVIEWED_SHA,
        env: { GIT_CEILING_DIRECTORIES: dirname(outside) },
      };
    },
  },
];

test("caps APPROVE at COMMENT when the checkout leaves the reviewed head", async (t) => {
  for (const row of LEFT_HEAD_ROWS) {
    await t.test(row.name, (st) => {
      const target = row.prepare(st);
      const reportPath = writeReport(st, APPROVE_REPORT);
      const run = runScript(st, {
        cwd: target.cwd,
        env: target.env,
        args: [PR_URL, target.headSha, reportPath, "at-head"],
        responses: [
          prRead({ headRefOid: target.headSha }),
          reviewCreated({ state: "COMMENTED", commitId: target.headSha, body: APPROVE_REPORT }),
          reviewReadBack({ state: "COMMENTED", commitId: target.headSha, body: APPROVE_REPORT }),
        ],
      });

      assert.deepEqual(run.calls[1]?.argv, postReviewArgv("COMMENT", target.headSha));
      assert.deepEqual(run.lines, [`posted COMMENT ${REVIEW_URL}`, "downgraded APPROVE off-head"]);
      assert.equal(run.status, 0);
    });
  }

  await t.test("an untracked file alone still posts APPROVE", (st) => {
    const checkout = cleanCheckout(st);
    writeFileSync(join(checkout.dir, "test-output.log"), "created by a test run\n");
    const reportPath = writeReport(st, APPROVE_REPORT);
    const run = runScript(st, {
      cwd: checkout.dir,
      args: [PR_URL, checkout.headSha, reportPath, "at-head"],
      responses: [
        prRead({ headRefOid: checkout.headSha }),
        reviewCreated({ state: "APPROVED", commitId: checkout.headSha, body: APPROVE_REPORT }),
        reviewReadBack({ state: "APPROVED", commitId: checkout.headSha, body: APPROVE_REPORT }),
      ],
    });

    assert.deepEqual(run.calls[1]?.argv, postReviewArgv("APPROVE", checkout.headSha));
    assert.deepEqual(run.lines, [`posted APPROVE ${REVIEW_URL}`]);
    assert.equal(run.status, 0);
  });
});
