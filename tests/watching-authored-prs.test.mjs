// Fails when watching-authored-prs's poll.mjs misreads a change against its state file, reports a
// failure event twice or past its per-cycle cap, writes state after a failed poll, or lets a body
// reach stdout; when ci-log.sh stops keeping the last 200 lines or reaching gh with a bad job id;
// when ci-fix-preflight.mjs passes a binding condition that fails, lets a PR field reach a
// command line, or trusts a truncated file list; or when rerun-transient.mjs re-runs a job whose
// log shows no known runner or network fault, re-runs one past its bound or on a moved head, or
// lets log text reach stdout or a command line.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const SCRIPTS = resolve("skills/engineering/watching-authored-prs/scripts");
const POLL = join(SCRIPTS, "poll.mjs");
const CI_LOG = join(SCRIPTS, "ci-log.sh");
const PREFLIGHT = join(SCRIPTS, "ci-fix-preflight.mjs");
const RERUN = join(SCRIPTS, "rerun-transient.mjs");
const BASH = spawnSync("bash", ["-c", "command -v bash"], { encoding: "utf8" }).stdout.trim();

const HOST = "ghe.example.invalid";
const PR_URL = `https://${HOST}/o/r/pull/7`;
const HEAD = "a".repeat(40);
const OTHER_HEAD = "b".repeat(40);
const BODY_SENTINEL = "BODY-SENTINEL-w7k2";
const GRANTS = ["--feedback-grant", "present-then-stop", "--ci-grant", "report"];

// A fake for each tool in `tools`: it logs its argv and answers from the first rule whose
// `tool` matches and whose `prefix` starts its argv. A rule with `responses` answers its nth
// call with the nth response, repeating the last.
const FAKE_SOURCE = `
const fs = require("node:fs");
const path = require("node:path");
const dir = process.env.FAKE_DIR;
const tool = path.basename(process.argv[1]);
const args = process.argv.slice(2);
fs.appendFileSync(path.join(dir, "calls.jsonl"), JSON.stringify([tool, ...args]) + "\\n");
const rules = JSON.parse(fs.readFileSync(path.join(dir, "rules.json"), "utf8"));
const index = rules.findIndex((r) => r.tool === tool && r.prefix.every((p, i) => args[i] === p));
if (index < 0) {
  process.stderr.write("unexpected call: " + tool + " " + args.join(" ") + "\\n");
  process.exit(99);
}
const rule = rules[index];
const countPath = path.join(dir, "count-" + index);
const n = fs.existsSync(countPath) ? Number(fs.readFileSync(countPath, "utf8")) : 0;
fs.writeFileSync(countPath, String(n + 1));
const r = rule.responses ? rule.responses[Math.min(n, rule.responses.length - 1)] : rule;
process.stdout.write(r.stdout ?? "");
process.stderr.write(r.stderr ?? "");
process.exit(r.exitCode ?? 0);
`;

function scratch(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "watching-authored-prs-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function realPath(tool) {
  const found = spawnSync(BASH, ["-c", `command -v ${tool}`], { encoding: "utf8" }).stdout.trim();
  assert.ok(found, `test host lacks ${tool}`);
  return found;
}

// Runs `command args` with PATH holding only the fakes and the linked host tools.
function run(t, command, args, { rules = [], fakes = ["gh", "git"], tools = [], dir } = {}) {
  const root = dir ?? scratch(t);
  const bin = join(root, "bin");
  const fakeDir = join(root, "fake");
  mkdirSync(bin, { recursive: true });
  rmSync(fakeDir, { recursive: true, force: true });
  mkdirSync(fakeDir);
  for (const name of fakes) {
    writeFileSync(join(bin, name), `#!${process.execPath}\n${FAKE_SOURCE}`);
    chmodSync(join(bin, name), 0o755);
  }
  for (const tool of tools) {
    const link = join(bin, tool);
    if (!existsSync(link)) symlinkSync(realPath(tool), link);
  }
  writeFileSync(join(fakeDir, "rules.json"), JSON.stringify(rules));
  const result = spawnSync(command, args, {
    encoding: "utf8",
    cwd: root,
    env: { PATH: bin, FAKE_DIR: fakeDir, TMPDIR: root },
  });
  const callsPath = join(fakeDir, "calls.jsonl");
  const calls = existsSync(callsPath)
    ? readFileSync(callsPath, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : [];
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, calls, root };
}

// ---------- poll.mjs ----------

const author = (login) => (login === null ? null : { login });
const comment = (id, login, body = `${BODY_SENTINEL} ${id}`) => ({
  id,
  databaseId: 1,
  author: author(login),
  body,
  createdAt: "2026-10-01T00:00:00Z",
  url: `${PR_URL}#${id}`,
  reactionGroups: [],
});
const review = (id, login, state, body = `${BODY_SENTINEL} ${id}`) => ({
  ...comment(id, login, body),
  state,
});
const page = (nodes) => ({ pageInfo: { hasNextPage: false, endCursor: null }, nodes });
const thread = (id, logins, isResolved = false) => ({
  id,
  isResolved,
  isOutdated: false,
  path: "a.js",
  line: 1,
  startLine: null,
  comments: page(logins.map((login, i) => comment(`${id}-C${i}`, login))),
});

