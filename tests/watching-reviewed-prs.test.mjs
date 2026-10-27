// Fails when watching-reviewed-prs's scripts misjudge the tracked set, the gate, a re-review
// trigger, the third-party check, approval readiness, or a merge-safety check; let another
// author's body or any thread body reach the arm output; read a body during a poll; render an
// approval body that breaks a rendering rule; or report an approval its read cannot confirm at
// the head.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import test from "node:test";
import { summarizeArm } from "../skills/engineering/watching-reviewed-prs/scripts/arm.mjs";
import {
  evaluatePoll,
  validateState,
} from "../skills/engineering/watching-reviewed-prs/scripts/poll.mjs";
import { renderApproval } from "../skills/engineering/watching-reviewed-prs/scripts/render-approval.mjs";

const SCRIPTS = resolve("skills/engineering/watching-reviewed-prs/scripts");
const HOST = "ghe.example.invalid";
const PR_URL = `https://${HOST}/o/r/pull/7`;
const ARM_HEAD = "a".repeat(40);
const NEW_HEAD = "b".repeat(40);
const BODY_SENTINEL = "BODY-SENTINEL-w7k2";
const BEFORE = "2026-10-01T10:00:00Z";
const AFTER = "2026-10-02T10:00:00Z";

// ---------- feedback builders (the shape fetch-pr-feedback.mjs prints) ----------

const by = (login) => (login === null ? null : { login });

function comment(id, login, extra = {}) {
  return {
    id,
    databaseId: 1,
    author: by(login),
    state: "SUBMITTED",
    createdAt: BEFORE,
    url: `${PR_URL}#${id}`,
    reactionGroups: [],
    ...extra,
  };
}

function thread(id, comments, isResolved = false) {
  return {
    id,
    isResolved,
    isOutdated: false,
    path: `src/${id}.js`,
    line: 1,
    startLine: null,
    comments,
  };
}

function summary(id, login, extra = {}) {
  return {
    id,
    databaseId: 1,
    author: by(login),
    state: "COMMENTED",
    submittedAt: BEFORE,
    url: `${PR_URL}#${id}`,
    reactionGroups: [],
    ...extra,
  };
}

function feedback({
  threads = [],
  summaries = [],
  conversation = [],
  head = ARM_HEAD,
  state = "OPEN",
  autoMerge = false,
} = {}) {
  return {
    pr: {
      host: HOST,
      owner: "o",
      repo: "r",
      number: 7,
      url: PR_URL,
      state,
      headRefOid: head,
      reviewDecision: null,
      autoMergeEnabled: autoMerge,
    },
    viewer: { login: "me" },
    conversationComments: conversation,
    reviewSummaries: summaries,
    reviewThreads: threads,
  };
}

function state(extra = {}) {
  return {
    armHead: ARM_HEAD,
    autoMergeConfirmed: false,
    trackedItems: [],
    armCounts: { threads: 0, reviewSummaries: 0, conversationComments: 0 },
    resolvedBySkill: [],
    verdicts: {},
    ...extra,
  };
}

// ---------- evaluatePoll ----------

test("the tracked set holds only submitted threads the viewer opened, resolved or not", () => {
  const poll = evaluatePoll(
    feedback({
      threads: [
        thread("T1", [comment("C1", "me")]),
        thread("T2", [comment("C2", "me")], true),
        thread("T3", [comment("C3", "me", { state: "PENDING" })]),
        thread("T4", [comment("C4", "lee"), comment("C5", "me")]),
      ],
    }),
    state(),
    null,
  );
  assert.deepEqual(
    poll.items.map((i) => i.id),
    ["T1", "T2"],
  );
  assert.deepEqual(poll.counts.threads, { tracked: 2, resolved: 1 });
  assert.deepEqual(poll.gate, ["T1"]);
});

test("cycle 0 triggers every resolved thread, replied thread, and engaged PR-level item", () => {
  const poll = evaluatePoll(
    feedback({
      threads: [
        thread("T1", [comment("C1", "me")], true),
        thread("T2", [comment("C2", "me"), comment("C3", "lee")]),
        thread("T3", [comment("C4", "me"), comment("C5", "me")]),
      ],
      summaries: [summary("S1", "me", { submittedAt: BEFORE })],
      conversation: [comment("IC1", "me", { createdAt: AFTER })],
    }),
    state({ trackedItems: ["S1", "IC1"] }),
    "2026-10-01T12:00:00Z",
  );
  assert.deepEqual(
    poll.triggers.map((tr) => [tr.id, tr.kind, tr.key]),
    [
      ["T1", "resolved", "none|resolved"],
      ["T2", "reply", "C3|open"],
      ["S1", "engaged", ARM_HEAD],
    ],
  );
  assert.equal(poll.triggers[1].resolvedKey, "C3|resolved");
  assert.deepEqual(poll.gate, ["T2", "T3", "IC1"]);
  assert.deepEqual(poll.counts.reviewSummaries, { tracked: 1, engaged: 1 });
  assert.deepEqual(poll.counts.conversationComments, { tracked: 1, engaged: 0 });
});