function graphqlResponse({
  head = HEAD,
  state = "OPEN",
  reviewDecision = "REVIEW_REQUIRED",
  conversation = [],
  reviews = [],
  threads = [],
} = {}) {
  return JSON.stringify({
    data: {
      viewer: { login: "me" },
      repository: {
        pullRequest: {
          url: PR_URL,
          state,
          headRefOid: head,
          reviewDecision,
          autoMergeRequest: null,
          conversationComments: page(conversation),
          reviewSummaries: page(reviews),
          reviewThreads: page(threads),
        },
      },
    },
  });
}

const check = (workflow, name, bucket, job = null) => ({
  workflow,
  name,
  bucket,
  state: bucket.toUpperCase(),
  link: job === null ? "" : `https://${HOST}/o/r/actions/runs/1/job/${job}`,
});

function pollRules({ head = HEAD, checks = [], checksResponse, viewResponse, feedback = {} } = {}) {
  return [
    {
      tool: "gh",
      prefix: ["pr", "view"],
      ...(viewResponse ?? { stdout: JSON.stringify({ headRefOid: head, checks: checks.length }) }),
    },
    {
      tool: "gh",
      prefix: ["pr", "checks"],
      ...(checksResponse ?? { stdout: JSON.stringify(checks) }),
    },
    { tool: "gh", prefix: ["api", "graphql"], stdout: graphqlResponse({ head, ...feedback }) },
  ];
}

function runPoll(t, rules, { dir, args } = {}) {
  const root = dir ?? scratch(t);
  const state = join(root, "state.json");
  const out = join(root, "feedback.json");
  const result = run(
    t,
    process.execPath,
    args ?? [POLL, PR_URL, "--state", state, "--out", out, ...GRANTS],
    { rules, fakes: ["gh"], dir: root },
  );
  const read = (path) => (existsSync(path) ? readFileSync(path, "utf8") : null);
  return {
    ...result,
    output: result.status === 0 ? JSON.parse(result.stdout) : null,
    state: result.status === 0 ? JSON.parse(read(state)) : null,
    out: read(out),
  };
}

test("cycle 0 reports existing feedback and failures, and writes state and the feedback file", (t) => {
  const feedback = {
    conversation: [comment("IC1", "alice"), comment("IC2", "me")],
    reviews: [
      review("R1", "alice", "COMMENTED"),
      review("R2", "bob", "APPROVED", ""),
      review("R3", "carol", "PENDING"),
      review("R4", "me", "COMMENTED"),
    ],
    threads: [thread("T2", ["alice"]), thread("T1", ["bob"]), thread("T3", ["bob"], true)],
  };
  const checks = [
    check("CI", "lint", "fail", 901),
    check("CI", "e2e", "pending"),
    check("CI", "build", "pass"),
    check("CI", "docs", "skipping"),
    check("Deploy", "preview", "cancel"),
    check("", "external", "fail"),
  ];
  const result = runPoll(t, pollRules({ checks, feedback }));
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!result.stdout.includes(BODY_SENTINEL), "stdout carries no body");
  assert.deepEqual(result.output, {
    head: HEAD,
    snapshot:
      "feedback present-then-stop, CI report | head aaaaaaa | threads 2, summaries 1, comments 1 | CI 1 pending, 2 passing, 3 failing | failing: `external`, `CI / lint`, `Deploy / preview` | pending: `CI / e2e`",
    terminal: null,
    approved: false,
    thirdParty: [],
    emptyChangesRequested: [],
    feedbackChange: true,
    newPrLevelIds: ["R1", "IC1"],
    ciSkipped: null,
    newFailures: [
      {
        check: "external",
        bucket: "fail",
        state: "FAIL",
        jobId: null,
        noLog: "not-an-actions-job",
      },
      { check: "CI / lint", bucket: "fail", state: "FAIL", jobId: "901", noLog: null },
      {
        check: "Deploy / preview",
        bucket: "cancel",
        state: "CANCEL",
        jobId: null,
        noLog: "bucket-cancel",
      },
    ],
    deferredFailures: 0,
  });
  assert.deepEqual(result.state, {
    version: 2,
    pr: PR_URL,
    head: HEAD,
    state: "OPEN",
    reviewDecision: "REVIEW_REQUIRED",
    unresolvedThreadIds: ["T1", "T2"],
    triagedPrLevelIds: ["IC1", "R1"],
    reportedFailures: [
      [HEAD, "", "external", ""],
      [HEAD, "CI", "lint", "901"],
      [HEAD, "Deploy", "preview", ""],
    ],
  });
  assert.equal(JSON.parse(result.out).reviewSummaries.length, 4, "the feedback file is complete");
  assert.ok(result.out.includes(BODY_SENTINEL), "the feedback file keeps bodies");
  for (const call of result.calls)
    assert.ok(
      call.includes(`${HOST}/o/r`) || call.includes(HOST),
      `gh call names the host: ${call.join(" ")}`,
    );
});