test("a current verdict suppresses its trigger, and any change to the key voids it", async (t) => {
  const cases = [
    ["no change", [comment("C1", "me"), comment("C2", "lee")], false, "C2|open", null],
    [
      "a new reply",
      [comment("C1", "me"), comment("C2", "lee"), comment("C3", "lee")],
      false,
      "C2|open",
      "reply",
    ],
    [
      "the author resolves",
      [comment("C1", "me"), comment("C2", "lee")],
      true,
      "C2|open",
      "resolved",
    ],
    ["a reopen", [comment("C1", "me"), comment("C2", "lee")], false, "C2|resolved", "reopened"],
    [
      "a resolve the skill recorded",
      [comment("C1", "me"), comment("C2", "lee")],
      true,
      "C2|resolved",
      null,
    ],
    [
      "a viewer rebuttal",
      [comment("C1", "me"), comment("C2", "lee"), comment("C3", "me")],
      false,
      "C2|open",
      null,
    ],
  ];
  for (const [name, comments, resolved, key, kind] of cases) {
    await t.test(name, () => {
      const poll = evaluatePoll(
        feedback({ threads: [thread("T1", comments, resolved)] }),
        state({ verdicts: { T1: { key, verdict: "pending" } } }),
        null,
      );
      assert.deepEqual(
        poll.triggers.map((tr) => tr.kind),
        kind === null ? [] : [kind],
      );
      assert.equal(poll.items[0].verdict, kind === null ? "pending" : null);
    });
  }
});

test("a push past a PR-level verdict voids it, and a reply alone does not", () => {
  const tracked = {
    trackedItems: ["S1"],
    verdicts: { S1: { key: ARM_HEAD, verdict: "addressed" } },
  };
  const same = evaluatePoll(
    feedback({
      summaries: [summary("S1", "me")],
      conversation: [comment("IC9", "lee", { createdAt: AFTER })],
    }),
    state(tracked),
    AFTER,
  );
  assert.deepEqual(same.triggers, []);
  assert.equal(same.items[0].verdict, "addressed");
  const pushed = evaluatePoll(
    feedback({ summaries: [summary("S1", "me")], head: NEW_HEAD }),
    state(tracked),
    AFTER,
  );
  assert.deepEqual(pushed.triggers, [
    { id: "S1", shape: "reviewSummary", kind: "engaged", key: NEW_HEAD },
  ]);
});

test("a tracked id that is gone or not the viewer's is vanished, not tracked", () => {
  const poll = evaluatePoll(
    feedback({ conversation: [comment("IC1", "lee")] }),
    state({ trackedItems: ["IC1", "S9"] }),
    AFTER,
  );
  assert.deepEqual(poll.items, []);
  assert.deepEqual(poll.vanished, ["IC1", "S9"]);
});

test("the third-party check names every third login on unresolved threads only", () => {
  const poll = evaluatePoll(
    feedback({
      threads: [
        thread("T1", [
          comment("C1", "me"),
          comment("C2", "lee"),
          comment("C3", "kim"),
          comment("C4", null),
          comment("C5", "kim"),
        ]),
        thread("T2", [comment("C6", "me"), comment("C7", "lee"), comment("C8", "kim")], true),
        thread("T3", [comment("C9", "me"), comment("C10", "lee"), comment("C11", "me")]),
      ],
    }),
    state(),
    null,
  );
  assert.deepEqual(poll.thirdParty, [{ id: "T1", logins: ["kim", "(deleted)"] }]);
  assert.deepEqual(
    poll.items.map((i) => i.viewerReplied),
    [false, false, true],
  );
});

test("approval readiness needs an open PR, a non-empty set, an empty gate, and passing verdicts", async (t) => {
  const ready = {
    threads: [thread("T1", [comment("C1", "me"), comment("C2", "lee")], true)],
    summaries: [summary("S1", "me")],
  };
  const verdicts = {
    T1: { key: "C2|resolved", verdict: "answered" },
    S1: { key: ARM_HEAD, verdict: "addressed" },
  };
  const cases = [
    ["all passing", ready, verdicts, "OPEN", true],
    [
      "a pending verdict",
      ready,
      { ...verdicts, S1: { key: ARM_HEAD, verdict: "pending" } },
      "OPEN",
      false,
    ],
    ["a missing verdict", ready, { T1: verdicts.T1 }, "OPEN", false],
    [
      "an open thread",
      { ...ready, threads: [thread("T1", [comment("C1", "me"), comment("C2", "lee")])] },
      verdicts,
      "OPEN",
      false,
    ],
    ["a merged PR", ready, verdicts, "MERGED", false],
    ["an empty tracked set", {}, {}, "OPEN", false],
  ];
  for (const [name, shape, recorded, prState, expected] of cases) {
    await t.test(name, () => {
      const poll = evaluatePoll(
        feedback({ ...shape, state: prState }),
        state({ trackedItems: ["S1"], verdicts: recorded }),
        AFTER,
      );
      assert.equal(poll.approvalReady, expected);
    });
  }
});

test("the safety checks flag head drift, unconfirmed auto-merge, and a missing baseline", () => {
  const drift = evaluatePoll(feedback({ head: NEW_HEAD, autoMerge: true }), state(), null);
  assert.deepEqual(drift.safety, {
    headDrift: true,
    autoMergeUnconfirmed: true,
    baselineMissing: false,
  });
  const confirmed = evaluatePoll(
    feedback({ autoMerge: true }),
    state({ autoMergeConfirmed: true }),
    null,
  );
  assert.deepEqual(confirmed.safety, {
    headDrift: false,
    autoMergeUnconfirmed: false,
    baselineMissing: false,
  });
  const lost = evaluatePoll(feedback(), state({ armHead: null }), null);
  assert.deepEqual(lost.safety, {
    headDrift: false,
    autoMergeUnconfirmed: false,
    baselineMissing: true,
  });
  assert.match(lost.snapshot, /armed unknown/);
});