test("a second poll with nothing new reports no change and no failure twice", (t) => {
  const dir = scratch(t);
  const rules = pollRules({
    checks: [check("CI", "lint", "fail", 901)],
    feedback: { conversation: [comment("IC1", "alice")], threads: [thread("T1", ["bob"])] },
  });
  assert.equal(runPoll(t, rules, { dir }).status, 0);
  const second = runPoll(t, rules, { dir });
  assert.equal(second.status, 0, second.stderr);
  assert.equal(second.output.feedbackChange, false);
  assert.deepEqual(second.output.newPrLevelIds, []);
  assert.deepEqual(second.output.newFailures, []);
  assert.match(second.output.snapshot, /threads 1, summaries 0, comments 0/);
});

test("the same failing check on a new head is a new failure event", (t) => {
  const dir = scratch(t);
  const checks = [check("CI", "lint", "fail", 901)];
  assert.equal(runPoll(t, pollRules({ checks }), { dir }).status, 0);
  const second = runPoll(t, pollRules({ checks, head: OTHER_HEAD }), { dir });
  assert.equal(second.output.newFailures.length, 1);
  assert.equal(second.state.reportedFailures.length, 2);
});

test("a rerun job that fails again on the same head is a new failure event", (t) => {
  const dir = scratch(t);
  assert.equal(
    runPoll(t, pollRules({ checks: [check("CI", "lint", "fail", 901)] }), { dir }).status,
    0,
  );
  const rerun = runPoll(t, pollRules({ checks: [check("CI", "lint", "fail", 902)] }), { dir });
  assert.deepEqual(
    rerun.output.newFailures.map((failure) => failure.jobId),
    ["902"],
  );
  const again = runPoll(t, pollRules({ checks: [check("CI", "lint", "fail", 902)] }), { dir });
  assert.deepEqual(again.output.newFailures, []);
});

test("the rerun CI grant is accepted and named in the snapshot", (t) => {
  const root = scratch(t);
  const args = [POLL, PR_URL, "--state", join(root, "s"), "--out", join(root, "o")];
  const grants = ["--feedback-grant", "authorized", "--ci-grant", "rerun"];
  const result = runPoll(t, pollRules(), { dir: root, args: [...args, ...grants] });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.output.snapshot, /^feedback authorized, CI rerun \| /);
});

test("a changed thread set, state, or review decision is a feedback change", (t) => {
  for (const [label, next] of [
    ["resolved thread", { threads: [thread("T1", ["bob"], true)] }],
    ["review decision", { threads: [thread("T1", ["bob"])], reviewDecision: "APPROVED" }],
    ["state", { threads: [thread("T1", ["bob"])], state: "CLOSED" }],
  ]) {
    const dir = scratch(t);
    const base = { threads: [thread("T1", ["bob"])] };
    assert.equal(runPoll(t, pollRules({ feedback: base }), { dir }).status, 0);
    assert.equal(runPoll(t, pollRules({ feedback: base }), { dir }).output.feedbackChange, false);
    const changed = runPoll(t, pollRules({ feedback: next }), { dir });
    assert.equal(changed.output.feedbackChange, true, label);
  }
});

test("cycle 0 with no feedback is no feedback change, and an empty rollup skips gh pr checks", (t) => {
  const result = runPoll(t, pollRules({ feedback: { reviewDecision: "APPROVED" } }));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.output.feedbackChange, false);
  assert.equal(result.output.approved, true);
  assert.match(result.output.snapshot, / \| CI 0 checks$/);
  assert.ok(!result.calls.some((call) => call[1] === "pr" && call[2] === "checks"));
});

test("a merged or closed PR is terminal", (t) => {
  const result = runPoll(t, pollRules({ feedback: { state: "MERGED" } }));
  assert.equal(result.output.terminal, "MERGED");
});

test("a third login on a thread the viewer joined is reported, and a null author is one", (t) => {
  const result = runPoll(
    t,
    pollRules({
      feedback: {
        threads: [
          thread("T1", ["alice", "me", "alice", "carol"]),
          thread("T2", ["alice", "carol"]),
          thread("T3", ["alice", "me", null]),
          thread("T4", ["alice", "me", "dave"], true),
          thread("T5", ["alice", "me", "alice"]),
        ],
      },
    }),
  );
  assert.deepEqual(result.output.thirdParty, [
    { thread: "T1", logins: ["carol"] },
    { thread: "T3", logins: [null] },
  ]);
});

test("an empty CHANGES_REQUESTED review with no threads is reported only while it is the latest", (t) => {
  const cases = [
    [[review("R1", "bob", "CHANGES_REQUESTED", "")], [], ["bob"]],
    [[review("R1", "bob", "CHANGES_REQUESTED", "  \n")], [], ["bob"]],
    [[review("R1", "bob", "CHANGES_REQUESTED", ""), review("R2", "bob", "APPROVED", "")], [], []],
    [[review("R1", "bob", "CHANGES_REQUESTED", ""), review("R2", "bob", "COMMENTED")], [], ["bob"]],
    [[review("R1", "bob", "CHANGES_REQUESTED", "")], [thread("T1", ["bob"], true)], []],
    [[review("R1", "bob", "CHANGES_REQUESTED", "please fix")], [], []],
    [[review("R1", "me", "CHANGES_REQUESTED", "")], [], []],
  ];
  for (const [reviews, threads, expected] of cases) {
    const result = runPoll(t, pollRules({ feedback: { reviews, threads } }));
    assert.deepEqual(result.output.emptyChangesRequested, expected, JSON.stringify(reviews));
  }
});