test("validateState names the first malformed field", async (t) => {
  const cases = {
    "not an object": [],
    armHead: state({ armHead: "abc" }),
    autoMergeConfirmed: state({ autoMergeConfirmed: "no" }),
    trackedItems: state({ trackedItems: [1] }),
    armCounts: state({ armCounts: { threads: -1, reviewSummaries: 0, conversationComments: 0 } }),
    resolvedBySkill: state({ resolvedBySkill: "T1" }),
    verdicts: state({ verdicts: [] }),
    "verdicts.T1": state({ verdicts: { T1: { key: "k", verdict: "fine" } } }),
  };
  for (const [field, value] of Object.entries(cases)) {
    await t.test(field, () => {
      assert.throws(
        () => validateState(value),
        (error) => error.exitCode === 2 && error.message.endsWith(field),
      );
    });
  }
  assert.equal(
    validateState(state({ armHead: null, armCounts: null, resolvedBySkill: null })).armHead,
    null,
  );
});

// ---------- summarizeArm ----------

test("arm prints only the viewer's PR-level bodies and the arm-time facts", () => {
  const summaryOut = summarizeArm(
    { url: PR_URL, isDraft: true, author: { login: "lee" } },
    feedback({
      threads: [
        thread("T1", [comment("C1", "me", { body: BODY_SENTINEL })], true),
        thread("T2", [comment("C2", "me")]),
      ],
      summaries: [
        summary("S1", "me", { body: "Please add a test." }),
        summary("S2", "me", { body: "  " }),
        summary("S3", "lee", { body: BODY_SENTINEL }),
        summary("S4", "me", { body: "draft", state: "PENDING" }),
      ],
      conversation: [
        comment("IC1", "me", { body: "Why a global?", createdAt: AFTER }),
        comment("IC2", "lee", { body: BODY_SENTINEL }),
      ],
      autoMerge: true,
    }),
  );
  assert.doesNotMatch(JSON.stringify(summaryOut), new RegExp(BODY_SENTINEL));
  assert.deepEqual(summaryOut.pr, {
    url: PR_URL,
    state: "OPEN",
    isDraft: true,
    author: "lee",
    head: ARM_HEAD,
    autoMerge: true,
  });
  assert.equal(summaryOut.refusal, null);
  assert.equal(summaryOut.pendingReview, true);
  assert.equal(summaryOut.viewerLatestReview, "COMMENTED");
  assert.deepEqual(summaryOut.threads, { tracked: 2, resolved: 1 });
  assert.deepEqual(
    summaryOut.prLevel.map((item) => [item.id, item.shape, item.at, item.body]),
    [
      ["S1", "reviewSummary", BEFORE, "Please add a test."],
      ["IC1", "conversationComment", AFTER, "Why a global?"],
    ],
  );
});

test("arm refuses a merged or closed PR and the viewer's own PR, printing no bodies", async (t) => {
  const cases = [
    ["merged", "lee", "MERGED"],
    ["closed", "lee", "CLOSED"],
    ["viewer-is-author", "me", "OPEN"],
  ];
  for (const [refusal, author, prState] of cases) {
    await t.test(refusal, () => {
      const out = summarizeArm(
        { url: PR_URL, isDraft: false, author: { login: author } },
        feedback({ state: prState, conversation: [comment("IC1", "me", { body: "x" })] }),
      );
      assert.equal(out.refusal, refusal);
      assert.deepEqual(out.prLevel, []);
    });
  }
});

// ---------- renderApproval ----------

function readyPoll({ threads = 2, summaries = 1, comments = 1, head = ARM_HEAD } = {}) {
  const items = Array.from({ length: threads }, (_, i) => ({ id: `T${i + 1}`, shape: "thread" }));
  return {
    pr: { url: PR_URL, state: "OPEN", head, autoMerge: false },
    viewer: "me",
    counts: {
      threads: { tracked: threads, resolved: threads },
      reviewSummaries: { tracked: summaries, engaged: summaries },
      conversationComments: { tracked: comments, engaged: comments },
    },
    items,
    approvalReady: true,
  };
}

const ARMED = { armCounts: { threads: 2, reviewSummaries: 1, conversationComments: 1 } };

test("the full approval body names every count, R, both SHAs, and the PR-level sentence", () => {
  const body = renderApproval(
    state({ ...ARMED, resolvedBySkill: ["T1", "T9"] }),
    readyPoll({ head: NEW_HEAD }),
  );
  assert.equal(
    body,
    "Approved automatically: all 2 review threads, 1 review summaries, and 1 conversation comments from @me are settled, and each settlement was re-reviewed against the diff and accepted. " +
      "1 of those threads were resolved by this review after the reply was checked against the branch; the rest the author resolved. " +
      "Review summaries and conversation comments carry no resolve state, so their settlement was judged from the change and the replies rather than read from a resolved flag. " +
      `Head commit at approval time: ${NEW_HEAD}. Armed at head commit: ${ARM_HEAD}.\n`,
  );
});

test("the approval body applies each rendering rule", async (t) => {
  await t.test("R zero drops its sentence and equal SHAs collapse", () => {
    const body = renderApproval(state(ARMED), readyPoll());
    assert.doesNotMatch(body, /resolved by this review/);
    assert.match(body, new RegExp(`Head commit at arm and approval time: ${ARM_HEAD}\\.\\n$`));
  });
  await t.test(
    "no PR-level items says the threads are resolved and drops the judged sentence",
    () => {
      const body = renderApproval(
        state({ armCounts: { threads: 2, reviewSummaries: 0, conversationComments: 0 } }),
        readyPoll({ summaries: 0, comments: 0 }),
      );
      assert.match(
        body,
        /^Approved automatically: all 2 review threads opened by @me are resolved, /,
      );
      assert.doesNotMatch(body, /carry no resolve state/);
    },
  );
  await t.test("a changed count names both", () => {
    const body = renderApproval(state(ARMED), readyPoll({ threads: 1 }));
    assert.match(
      body,
      /all 1 review threads \(2 at arm\), 1 review summaries, and 1 conversation comments/,
    );
  });
  await t.test("lost arm counts say so in place of the number", () => {
    const body = renderApproval(state({ armCounts: null }), readyPoll());
    assert.match(
      body,
      /all 2 review threads \(arm-time count lost\), 1 review summaries \(arm-time count lost\)/,
    );
  });
  await t.test("a lost resolve record says so", () => {
    const body = renderApproval(state({ ...ARMED, resolvedBySkill: null }), readyPoll());
    assert.match(body, /The record of which threads this review resolved was lost/);
  });
  await t.test("a lost arm head says the user confirmed without it", () => {
    const body = renderApproval(state({ ...ARMED, armHead: null }), readyPoll());
    assert.match(body, /The arm-time head commit was unrecoverable, and the reviewer confirmed/);
    assert.doesNotMatch(body, /Armed at head commit/);
  });
  await t.test("the body never names a skill, command, or agent", () => {
    assert.doesNotMatch(renderApproval(state(ARMED), readyPoll()), /skill|watching|agent|\//i);
  });
});

test("renderApproval refuses a poll that is not approval-ready or is malformed", () => {
  assert.throws(
    () => renderApproval(state(), { ...readyPoll(), approvalReady: false }),
    /not approval-ready/,
  );
  assert.throws(() => renderApproval(state(), { approvalReady: true }), /malformed poll/);
});

// ---------- CLIs with a fake gh ----------

const FAKE_GH_SOURCE = `
const { appendFileSync, existsSync, readFileSync, writeFileSync, writeSync } = require("node:fs");
const { join } = require("node:path");
const dir = process.env.FAKE_GH_STATE;
const args = process.argv.slice(2);
appendFileSync(join(dir, "calls.jsonl"), JSON.stringify(args) + "\\n");
const responses = JSON.parse(readFileSync(join(dir, "responses.json"), "utf8"));
let kind;
if (args[0] === "pr") kind = "prView";
else if (args.includes("graphql")) kind = "graphql";
else kind = "commit";
let response = responses[kind];
// An array answers its kind's calls in order, so an extra page read fails loudly.
if (Array.isArray(response)) {
  const counterPath = join(dir, "count-" + kind);
  const index = existsSync(counterPath) ? Number(readFileSync(counterPath, "utf8")) : 0;
  writeFileSync(counterPath, String(index + 1));
  response = response[index];
  if (response === undefined) { process.stderr.write("unexpected gh call " + kind + " #" + (index + 1) + "\\n"); process.exit(99); }
}
if (response === undefined) { process.stderr.write("unexpected gh call " + kind + "\\n"); process.exit(99); }
// Synchronous writes: process.exit drops async pipe writes still queued, and
// stdout pipes are async on macOS, so a large page would arrive truncated.
writeSync(1, response.stdout ?? "");
writeSync(2, response.stderr ?? "");
process.exit(response.exitCode ?? 0);
`;

function cli(t, script, args, responses = {}, files = {}) {
  const binDir = mkdtempSync(join(tmpdir(), "wrp-bin-"));
  const stateDir = mkdtempSync(join(tmpdir(), "wrp-state-"));
  t.after(() => {
    rmSync(binDir, { recursive: true, force: true });
    rmSync(stateDir, { recursive: true, force: true });
  });
  writeFileSync(join(binDir, "gh"), `#!${process.execPath}\n${FAKE_GH_SOURCE}`);
  chmodSync(join(binDir, "gh"), 0o755);
  writeFileSync(join(stateDir, "responses.json"), JSON.stringify(responses));
  const resolved = args.map((arg) => {
    if (!(arg in files)) return arg;
    const path = join(stateDir, arg);
    writeFileSync(path, typeof files[arg] === "string" ? files[arg] : JSON.stringify(files[arg]));
    return path;
  });
  const run = spawnSync(process.execPath, [join(SCRIPTS, script), ...resolved], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${binDir}${delimiter}${process.env.PATH}`,
      FAKE_GH_STATE: stateDir,
      GH_HOST: "wrong.example.invalid",
    },
  });
  const callsPath = join(stateDir, "calls.jsonl");
  const calls = existsSync(callsPath)
    ? readFileSync(callsPath, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
    : [];
  return { status: run.status, stdout: run.stdout, stderr: run.stderr, calls };
}

const emptyPage = (nodes = []) => ({ pageInfo: { hasNextPage: false, endCursor: null }, nodes });

// ---------- review builders (the GraphQL envelope verify-approval.mjs reads) ----------

const SUBMITTED_EARLIER = "2026-01-01T00:01:00Z";
const SUBMITTED_LATER = "2026-01-01T00:02:00Z";

const reviewNode = (login, reviewState, oid, submittedAt, reviewNumber) => ({
  author: { login },
  state: reviewState,
  url: `${PR_URL}#pullrequestreview-${reviewNumber}`,
  submittedAt,
  commit: { oid },
});

const reviewsEnvelope = (reviews) => ({
  stdout: JSON.stringify({ data: { repository: { pullRequest: { reviews } } } }),
});

const reviewsPage = (nodes, endCursor = null) =>
  reviewsEnvelope({ pageInfo: { hasNextPage: endCursor !== null, endCursor }, nodes });

const queryArg = (call) => call.find((arg) => arg.startsWith("query="));

function graphqlResponse({
  threads = [],
  summaries = [],
  conversation = [],
  head = ARM_HEAD,
} = {}) {
  return {
    stdout: JSON.stringify({
      data: {
        viewer: { login: "me" },
        repository: {
          pullRequest: {
            url: PR_URL,
            state: "OPEN",
            headRefOid: head,
            reviewDecision: null,
            autoMergeRequest: null,
            conversationComments: emptyPage(conversation),
            reviewSummaries: emptyPage(summaries),
            reviewThreads: emptyPage(
              threads.map((th) => ({ ...th, comments: emptyPage(th.comments) })),
            ),
          },
        },
      },
    }),
  };
}

const prView = (author = "lee") => ({
  stdout: JSON.stringify({ url: PR_URL, isDraft: false, author: { login: author } }),
});
const queryOf = (call) => call[call.indexOf("-f") + 1];

test("arm.mjs prints the arm JSON and exits 0, resolving a number through gh pr view", (t) => {
  const result = cli(t, "arm.mjs", ["7"], {
    prView: prView(),
    graphql: graphqlResponse({ conversation: [comment("IC1", "me", { body: "Why?" })] }),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls[0], ["pr", "view", "7", "--json", "url,isDraft,author"]);
  assert.deepEqual(result.calls[1].slice(0, 4), ["api", "graphql", "--hostname", HOST]);
  assert.match(queryOf(result.calls[1]), /\bbody\b/);
  const out = JSON.parse(result.stdout);
  assert.equal(out.refusal, null);
  assert.deepEqual(
    out.prLevel.map((i) => i.body),
    ["Why?"],
  );
});

test("arm.mjs exits 3 on a refusal and still prints the JSON", (t) => {
  const result = cli(t, "arm.mjs", [PR_URL], { prView: prView("me"), graphql: graphqlResponse() });
  assert.equal(result.status, 3);
  assert.equal(JSON.parse(result.stdout).refusal, "viewer-is-author");
  assert.equal(
    result.stderr,
    `arm.mjs: refused: viewer-is-author\nsee ${resolve(SCRIPTS, "../references/arm.md")}\n`,
  );
});

test("arm.mjs maps a bad argument, an unresolvable PR, and a failed read to their exits", async (t) => {
  await t.test("a malformed argument exits 2 before any gh call", (st) => {
    for (const args of [["abc"], ["https://github.com/o/r/issues/7"], ["7", "8"]]) {
      const result = cli(st, "arm.mjs", args);
      assert.equal(result.status, 2, args.join(" "));
      assert.deepEqual(result.calls, []);
    }
  });
  await t.test("an unresolvable PR exits 2", (st) => {
    const result = cli(st, "arm.mjs", ["7"], {
      prView: { stderr: "no pull requests found\n", exitCode: 1 },
    });
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
  });
  await t.test("a failed read exits 1 with empty stdout", (st) => {
    const result = cli(st, "arm.mjs", ["7"], {
      prView: prView(),
      graphql: { stderr: "HTTP 502\n", exitCode: 1 },
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
  });
});

test("poll.mjs reads no body, passes --hostname, and reads the head date only for PR-level items", async (t) => {
  await t.test("threads only: one bodiless read", (st) => {
    const result = cli(
      st,
      "poll.mjs",
      [PR_URL, "--state", "state.json"],
      { graphql: graphqlResponse({ threads: [thread("T1", [comment("C1", "me")])] }) },
      { "state.json": state() },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.calls.length, 1);
    assert.doesNotMatch(queryOf(result.calls[0]), /\bbody\b|diffHunk/);
    assert.deepEqual(JSON.parse(result.stdout).gate, ["T1"]);
  });
  await t.test("a tracked PR-level item adds the commit-date read", (st) => {
    const result = cli(
      st,
      "poll.mjs",
      [PR_URL, "--state", "state.json"],
      {
        graphql: graphqlResponse({ summaries: [summary("S1", "me")] }),
        commit: { stdout: `${AFTER}\n` },
      },
      { "state.json": state({ trackedItems: ["S1"] }) },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.calls[1], [
      "api",
      "--hostname",
      HOST,
      `repos/o/r/commits/${ARM_HEAD}`,
      "--jq",
      ".commit.committer.date",
    ]);
    assert.deepEqual(
      JSON.parse(result.stdout).triggers.map((tr) => tr.kind),
      ["engaged"],
    );
  });
});

test("poll.mjs exits 1 on a failed read and 2 on a usage fault", async (t) => {
  const prLevel = { "state.json": state({ trackedItems: ["S1"] }) };
  const withSummary = graphqlResponse({ summaries: [summary("S1", "me")] });
  const failures = {
    "a failed feedback read": [{ graphql: { stderr: "HTTP 502\n", exitCode: 1 } }, prLevel],
    "a failed commit read": [
      { graphql: withSummary, commit: { stderr: "HTTP 404\n", exitCode: 1 } },
      prLevel,
    ],
    "a commit with no date": [{ graphql: withSummary, commit: { stdout: "null\n" } }, prLevel],
  };
  for (const [name, [responses, files]] of Object.entries(failures)) {
    await t.test(name, (st) => {
      const result = cli(st, "poll.mjs", [PR_URL, "--state", "state.json"], responses, files);
      assert.equal(result.status, 1, result.stderr);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /^poll\.mjs: /m);
    });
  }
  const usage = {
    "no --state": [[PR_URL], {}],
    "a malformed URL": [
      ["https://x/o/r/issues/7", "--state", "state.json"],
      { "state.json": state() },
    ],
    "a missing state file": [[PR_URL, "--state", "/nonexistent/state.json"], {}],
    "a state file that is not JSON": [[PR_URL, "--state", "state.json"], { "state.json": "{" }],
    "a malformed state file": [[PR_URL, "--state", "state.json"], { "state.json": { armHead: 1 } }],
  };
  for (const [name, [args, files]] of Object.entries(usage)) {
    await t.test(name, (st) => {
      const result = cli(st, "poll.mjs", args, {}, files);
      assert.equal(result.status, 2, result.stderr);
      assert.deepEqual(result.calls, []);
    });
  }
});

test("render-approval.mjs prints the body, and exits 2 on a poll not ready", async (t) => {
  await t.test("ready", (st) => {
    const result = cli(
      st,
      "render-approval.mjs",
      ["state.json", "poll.json"],
      {},
      { "state.json": state(ARMED), "poll.json": readyPoll() },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^Approved automatically: /);
  });
  await t.test("not ready", (st) => {
    const result = cli(
      st,
      "render-approval.mjs",
      ["state.json", "poll.json"],
      {},
      { "state.json": state(ARMED), "poll.json": { ...readyPoll(), approvalReady: false } },
    );
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
  });
  await t.test("a missing file", (st) => {
    const result = cli(st, "render-approval.mjs", ["/nonexistent/a.json", "/nonexistent/b.json"]);
    assert.equal(result.status, 2);
  });
});

test("verify-approval.mjs exits 0 only for the viewer's latest submitted APPROVED review at the head", async (t) => {
  const approvedCases = [
    [
      "approved at the head",
      [
        reviewNode("lee", "COMMENTED", ARM_HEAD, SUBMITTED_EARLIER, 1),
        reviewNode("me", "APPROVED", ARM_HEAD, SUBMITTED_LATER, 2),
      ],
      `${PR_URL}#pullrequestreview-2`,
    ],
    [
      "a later-submitted approval that comes earlier in list order",
      [
        reviewNode("me", "APPROVED", ARM_HEAD, SUBMITTED_LATER, 1),
        reviewNode("me", "COMMENTED", ARM_HEAD, SUBMITTED_EARLIER, 2),
      ],
      `${PR_URL}#pullrequestreview-1`,
    ],
    [
      "a PENDING viewer draft after the approval",
      [
        reviewNode("me", "APPROVED", ARM_HEAD, SUBMITTED_EARLIER, 1),
        reviewNode("me", "PENDING", ARM_HEAD, null, 2),
      ],
      `${PR_URL}#pullrequestreview-1`,
    ],
  ];
  for (const [name, nodes, url] of approvedCases) {
    await t.test(name, (st) => {
      const result = cli(st, "verify-approval.mjs", [PR_URL, "me", ARM_HEAD], {
        graphql: reviewsPage(nodes),
      });
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), { state: "APPROVED", url, commit: ARM_HEAD });
      assert.equal(result.stderr, "");
    });
  }
  const notApproved = `verify-approval.mjs: not approved at ${ARM_HEAD}\nsee ${resolve(SCRIPTS, "../references/approve.md")}\n`;
  const notApprovedCases = [
    [
      "approved at another commit",
      [reviewNode("me", "APPROVED", NEW_HEAD, SUBMITTED_EARLIER, 1)],
      { state: "APPROVED", url: `${PR_URL}#pullrequestreview-1`, commit: NEW_HEAD },
    ],
    [
      "a later COMMENTED review",
      [
        reviewNode("me", "APPROVED", ARM_HEAD, SUBMITTED_EARLIER, 1),
        reviewNode("me", "COMMENTED", ARM_HEAD, SUBMITTED_LATER, 2),
      ],
      { state: "COMMENTED", url: `${PR_URL}#pullrequestreview-2`, commit: ARM_HEAD },
    ],
    [
      "a DISMISSED latest review",
      [
        reviewNode("lee", "APPROVED", ARM_HEAD, SUBMITTED_EARLIER, 1),
        reviewNode("me", "DISMISSED", ARM_HEAD, SUBMITTED_LATER, 2),
      ],
      { state: "DISMISSED", url: `${PR_URL}#pullrequestreview-2`, commit: ARM_HEAD },
    ],
    ["zero reviews", [], { state: null, url: null, commit: null }],
    [
      "no viewer review beside an author: null node",
      [
        {
          author: null,
          state: "APPROVED",
          url: `${PR_URL}#pullrequestreview-1`,
          submittedAt: SUBMITTED_EARLIER,
          commit: { oid: ARM_HEAD },
        },
        reviewNode("lee", "APPROVED", ARM_HEAD, SUBMITTED_LATER, 2),
      ],
      { state: null, url: null, commit: null },
    ],
  ];
  for (const [name, nodes, found] of notApprovedCases) {
    await t.test(name, (st) => {
      const result = cli(st, "verify-approval.mjs", [PR_URL, "me", ARM_HEAD], {
        graphql: reviewsPage(nodes),
      });
      assert.equal(result.status, 3, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), found);
      assert.equal(result.stderr, notApproved);
    });
  }
  await t.test("bad arguments exit 2 before any gh call", (st) => {
    for (const args of [
      [PR_URL, "me"],
      [PR_URL, "me", "abc"],
      [PR_URL, "bad login!", ARM_HEAD],
      ["x", "me", ARM_HEAD],
    ]) {
      const result = cli(st, "verify-approval.mjs", args);
      assert.equal(result.status, 2, args.join(" "));
      assert.deepEqual(result.calls, []);
    }
  });
});