test("at most 3 failures with readable logs are reported per poll; the rest wait", (t) => {
  const dir = scratch(t);
  const checks = [1, 2, 3, 4, 5].map((n) => check("CI", `job${n}`, "fail", 900 + n));
  checks.push(check("CI", "cancelled", "cancel"));
  const first = runPoll(t, pollRules({ checks }), { dir });
  assert.deepEqual(
    first.output.newFailures.map((failure) => failure.check),
    ["CI / cancelled", "CI / job1", "CI / job2", "CI / job3"],
  );
  assert.equal(first.output.deferredFailures, 2);
  const second = runPoll(t, pollRules({ checks }), { dir });
  assert.deepEqual(
    second.output.newFailures.map((failure) => failure.jobId),
    ["904", "905"],
  );
  assert.equal(second.output.deferredFailures, 0);
});

test("an Actions link for another repository or host has no readable log", (t) => {
  const result = runPoll(
    t,
    pollRules({
      checks: [
        { ...check("CI", "a", "fail"), link: `https://${HOST}/other/r/actions/runs/1/job/5` },
        { ...check("CI", "b", "fail"), link: "https://github.com/o/r/actions/runs/1/job/6" },
        { ...check("CI", "c", "fail"), link: `https://${HOST}/o/r/actions/runs/1/job/7x` },
      ],
    }),
  );
  assert.deepEqual(
    result.output.newFailures.map((failure) => [failure.jobId, failure.noLog]),
    [
      [null, "not-an-actions-job"],
      [null, "not-an-actions-job"],
      [null, "not-an-actions-job"],
    ],
  );
});

test("a head that moves during the poll skips CI and reports no failure", (t) => {
  const result = runPoll(t, [
    {
      tool: "gh",
      prefix: ["pr", "view"],
      stdout: JSON.stringify({ headRefOid: HEAD, checks: 1 }),
    },
    {
      tool: "gh",
      prefix: ["pr", "checks"],
      stdout: JSON.stringify([check("CI", "lint", "fail", 901)]),
    },
    { tool: "gh", prefix: ["api", "graphql"], stdout: graphqlResponse({ head: OTHER_HEAD }) },
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.output.ciSkipped, "head-moved");
  assert.equal(result.output.head, OTHER_HEAD);
  assert.deepEqual(result.output.newFailures, []);
  assert.deepEqual(result.state.reportedFailures, []);
  assert.match(result.output.snapshot, /\| head bbbbbbb \| .* \| CI head moved during poll$/);
});

test("gh pr checks is judged by its stdout, not its exit status", (t) => {
  const checks = [check("CI", "e2e", "pending")];
  const result = runPoll(
    t,
    pollRules({ checks, checksResponse: { stdout: JSON.stringify(checks), exitCode: 8 } }),
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.output.snapshot,
    /CI 1 pending, 0 passing, 0 failing \| pending: `CI \/ e2e`$/,
  );
});

test("a check name holding a backtick stays one code span on one line", (t) => {
  const result = runPoll(t, pollRules({ checks: [check("CI", "a`b\nc", "pending")] }));
  assert.match(result.output.snapshot, /pending: `` CI \/ a`b c ``$/);
});

test("a failed or malformed read is a poll failure that writes nothing", (t) => {
  const failures = [
    ["gh pr view fails", { viewResponse: { exitCode: 1, stderr: "HTTP 502" } }],
    ["gh pr view is not JSON", { viewResponse: { stdout: "oops" } }],
    ["short head", { viewResponse: { stdout: JSON.stringify({ headRefOid: "abc", checks: 0 }) } }],
    [
      "empty checks with a rollup",
      { checks: [check("CI", "a", "pass")], checksResponse: { stdout: "[]", exitCode: 1 } },
    ],
    [
      "non-JSON checks",
      { checks: [check("CI", "a", "pass")], checksResponse: { stdout: "no checks", exitCode: 1 } },
    ],
  ];
  for (const [label, options] of failures) {
    const result = runPoll(t, pollRules(options));
    assert.equal(result.status, 1, `${label}: ${result.stderr}`);
    assert.equal(result.stdout, "", label);
    assert.ok(!existsSync(join(result.root, "state.json")), label);
    assert.equal(result.out, null, label);
    assert.match(result.stderr, /poll\.mjs: /, label);
  }
});

test("a failed feedback fetch is a poll failure that keeps the prior state", (t) => {
  const dir = scratch(t);
  assert.equal(runPoll(t, pollRules(), { dir }).status, 0);
  const before = readFileSync(join(dir, "state.json"), "utf8");
  const result = runPoll(
    t,
    [pollRules()[0], { tool: "gh", prefix: ["api", "graphql"], exitCode: 1, stderr: "HTTP 502" }],
    { dir },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(readFileSync(join(dir, "state.json"), "utf8"), before);
});

test("bad arguments and foreign state files are usage faults", (t) => {
  const dir = scratch(t);
  const state = join(dir, "state.json");
  const out = join(dir, "out.json");
  const cases = [
    [POLL, PR_URL, "--state", state, "--out", out],
    [POLL, "https://ghe.example.invalid/o/r/issues/7", "--state", state, "--out", out, ...GRANTS],
    [POLL, PR_URL, "--state", state, "--out", out, "--feedback-grant", "yes", "--ci-grant", "fix"],
    [POLL, PR_URL, "--state", state, "--out", out, ...GRANTS, "--extra"],
  ];
  for (const args of cases) {
    const result = runPoll(t, pollRules(), { dir, args });
    assert.equal(result.status, 2, args.join(" "));
    assert.deepEqual(result.calls, [], "nothing ran");
  }
  const version1 = {
    version: 1,
    pr: PR_URL,
    head: HEAD,
    state: "OPEN",
    reviewDecision: null,
    unresolvedThreadIds: [],
    triagedPrLevelIds: [],
    reportedFailures: [[HEAD, "CI", "lint"]],
  };
  for (const content of [
    "not json",
    JSON.stringify({ version: 2, pr: "https://x/o/r/pull/1" }),
    JSON.stringify(version1),
  ]) {
    writeFileSync(state, content);
    const result = runPoll(t, pollRules(), { dir });
    assert.equal(result.status, 2, content);
    assert.match(result.stderr, /is not a version 2 watch state/);
    assert.equal(readFileSync(state, "utf8"), content, "the state file is untouched");
  }
});

test("poll.mjs exits 127 when gh is missing", (t) => {
  const root = scratch(t);
  const result = run(
    t,
    process.execPath,
    [POLL, PR_URL, "--state", join(root, "s"), "--out", join(root, "o"), ...GRANTS],
    { fakes: [], dir: root },
  );
  assert.equal(result.status, 127);
  assert.match(result.stderr, /gh is not on PATH/);
});

// ---------- ci-log.sh ----------

const CI_LOG_TOOLS = ["mktemp", "rm", "tail", "mv"];

function runCiLog(t, args, rules = [], { fakes = ["gh"] } = {}) {
  const root = scratch(t);
  const out = join(root, "log.txt");
  const result = run(t, BASH, [CI_LOG, ...args.map((arg) => (arg === "<out>" ? out : arg))], {
    rules,
    fakes,
    tools: CI_LOG_TOOLS,
    dir: root,
  });
  return { ...result, out: existsSync(out) ? readFileSync(out, "utf8") : null };
}

const LOG_ARGS = [HOST, "o/r", "901", "<out>"];

test("ci-log.sh keeps the last 200 lines of the failed-step log", (t) => {
  const log = Array.from({ length: 250 }, (_, i) => `line ${i + 1}`).join("\n") + "\n";
  const result = runCiLog(t, LOG_ARGS, [{ tool: "gh", prefix: ["run", "view"], stdout: log }]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
  const lines = result.out.trimEnd().split("\n");
  assert.equal(lines.length, 200);
  assert.equal(lines[0], "line 51");
  assert.equal(lines.at(-1), "line 250");
  assert.deepEqual(result.calls, [
    ["gh", "run", "view", "--job", "901", "--repo", `${HOST}/o/r`, "--log-failed"],
  ]);
});

test("ci-log.sh exits 3 on an empty log and 1 on a gh failure, leaving the file untouched", (t) => {
  const empty = runCiLog(t, LOG_ARGS, [{ tool: "gh", prefix: ["run", "view"], stdout: "" }]);
  assert.equal(empty.status, 3);
  assert.equal(empty.out, null);
  const failed = runCiLog(t, LOG_ARGS, [
    { tool: "gh", prefix: ["run", "view"], exitCode: 1, stderr: "HTTP 404" },
  ]);
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /HTTP 404/);
  assert.equal(failed.out, null);
});

test("ci-log.sh rejects bad arguments before calling gh", (t) => {
  for (const args of [
    [HOST, "o/r", "901"],
    [HOST, "o/r", "9a1", "<out>"],
    [HOST, "o/r", "--log", "<out>"],
    [HOST, "o", "901", "<out>"],
    ["bad host", "o/r", "901", "<out>"],
  ]) {
    const result = runCiLog(t, args);
    assert.equal(result.status, 2, args.join(" "));
    assert.deepEqual(result.calls, []);
  }
});

test("ci-log.sh exits 127 when gh is missing", (t) => {
  const result = runCiLog(t, LOG_ARGS, [], { fakes: [] });
  assert.equal(result.status, 127);
});

// ---------- ci-fix-preflight.mjs ----------

// Git and gh rules for a checkout bound to a fork PR, with `overrides` replacing named answers.
function preflightRules(overrides = {}) {
  const o = {
    head: HEAD,
    status: "",
    branch: { stdout: "feature\n" },
    view: {
      headRefOid: HEAD,
      headRefName: "feature",
      headRepository: { name: "fork-repo" },
      headRepositoryOwner: { login: "fork-owner" },
    },
    tracking: "origin\0refs/heads/feature\0origin\n",
    pushRefspec: { exitCode: 1 },
    mirror: { exitCode: 1 },
    pushDefault: { exitCode: 1 },
    pushUrls: `git@${HOST}:Fork-Owner/fork-repo.git\n`,
    files: [
      { filename: "src/b.js", status: "modified" },
      { filename: "src/a.js", status: "added" },
      { filename: "old.js", status: "removed" },
    ],
    filesResponse: null,
    secondView: null,
    ...overrides,
  };
  const view = { stdout: JSON.stringify(o.view) };
  return [
    { tool: "git", prefix: ["rev-parse", "HEAD"], stdout: `${o.head}\n` },
    { tool: "git", prefix: ["status", "--porcelain"], stdout: o.status },
    { tool: "git", prefix: ["symbolic-ref"], ...o.branch },
    { tool: "git", prefix: ["for-each-ref"], stdout: o.tracking },
    { tool: "git", prefix: ["config", "--get-all"], ...o.pushRefspec },
    { tool: "git", prefix: ["config", "--bool"], ...o.mirror },
    { tool: "git", prefix: ["config", "--get", "push.default"], ...o.pushDefault },
    { tool: "git", prefix: ["remote", "get-url"], stdout: o.pushUrls },
    {
      tool: "gh",
      prefix: ["pr", "view"],
      responses: [view, o.secondView ?? { stdout: JSON.stringify({ headRefOid: HEAD }) }],
    },
    {
      tool: "gh",
      prefix: ["api"],
      ...(o.filesResponse ?? {
        stdout: o.files.map((file) => JSON.stringify(file)).join("\n") + "\n",
      }),
    },
  ];
}

const runPreflight = (t, rules, args = [PR_URL, HEAD], options = {}) =>
  run(t, process.execPath, [PREFLIGHT, ...args], { rules, ...options });

test("a bound checkout gets the sorted editable set, and PR fields never reach a command", (t) => {
  const result = runPreflight(t, preflightRules());
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    binding: "ok",
    editable: ["src/a.js", "src/b.js"],
  });
  const flat = result.calls.flat().join(" ");
  assert.ok(!flat.includes("fork-owner") && !flat.includes("fork-repo"));
  assert.deepEqual(
    result.calls.filter((call) => call[0] === "gh").map((call) => call.slice(1, 3)),
    [
      ["pr", "view"],
      ["api", "--hostname"],
      ["pr", "view"],
    ],
  );
  assert.ok(result.calls.some((call) => call.includes(`repos/o/r/pulls/7/files`)));
});

test("each push URL form naming the head repository binds", (t) => {
  for (const url of [
    `https://${HOST}/fork-owner/fork-repo.git`,
    `https://token@${HOST}/FORK-OWNER/fork-repo`,
    `ssh://git@${HOST}:2222/fork-owner/fork-repo.git`,
    `${HOST}:fork-owner/fork-repo`,
  ]) {
    const result = runPreflight(t, preflightRules({ pushUrls: `${url}\n` }));
    assert.equal(JSON.parse(result.stdout).binding, "ok", url);
  }
});