test("verify-approval.mjs exits 1 with empty stdout when a field is missing or the read is incomplete", async (t) => {
  const docLine = `see ${resolve(SCRIPTS, "../references/approve.md")}\n`;
  const earlierApproval = reviewNode("me", "APPROVED", ARM_HEAD, SUBMITTED_EARLIER, 1);
  const cases = [
    [
      "APPROVED without url",
      {
        stdout: JSON.stringify({
          data: {
            repository: {
              pullRequest: {
                reviews: {
                  pageInfo: { hasNextPage: false, endCursor: null },
                  nodes: [
                    {
                      author: { login: "me" },
                      state: "APPROVED",
                      submittedAt: SUBMITTED_EARLIER,
                      commit: { oid: ARM_HEAD },
                    },
                  ],
                },
              },
            },
          },
        }),
      },
      1,
    ],
    [
      "APPROVED with commit: null",
      reviewsPage([
        { ...reviewNode("me", "APPROVED", ARM_HEAD, SUBMITTED_EARLIER, 1), commit: null },
      ]),
      1,
    ],
    [
      'APPROVED with commit.oid: "" as gh pr view prints it',
      reviewsPage([reviewNode("me", "APPROVED", "", SUBMITTED_EARLIER, 1)]),
      1,
    ],
    [
      "a viewer node whose state is not a string",
      reviewsPage([
        earlierApproval,
        { ...reviewNode("me", "COMMENTED", ARM_HEAD, SUBMITTED_LATER, 2), state: null },
      ]),
      1,
    ],
    [
      "a viewer node without submittedAt",
      reviewsPage([
        {
          author: { login: "me" },
          state: "APPROVED",
          url: `${PR_URL}#pullrequestreview-1`,
          commit: { oid: ARM_HEAD },
        },
      ]),
      1,
    ],
    ["no reviews", { stdout: JSON.stringify({ data: { repository: { pullRequest: {} } } }) }, 1],
    [
      "pullRequest: null",
      { stdout: JSON.stringify({ data: { repository: { pullRequest: null } } }) },
      1,
    ],
    [
      "an errors key beside an approval at the head",
      {
        stdout: JSON.stringify({
          errors: [{ message: "Field 'commit' doesn't exist on type 'PullRequestReview'" }],
          data: {
            repository: {
              pullRequest: {
                reviews: {
                  pageInfo: { hasNextPage: false, endCursor: null },
                  nodes: [earlierApproval],
                },
              },
            },
          },
        }),
      },
      1,
    ],
    ["non-JSON output", { stdout: "not json\n" }, 1],
    [
      "a page without a nodes array",
      reviewsEnvelope({ pageInfo: { hasNextPage: false, endCursor: null } }),
      1,
    ],
    [
      "a page without a boolean hasNextPage",
      reviewsEnvelope({
        pageInfo: { hasNextPage: null, endCursor: null },
        nodes: [earlierApproval],
      }),
      1,
    ],
    ["a non-object node", reviewsPage([earlierApproval, null]), 1],
    [
      "a node with no author key after a viewer approval at the head",
      reviewsPage([
        earlierApproval,
        {
          state: "COMMENTED",
          url: `${PR_URL}#pullrequestreview-2`,
          submittedAt: SUBMITTED_LATER,
          commit: { oid: ARM_HEAD },
        },
      ]),
      1,
    ],
    [
      'a node with author: "me" after a viewer approval at the head',
      reviewsPage([
        earlierApproval,
        { ...reviewNode("me", "COMMENTED", ARM_HEAD, SUBMITTED_LATER, 2), author: "me" },
      ]),
      1,
    ],
    [
      "a node with author: { login: null } after a viewer approval at the head",
      reviewsPage([
        earlierApproval,
        { ...reviewNode("me", "COMMENTED", ARM_HEAD, SUBMITTED_LATER, 2), author: { login: null } },
      ]),
      1,
    ],
    [
      "a failed page 2 after a viewer approval at the head",
      [reviewsPage([earlierApproval], "c1"), { stderr: "HTTP 502\n", exitCode: 1 }],
      2,
    ],
    [
      "hasNextPage: true without an endCursor",
      [
        reviewsEnvelope({
          pageInfo: { hasNextPage: true, endCursor: null },
          nodes: [reviewNode("lee", "COMMENTED", ARM_HEAD, SUBMITTED_EARLIER, 1)],
        }),
        reviewsPage([reviewNode("me", "APPROVED", ARM_HEAD, SUBMITTED_LATER, 2)]),
      ],
      1,
    ],
  ];
  for (const [name, graphql, callCount] of cases) {
    await t.test(name, (st) => {
      const result = cli(st, "verify-approval.mjs", [PR_URL, "me", ARM_HEAD], { graphql });
      assert.equal(result.status, 1, result.stderr);
      assert.equal(result.stdout, "");
      assert.ok(result.stderr.endsWith(docLine), result.stderr);
      assert.equal(result.calls.length, callCount, result.stderr);
      assert.deepEqual(result.calls.at(-1).slice(0, 2), ["api", "graphql"]);
    });
  }
  await t.test("a gh failure forwards gh's stderr first and the doc pointer last", (st) => {
    const result = cli(st, "verify-approval.mjs", [PR_URL, "me", ARM_HEAD], {
      graphql: { stderr: "HTTP 502\n", exitCode: 1 },
    });
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, "");
    assert.ok(result.stderr.startsWith("HTTP 502\n"), result.stderr);
    assert.ok(result.stderr.endsWith(docLine), result.stderr);
  });
});