test("push.default simple, upstream, or current binds", (t) => {
  for (const value of ["simple", "upstream", "current"]) {
    const result = runPreflight(t, preflightRules({ pushDefault: { stdout: `${value}\n` } }));
    assert.equal(JSON.parse(result.stdout).binding, "ok", value);
  }
});

test("each failed binding condition is named and no file list is read", (t) => {
  const cases = [
    ["head-mismatch", { head: OTHER_HEAD }],
    ["dirty-worktree", { status: " M a.js\n" }],
    ["detached-head", { branch: { exitCode: 1 } }],
    ["head-moved", { view: { headRefOid: OTHER_HEAD } }],
    ["branch-name", { branch: { stdout: "feature-2\n" } }],
    ["no-upstream", { tracking: "\0\0\n" }],
    ["upstream-ref", { tracking: "origin\0refs/heads/other\0origin\n" }],
    ["push-remote", { tracking: "origin\0refs/heads/feature\0fork\n" }],
    ["push-refspec", { pushRefspec: { stdout: "refs/heads/*:refs/heads/x/*\n" } }],
    ["mirror", { mirror: { stdout: "true\n" } }],
    ["push-default", { pushDefault: { stdout: "matching\n" } }],
    [
      "head-repository-missing",
      {
        view: {
          headRefOid: HEAD,
          headRefName: "feature",
          headRepository: null,
          headRepositoryOwner: { login: "fork-owner" },
        },
      },
    ],
    ["push-url-count", { pushUrls: `git@${HOST}:fork-owner/fork-repo.git\ngit@x:a/b.git\n` }],
    ["push-url", { pushUrls: `git@${HOST}:o/r.git\n` }],
    ["push-url", { pushUrls: `git@github.com:fork-owner/fork-repo.git\n` }],
    ["push-url", { pushUrls: `/srv/git/fork-repo.git\n` }],
  ];
  for (const [condition, overrides] of cases) {
    const result = runPreflight(t, preflightRules(overrides));
    assert.equal(result.status, 0, `${condition}: ${result.stderr}`);
    assert.deepEqual(JSON.parse(result.stdout), { binding: "fail", condition }, condition);
    assert.ok(!result.calls.some((call) => call[1] === "api"), `${condition}: no file list`);
  }
});

test("a head that moves across the file-list read fails the binding", (t) => {
  const result = runPreflight(
    t,
    preflightRules({ secondView: { stdout: JSON.stringify({ headRefOid: OTHER_HEAD }) } }),
  );
  assert.deepEqual(JSON.parse(result.stdout), { binding: "fail", condition: "head-moved" });
});

test("an unreadable, unparseable, or capped file list exits 1 with no verdict", (t) => {
  const capped = Array.from({ length: 3000 }, (_, i) => ({ filename: `f${i}`, status: "added" }));
  for (const [label, overrides] of [
    ["gh fails", { filesResponse: { exitCode: 1, stderr: "HTTP 500" } }],
    ["unparseable", { filesResponse: { stdout: "not json\n" } }],
    ["missing field", { filesResponse: { stdout: '{"filename":"a"}\n' } }],
    ["3000 entries", { files: capped }],
  ]) {
    const result = runPreflight(t, preflightRules(overrides));
    assert.equal(result.status, 1, label);
    assert.equal(result.stdout, "", label);
    assert.match(result.stderr, /ci-fix-preflight\.mjs: /, label);
  }
});

test("ci-fix-preflight.mjs shows git's own error when symbolic-ref fails", (t) => {
  const result = runPreflight(
    t,
    preflightRules({ branch: { exitCode: 128, stderr: "fatal: symbolic-ref sentinel\n" } }),
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(
    result.stderr,
    /^fatal: symbolic-ref sentinel\nci-fix-preflight\.mjs: git symbolic-ref exited 128\n/,
  );
});

test("ci-fix-preflight.mjs rejects bad arguments before running anything", (t) => {
  for (const args of [
    [PR_URL],
    [PR_URL, "abc"],
    ["https://x/o/r/pull/0", HEAD],
    [PR_URL, HEAD, "x"],
  ]) {
    const result = runPreflight(t, preflightRules(), args);
    assert.equal(result.status, 2, args.join(" "));
    assert.deepEqual(result.calls, []);
  }
});

test("ci-fix-preflight.mjs exits 127 when git is missing", (t) => {
  const result = runPreflight(t, preflightRules(), [PR_URL, HEAD], { fakes: ["gh"] });
  assert.equal(result.status, 127);
  assert.match(result.stderr, /git is not on PATH/);
});

// ---------- rerun-transient.mjs ----------

const LOG_SENTINEL = "LOG-SENTINEL-q3m9";
const TRANSIENT_LOG = [
  `${LOG_SENTINEL} npm ci`,
  "npm error code ECONNRESET",
  "npm error network aborted",
  "Error: Process completed with exit code 1.",
].join("\n");
const TEST_FAILURE_LOG = [
  `${LOG_SENTINEL} FAIL src/a.test.js`,
  "expected 2 to equal 3",
  "Error: Process completed with exit code 1.",
].join("\n");
const JOB_PATH = "repos/o/r/actions/jobs/901";
const RUN_PATH = "repos/o/r/actions/runs/55";

function rerunRules({ job = {}, run = {}, rerun = {} } = {}) {
  return [
    {
      tool: "gh",
      prefix: ["api", "--hostname", HOST, JOB_PATH],
      stdout: JSON.stringify({
        id: 901,
        run_id: 55,
        head_sha: HEAD,
        status: "completed",
        conclusion: "failure",
        ...job,
      }),
    },
    {
      tool: "gh",
      prefix: ["api", "--hostname", HOST, RUN_PATH],
      stdout: JSON.stringify({ id: 55, status: "completed", run_attempt: 1, ...run }),
    },
    {
      tool: "gh",
      prefix: ["api", "--hostname", HOST, "--method", "POST", `${JOB_PATH}/rerun`],
      stdout: "",
      ...rerun,
    },
  ];
}

function runRerun(t, rules, { log = TRANSIENT_LOG, args, fakes = ["gh"] } = {}) {
  const root = scratch(t);
  const logPath = join(root, "job.log");
  if (log !== null) writeFileSync(logPath, log);
  const result = run(t, process.execPath, args ?? [RERUN, PR_URL, HEAD, "901", logPath], {
    rules,
    fakes,
    dir: root,
  });
  return { ...result, output: result.status === 0 ? JSON.parse(result.stdout) : null };
}

const posted = (calls) => calls.some((call) => call.includes("POST"));

test("a known network fault on a completed first attempt re-runs the job", (t) => {
  const result = runRerun(t, rerunRules());
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.output, {
    rerun: true,
    reason: null,
    signature: "connection-reset",
    lineNumber: 2,
    runId: "55",
    attempt: 2,
  });
  assert.ok(posted(result.calls), "the job was re-run");
  assert.ok(!result.stdout.includes(LOG_SENTINEL), "stdout carries no log text");
  assert.ok(!result.calls.flat().join(" ").includes("ECONNRESET"), "no log text reaches gh");
});