const HUNDRED_NODES_ONE_PAGE = [
  ...Array.from({ length: 99 }, (_, index) =>
    reviewNode("lee", "COMMENTED", ARM_HEAD, SUBMITTED_EARLIER, index + 1),
  ),
  reviewNode("me", "APPROVED", ARM_HEAD, SUBMITTED_LATER, 100),
];
const TEN_PAGES_ENDING = [
  ...Array.from({ length: 9 }, (_, index) =>
    reviewsPage(
      [reviewNode("lee", "COMMENTED", ARM_HEAD, SUBMITTED_EARLIER, index + 1)],
      `c${index + 1}`,
    ),
  ),
  reviewsPage([reviewNode("me", "APPROVED", ARM_HEAD, SUBMITTED_LATER, 10)]),
];
const TEN_PAGES_CONTINUING = [
  reviewsPage([reviewNode("me", "APPROVED", ARM_HEAD, SUBMITTED_LATER, 1)], "c1"),
  ...Array.from({ length: 9 }, (_, index) =>
    reviewsPage(
      [reviewNode("lee", "COMMENTED", ARM_HEAD, SUBMITTED_EARLIER, index + 2)],
      `c${index + 2}`,
    ),
  ),
];

test("verify-approval.mjs reads every reviews page through gh api graphql --hostname with a body-free selection", async (t) => {
  await t.test("an approval on page 2 is read with the page-1 cursor", (st) => {
    const result = cli(st, "verify-approval.mjs", [PR_URL, "me", ARM_HEAD], {
      graphql: [
        reviewsPage([reviewNode("lee", "COMMENTED", ARM_HEAD, SUBMITTED_EARLIER, 1)], "c1"),
        reviewsPage([reviewNode("me", "APPROVED", ARM_HEAD, SUBMITTED_LATER, 2)]),
      ],
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.calls.length, 2);
    // cli() sets GH_HOST to another host, so only --hostname can reach HOST.
    assert.deepEqual(result.calls[0].slice(0, 4), ["api", "graphql", "--hostname", HOST]);
    assert.deepEqual(result.calls[1].slice(0, 4), ["api", "graphql", "--hostname", HOST]);
    assert.ok(result.calls[0].includes("owner=o"), result.calls[0].join(" "));
    assert.ok(result.calls[0].includes("repo=r"), result.calls[0].join(" "));
    assert.equal(result.calls[0][result.calls[0].indexOf("number=7") - 1], "-F");
    assert.equal(result.calls[0].filter((arg) => arg.startsWith("after=")).length, 0);
    assert.ok(result.calls[1].includes("after=c1"), result.calls[1].join(" "));
    assert.equal(queryArg(result.calls[1]), queryArg(result.calls[0]));
    const query = queryArg(result.calls[0]);
    assert.doesNotMatch(query, /\bbody\b/);
    assert.doesNotMatch(query, /\bmutation\b/);
    assert.match(query, /author\s*\{\s*login\s*\}/);
    assert.match(query, /\bstate\b/);
    assert.match(query, /\burl\b/);
    assert.match(query, /\bsubmittedAt\b/);
    assert.match(query, /commit\s*\{\s*oid\s*\}/);
    assert.match(query, /pageInfo\s*\{[^}]*\bhasNextPage\b/);
    assert.match(query, /pageInfo\s*\{[^}]*\bendCursor\b/);
  });
  const cases = [
    ["one page of exactly 100 nodes reads once", [reviewsPage(HUNDRED_NODES_ONE_PAGE)], 0, 1],
    [
      "a later non-approval on page 2",
      [
        reviewsPage([reviewNode("me", "APPROVED", ARM_HEAD, SUBMITTED_EARLIER, 1)], "c1"),
        reviewsPage([reviewNode("me", "COMMENTED", ARM_HEAD, SUBMITTED_LATER, 2)]),
      ],
      3,
      2,
    ],
    ["ten pages that end on the tenth", TEN_PAGES_ENDING, 0, 10],
    ["ten pages still continuing fail closed after ten calls", TEN_PAGES_CONTINUING, 1, 10],
  ];
  for (const [name, graphql, status, callCount] of cases) {
    await t.test(name, (st) => {
      const result = cli(st, "verify-approval.mjs", [PR_URL, "me", ARM_HEAD], { graphql });
      assert.equal(result.status, status, result.stderr);
      assert.equal(result.calls.length, callCount, result.stderr);
    });
  }
});

test("every CLI exits 127 when gh is not on PATH", async (t) => {
  const emptyDir = mkdtempSync(join(tmpdir(), "wrp-no-gh-"));
  t.after(() => rmSync(emptyDir, { recursive: true, force: true }));
  const stateFile = join(emptyDir, "state.json");
  writeFileSync(stateFile, JSON.stringify(state()));
  for (const [script, args] of [
    ["arm.mjs", [PR_URL]],
    ["poll.mjs", [PR_URL, "--state", stateFile]],
    ["verify-approval.mjs", [PR_URL, "me", ARM_HEAD]],
  ]) {
    await t.test(script, () => {
      const result = spawnSync(process.execPath, [join(SCRIPTS, script), ...args], {
        encoding: "utf8",
        env: { PATH: emptyDir },
      });
      assert.equal(result.status, 127, result.stderr);
      assert.equal(result.stdout, "");
    });
  }
});