test("each runner or network signature is transient, and the last matching line is named", (t) => {
  const cases = [
    ["The runner has received a shutdown signal.", "runner-shutdown"],
    ["The hosted runner: GitHub Actions 3 lost communication with the server.", "runner-lost"],
    ["getaddrinfo EAI_AGAIN registry.npmjs.org", "dns"],
    ["Temporary failure in name resolution", "dns"],
    ["read ETIMEDOUT", "network-timeout"],
    ["net/http: TLS handshake timeout", "network-timeout"],
    ["fatal: unable to access 'https://x/': The requested URL returned error: 503", "upstream-5xx"],
    ["Received 502 Bad Gateway from the registry", "upstream-5xx"],
    ["curl: (56) Recv failure: Connection reset by peer", "connection-reset"],
  ];
  for (const [line, signature] of cases) {
    const log = ["socket hang up", "step output", line, "done"].join("\n");
    const result = runRerun(t, rerunRules(), { log });
    assert.equal(result.status, 0, `${line}: ${result.stderr}`);
    assert.equal(result.output.signature, signature, line);
    assert.equal(result.output.lineNumber, 3, line);
  }
});

test("a log with no known fault re-runs nothing and calls no gh", (t) => {
  for (const log of [TEST_FAILURE_LOG, "", "No space left on device", "exit code 137"]) {
    const result = runRerun(t, rerunRules(), { log });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.output, {
      rerun: false,
      reason: "not-transient",
      signature: null,
      lineNumber: null,
      runId: null,
      attempt: null,
    });
    assert.deepEqual(result.calls, [], JSON.stringify(log));
  }
});

test("a moved head, unfinished run, spent bound, or non-failed job re-runs nothing", (t) => {
  const cases = [
    ["head-moved", { job: { head_sha: OTHER_HEAD } }, null],
    ["not-failed", { job: { conclusion: "cancelled" } }, null],
    ["run-in-progress", { run: { status: "in_progress" } }, 1],
    ["rerun-bound", { run: { run_attempt: 3 } }, 3],
  ];
  for (const [reason, options, attempt] of cases) {
    const result = runRerun(t, rerunRules(options));
    assert.equal(result.status, 0, `${reason}: ${result.stderr}`);
    assert.equal(result.output.rerun, false, reason);
    assert.equal(result.output.reason, reason);
    assert.equal(result.output.signature, "connection-reset", reason);
    assert.equal(result.output.attempt, attempt, reason);
    assert.ok(!posted(result.calls), `${reason}: nothing was re-run`);
  }
});

test("a failed or malformed gh read or re-run request exits 1 with gh's error", (t) => {
  const cases = [
    ["job read fails", [{ ...rerunRules()[0], stdout: "", stderr: "HTTP 404", exitCode: 1 }]],
    ["job read is not JSON", [{ ...rerunRules()[0], stdout: "oops" }]],
    ["run read is malformed", rerunRules({ run: { run_attempt: "one" } })],
    ["re-run is refused", rerunRules({ rerun: { stderr: "HTTP 403", exitCode: 1 } })],
  ];
  for (const [label, rules] of cases) {
    const result = runRerun(t, rules);
    assert.equal(result.status, 1, `${label}: ${result.stderr}`);
    assert.equal(result.stdout, "", label);
    assert.match(result.stderr, /rerun-transient\.mjs: /, label);
  }
  const refused = runRerun(t, rerunRules({ rerun: { stderr: "HTTP 403 refused\n", exitCode: 1 } }));
  assert.match(refused.stderr, /HTTP 403 refused/);
});

test("rerun-transient.mjs rejects bad arguments and an unreadable log before calling gh", (t) => {
  const root = scratch(t);
  const log = join(root, "job.log");
  writeFileSync(log, TRANSIENT_LOG);
  const cases = [
    [RERUN],
    [RERUN, PR_URL, HEAD, "901"],
    [RERUN, "https://ghe.example.invalid/o/r/issues/7", HEAD, "901", log],
    [RERUN, PR_URL, "abc", "901", log],
    [RERUN, PR_URL, HEAD, "9x1", log],
    [RERUN, PR_URL, HEAD, "901", join(root, "missing.log")],
    [RERUN, PR_URL, HEAD, "901", log, "--extra"],
  ];
  for (const args of cases) {
    const result = runRerun(t, rerunRules(), { args });
    assert.equal(result.status, 2, args.join(" "));
    assert.deepEqual(result.calls, [], "nothing ran");
  }
});

test("rerun-transient.mjs exits 127 when gh is missing", (t) => {
  const result = runRerun(t, [], { fakes: [] });
  assert.equal(result.status, 127);
  assert.match(result.stderr, /gh is not on PATH/);
});
