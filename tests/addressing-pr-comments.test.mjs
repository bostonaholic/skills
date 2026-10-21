// Fails when build-items.mjs keeps a resolved thread, a PENDING or empty review, or the viewer's
// review-record comment, drops an item it should keep, or accepts input the fetch never prints;
// or when settle-item.mjs writes twice on a rerun, writes after a usage fault, keeps going after
// a failed reply or resolve, reports success it did not verify, or calls gh without --hostname.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import test from "node:test";

const SCRIPTS = resolve("skills/engineering/addressing-pr-comments/scripts");
const BUILD_ITEMS = join(SCRIPTS, "build-items.mjs");
const SETTLE_ITEM = join(SCRIPTS, "settle-item.mjs");
const HOST = "ghe.example.invalid";
const PR_URL = `https://${HOST}/o/r/pull/7`;

const FAKE_GH_SOURCE = `
const { appendFileSync, existsSync, readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const stateDir = process.env.FAKE_GH_STATE;
const args = process.argv.slice(2);
const stdin = args.includes("--input") ? readFileSync(0, "utf8") : null;
appendFileSync(join(stateDir, "calls.jsonl"), JSON.stringify({ args, stdin }) + "\\n");
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

function scratch(t, prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function run(t, script, args, { responses = [], withGh = true } = {}) {
  const binDir = scratch(t, "apc-bin-");
  const stateDir = scratch(t, "apc-state-");
  if (withGh) {
    writeFileSync(join(binDir, "gh"), `#!${process.execPath}\n${FAKE_GH_SOURCE}`);
    chmodSync(join(binDir, "gh"), 0o755);
  }
  writeFileSync(join(stateDir, "responses.json"), JSON.stringify(responses));
  const result = spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: withGh ? `${binDir}${delimiter}${process.env.PATH}` : binDir,
      FAKE_GH_STATE: stateDir,
    },
  });
  const callsPath = join(stateDir, "calls.jsonl");
  const calls = existsSync(callsPath)
    ? readFileSync(callsPath, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : [];
  const lines = result.stdout === "" ? [] : result.stdout.replace(/\n$/, "").split("\n");
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, lines, calls };
}

function writeJson(t, value) {
  const path = join(scratch(t, "apc-file-"), "data.json");
  writeFileSync(path, typeof value === "string" ? value : JSON.stringify(value));
  return path;
}

const PR = {
  host: HOST,
  owner: "o",
  repo: "r",
  number: 7,
  url: PR_URL,
  state: "OPEN",
  headRefOid: "a".repeat(40),
  reviewDecision: null,
  autoMergeEnabled: false,
};

const threadComment = (n, login = "alice", extra = {}) => ({
  id: `PRRC_${n}`,
  databaseId: n,
  author: { login },
  body: `thread body ${n}`,
  diffHunk: `@@ hunk ${n}`,
  state: "SUBMITTED",
  createdAt: "2026-10-01T00:00:00Z",
  url: `${PR_URL}#discussion_r${n}`,
  reactionGroups: [],
  ...extra,
});

const thread = (
  id,
  { path = "a.js", line = 1, isResolved = false, isOutdated = false, comments },
) => ({
  id,
  isResolved,
  isOutdated,
  path,
  line,
  startLine: null,
  comments,
});

const review = (n, { login = "alice", state = "COMMENTED", body = `review body ${n}` } = {}) => ({
  id: `PRR_${n}`,
  databaseId: n,
  author: { login },
  body,
  state,
  submittedAt: "2026-10-01T00:00:00Z",
  url: `${PR_URL}#pullrequestreview-${n}`,
  reactionGroups: [],
});

const conversation = (n, { login = "alice", body = `comment body ${n}` } = {}) => ({
  id: `IC_${n}`,
  databaseId: n,
  author: { login },
  body,
  createdAt: "2026-10-01T00:00:00Z",
  url: `${PR_URL}#issuecomment-${n}`,
  reactionGroups: [],
});

const feedback = (fields = {}) => ({
  pr: PR,
  viewer: { login: "me" },
  conversationComments: [],
  reviewSummaries: [],
  reviewThreads: [],
  ...fields,
});

function buildItems(t, value, extraArgs = []) {
  return run(t, BUILD_ITEMS, [writeJson(t, value), ...extraArgs]);
}

test("build-items keeps open feedback and drops what is not an item", (t) => {
  const result = buildItems(
    t,
    feedback({
      reviewThreads: [
        thread("T_resolved", { isResolved: true, comments: [threadComment(1)] }),
        thread("T_b2", { path: "b.js", line: 2, comments: [threadComment(2)] }),
        thread("T_outdated", {
          path: "a.js",
          line: null,
          isOutdated: true,
          comments: [threadComment(3)],
        }),
        thread("T_a9", {
          path: "a.js",
          line: 9,
          comments: [threadComment(4), threadComment(5, "me")],
        }),
      ],
      reviewSummaries: [
        review(10, { state: "PENDING" }),
        review(11, { body: "" }),
        review(12, { body: null }),
        review(13, { state: "CHANGES_REQUESTED" }),
      ],
      conversationComments: [
        conversation(20, { login: "me", body: "<!-- reviewing-code:pr-comment v1 -->\nrecord" }),
        conversation(21, { login: "alice", body: "<!-- reviewing-code:pr-comment v1 -->\nquoted" }),
        conversation(22, { login: "me", body: "my own note" }),
        conversation(23, { login: "me", body: "<!-- reviewing-code:pr-comment-->\nno space" }),
      ],
    }),
  );
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.pr, PR);
  assert.deepEqual(output.viewer, { login: "me" });
  assert.equal(output.skippedReviewRecords, 1);
  assert.equal(output.excluded, 0);
  assert.deepEqual(
    output.items.map((item) => [item.kind, item.id]),
    [
      ["thread", "T_a9"],
      ["thread", "T_outdated"],
      ["thread", "T_b2"],
      ["review", "PRR_13"],
      ["conversation", "IC_21"],
      ["conversation", "IC_22"],
      ["conversation", "IC_23"],
    ],
  );
  const byId = Object.fromEntries(output.items.map((item) => [item.id, item]));
  assert.equal(byId.T_outdated.isOutdated, true);
  assert.equal(byId.T_a9.isOutdated, false);
  assert.equal(byId.IC_22.byViewer, true);
  assert.equal(byId.IC_21.byViewer, false);
  assert.equal(byId.PRR_13.state, "CHANGES_REQUESTED");
});

test("build-items carries a thread's reply and reaction ids and its whole conversation", (t) => {
  const result = buildItems(
    t,
    feedback({
      reviewThreads: [thread("T1", { comments: [threadComment(4), threadComment(5, "me")] })],
      conversationComments: [conversation(30)],
    }),
  );
  assert.equal(result.status, 0, result.stderr);
  const [threadItem, commentItem] = JSON.parse(result.stdout).items;
  assert.deepEqual(threadItem, {
    kind: "thread",
    id: "T1",
    url: `${PR_URL}#discussion_r4`,
    author: "alice",
    byViewer: false,
    path: "a.js",
    line: 1,
    startLine: null,
    isOutdated: false,
    state: null,
    replyTo: 4,
    reactionSubject: "PRRC_4",
    body: null,
    comments: [
      {
        author: "alice",
        body: "thread body 4",
        diffHunk: "@@ hunk 4",
        createdAt: "2026-10-01T00:00:00Z",
        url: `${PR_URL}#discussion_r4`,
      },
      {
        author: "me",
        body: "thread body 5",
        diffHunk: "@@ hunk 5",
        createdAt: "2026-10-01T00:00:00Z",
        url: `${PR_URL}#discussion_r5`,
      },
    ],
  });
  assert.deepEqual(commentItem, {
    kind: "conversation",
    id: "IC_30",
    url: `${PR_URL}#issuecomment-30`,
    author: "alice",
    byViewer: false,
    path: null,
    line: null,
    startLine: null,
    isOutdated: false,
    state: null,
    replyTo: null,
    reactionSubject: "IC_30",
    body: "comment body 30",
    comments: [],
  });
});

test("build-items --exclude-ids drops and counts the listed ids", (t) => {
  const idsPath = writeJson(t, "T1\n\n  IC_30  \nUNKNOWN\n");
  const result = buildItems(
    t,
    feedback({
      reviewThreads: [
        thread("T1", { comments: [threadComment(1)] }),
        thread("T2", { comments: [threadComment(2)] }),
      ],
      conversationComments: [conversation(30)],
    }),
    ["--exclude-ids", idsPath],
  );
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(
    output.items.map((item) => item.id),
    ["T2"],
  );
  assert.equal(output.excluded, 2);
});

test("build-items refuses input the fetch script never prints", async (t) => {
  const cases = [
    ["an empty file", "", /is empty; did fetch-pr-feedback\.mjs exit 0\?/],
    ["text that is not JSON", "{", /is not JSON/],
    ["no viewer", { ...feedback(), viewer: null }, /no viewer login/],
    ["a missing section", { ...feedback(), reviewThreads: undefined }, /no reviewThreads/],
    [
      "a --no-bodies fetch",
      feedback({ conversationComments: [{ ...conversation(1), body: undefined }] }),
      /no body field; fetch without --no-bodies/,
    ],
    [
      "a thread with no comments",
      feedback({ reviewThreads: [thread("T1", { comments: [] })] }),
      /thread T1 has no comments/,
    ],
  ];
  for (const [name, value, message] of cases) {
    await t.test(name, (st) => {
      const result = buildItems(st, value);
      assert.equal(result.status, 2);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, new RegExp(`^build-items\\.mjs: .*${message.source}`));
    });
  }
});

test("build-items refuses bad arguments", async (t) => {
  for (const [name, args] of [
    ["no arguments", []],
    ["an unknown flag", ["file.json", "--bogus"]],
    ["two files", ["a.json", "b.json"]],
    ["--exclude-ids with no file", ["a.json", "--exclude-ids"]],
  ]) {
    await t.test(name, (st) => {
      const result = run(st, BUILD_ITEMS, args);
      assert.equal(result.status, 2);
      assert.match(result.stderr, /^build-items\.mjs: usage: build-items\.mjs /);
    });
  }
  await t.test("a missing feedback file", (st) => {
    const result = run(st, BUILD_ITEMS, [join(scratch(st, "apc-missing-"), "none.json")]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /^build-items\.mjs: cannot read feedback file .*ENOENT/);
  });
});

// settle-item.mjs

const THREAD_ITEM = {
  kind: "thread",
  id: "T1",
  url: `${PR_URL}#discussion_r4`,
  author: "alice",
  byViewer: false,
  replyTo: 4,
  reactionSubject: "PRRC_4",
};
const REVIEW_ITEM = {
  kind: "review",
  id: "PRR_13",
  url: `${PR_URL}#pullrequestreview-13`,
  author: "alice",
  byViewer: false,
  replyTo: null,
  reactionSubject: "PRR_13",
};
const OWN_ITEM = { ...REVIEW_ITEM, id: "IC_22", kind: "conversation", author: "me" };
const MARKER = (url) => `<!-- feedback-outcome: ${url} -->`;
const THREAD_REPLY = `Fixed in abc1234.\n\n${MARKER(THREAD_ITEM.url)}`;

function settleFiles(t, reply = "Fixed in abc1234.\n") {
  const dir = scratch(t, "apc-settle-");
  const itemsPath = join(dir, "items.json");
  writeFileSync(
    itemsPath,
    JSON.stringify({
      pr: PR,
      viewer: { login: "me" },
      items: [THREAD_ITEM, REVIEW_ITEM, OWN_ITEM],
    }),
  );
  const replyPath = join(dir, "reply.md");
  writeFileSync(replyPath, reply);
  return { itemsPath, replyPath };
}

const ok = (data) => ({ stdout: JSON.stringify({ data }) });
const viewerComment = (body, url = `${PR_URL}#discussion_r99`) => ({
  author: { login: "me" },
  body,
  url,
});
const threadState = ({ isResolved = false, comments = [], reacted = [] } = {}) =>
  ok({
    viewer: { login: "me" },
    thread: { isResolved, comments: { nodes: comments } },
    subject: {
      reactionGroups: reacted.map((content) => ({ content, viewerHasReacted: true })),
    },
  });
const pullRequestState = ({ comments = [] } = {}) =>
  ok({
    viewer: { login: "me" },
    repository: { pullRequest: { comments: { nodes: comments } } },
    subject: { reactionGroups: [] },
  });
const posted = (url = `${PR_URL}#discussion_r99`) => ({
  stdout: JSON.stringify({ html_url: url }),
});
const RESOLVED = ok({ resolveReviewThread: { thread: { isResolved: true } } });
const REACTED = ok({ addReaction: { reaction: { content: "THUMBS_UP" } } });
const settleArgs = (files, id, ...flags) => [
  files.itemsPath,
  id,
  "--reply-file",
  files.replyPath,
  ...flags,
];

test("settle-item replies, resolves, reacts, and verifies a thread", (t) => {
  const files = settleFiles(t);
  const result = run(t, SETTLE_ITEM, settleArgs(files, "T1", "--resolve", "--react", "THUMBS_UP"), {
    responses: [
      threadState(),
      posted(),
      RESOLVED,
      REACTED,
      threadState({
        isResolved: true,
        comments: [viewerComment(THREAD_REPLY)],
        reacted: ["THUMBS_UP"],
      }),
    ],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.lines, [
    `replied ${PR_URL}#discussion_r99`,
    "resolved T1",
    "reacted THUMBS_UP",
    "verified",
  ]);
  const post = result.calls[1];
  assert.deepEqual(post.args.slice(0, 6), [
    "api",
    "--hostname",
    HOST,
    "--method",
    "POST",
    "repos/o/r/pulls/7/comments",
  ]);
  assert.deepEqual(JSON.parse(post.stdin), { body: THREAD_REPLY, in_reply_to: 4 });
  for (const call of result.calls)
    assert.ok(call.args.includes("--hostname") && call.args.includes(HOST));
});

test("settle-item rerun after success writes nothing", (t) => {
  const files = settleFiles(t);
  const done = threadState({
    isResolved: true,
    comments: [viewerComment(`${THREAD_REPLY}\r\n`)],
    reacted: ["THUMBS_UP"],
  });
  const result = run(t, SETTLE_ITEM, settleArgs(files, "T1", "--resolve", "--react", "THUMBS_UP"), {
    responses: [done, done],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.lines, [
    `already-replied ${PR_URL}#discussion_r99`,
    "already-resolved T1",
    "already-reacted THUMBS_UP",
    "verified",
  ]);
  assert.equal(result.calls.length, 2);
});

test("settle-item keeps a marker the reply already carries and posts a PR-level reply", (t) => {
  const reply = `Answered.\n${MARKER(REVIEW_ITEM.url)}\n`;
  const files = settleFiles(t, reply);
  const body = `Answered.\n${MARKER(REVIEW_ITEM.url)}`;
  const result = run(t, SETTLE_ITEM, settleArgs(files, "PRR_13", "--react", "none"), {
    responses: [
      pullRequestState(),
      posted(`${PR_URL}#issuecomment-99`),
      pullRequestState({ comments: [viewerComment(body, `${PR_URL}#issuecomment-99`)] }),
    ],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.lines, [`replied ${PR_URL}#issuecomment-99`, "verified"]);
  assert.equal(result.calls[1].args[5], "repos/o/r/issues/7/comments");
  assert.deepEqual(JSON.parse(result.calls[1].stdin), { body });
  assert.ok(result.calls[0].args.includes("number=7"));
});

test("settle-item --no-marker posts the reply as written", (t) => {
  const files = settleFiles(t, "Which cache do you mean?");
  const result = run(t, SETTLE_ITEM, settleArgs(files, "T1", "--no-marker", "--react", "none"), {
    responses: [
      threadState(),
      posted(),
      threadState({ comments: [viewerComment("Which cache do you mean?")] }),
    ],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.calls[1].stdin).body, "Which cache do you mean?");
});

test("settle-item refuses a usage fault before any write", async (t) => {
  const cases = [
    ["no --react", (f) => settleArgs(f, "T1"), /usage: settle-item\.mjs /],
    [
      "an unknown reaction",
      (f) => settleArgs(f, "T1", "--react", "HEART"),
      /unknown reaction: HEART/,
    ],
    ["an unknown flag", (f) => settleArgs(f, "T1", "--react", "none", "--bogus"), /usage: /],
    ["an unknown id", (f) => settleArgs(f, "NOPE", "--react", "none"), /no item NOPE in /],
    [
      "--resolve on a PR-level item",
      (f) => settleArgs(f, "PRR_13", "--resolve", "--react", "none"),
      /--resolve needs a thread; PRR_13 is a review/,
    ],
    [
      "--no-marker with --resolve",
      (f) => settleArgs(f, "T1", "--no-marker", "--resolve", "--react", "none"),
      /--no-marker takes no --resolve/,
    ],
    [
      "--no-marker with a reaction",
      (f) => settleArgs(f, "T1", "--no-marker", "--react", "THUMBS_UP"),
      /--no-marker takes no --resolve/,
    ],
  ];
  for (const [name, args, message] of cases) {
    await t.test(name, (st) => {
      const result = run(st, SETTLE_ITEM, args(settleFiles(st)));
      assert.equal(result.status, 2);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, new RegExp(`^settle-item\\.mjs: .*${message.source}`));
      assert.deepEqual(result.calls, []);
    });
  }
  await t.test("an empty reply file", (st) => {
    const result = run(
      st,
      SETTLE_ITEM,
      settleArgs(settleFiles(st, " \n"), "T1", "--react", "none"),
    );
    assert.equal(result.status, 2);
    assert.match(result.stderr, /reply\.md is empty/);
    assert.deepEqual(result.calls, []);
  });
  await t.test("an items file that is not build-items output", (st) => {
    const files = settleFiles(st);
    writeFileSync(files.itemsPath, JSON.stringify({ items: [] }));
    const result = run(st, SETTLE_ITEM, settleArgs(files, "T1", "--react", "none"));
    assert.equal(result.status, 2);
    assert.match(result.stderr, /is not build-items\.mjs output/);
  });
  await t.test("a reaction on the viewer's own comment", (st) => {
    const result = run(
      st,
      SETTLE_ITEM,
      settleArgs(settleFiles(st), "IC_22", "--react", "THUMBS_UP"),
      {
        responses: [pullRequestState()],
      },
    );
    assert.equal(result.status, 2);
    assert.match(result.stderr, /IC_22 is the viewer's own comment; pass --react none/);
    assert.equal(result.calls.length, 1);
  });
});

test("settle-item stops at a failed reply", (t) => {
  const result = run(
    t,
    SETTLE_ITEM,
    settleArgs(settleFiles(t), "T1", "--resolve", "--react", "THUMBS_UP"),
    {
      responses: [threadState(), { stderr: "gh: Not Found (HTTP 404)\n", exitCode: 1 }],
    },
  );
  assert.equal(result.status, 1);
  assert.deepEqual(result.lines, ["reply-failed"]);
  assert.match(result.stderr, /^settle-item\.mjs: reply failed: gh exited 1$/m);
  assert.equal(result.calls.length, 2);
});

test("settle-item treats a reply response with no html_url as a failed reply", (t) => {
  const result = run(t, SETTLE_ITEM, settleArgs(settleFiles(t), "T1", "--react", "none"), {
    responses: [threadState(), { stdout: "{}" }],
  });
  assert.equal(result.status, 1);
  assert.deepEqual(result.lines, ["reply-failed"]);
});

test("settle-item stops at a failed resolve and places no reaction", (t) => {
  const result = run(
    t,
    SETTLE_ITEM,
    settleArgs(settleFiles(t), "T1", "--resolve", "--react", "THUMBS_UP"),
    {
      responses: [
        threadState(),
        posted(),
        { stdout: JSON.stringify({ errors: [{ message: "denied" }] }) },
      ],
    },
  );
  assert.equal(result.status, 1);
  assert.deepEqual(result.lines, [`replied ${PR_URL}#discussion_r99`, "resolve-failed"]);
  assert.match(result.stderr, /resolve failed: GraphQL errors: denied/);
  assert.equal(result.calls.length, 3);
});

test("settle-item verifies after a failed reaction", (t) => {
  const result = run(t, SETTLE_ITEM, settleArgs(settleFiles(t), "T1", "--react", "THUMBS_UP"), {
    responses: [
      threadState(),
      posted(),
      { stderr: "boom\n", exitCode: 1 },
      threadState({ comments: [viewerComment(THREAD_REPLY)] }),
    ],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.lines, [
    `replied ${PR_URL}#discussion_r99`,
    "reaction-failed THUMBS_UP",
    "verified",
  ]);
  assert.match(result.stderr, /reaction failed: gh exited 1/);
});

test("settle-item fails verification it cannot confirm", async (t) => {
  await t.test("the reply is missing on the re-read", (st) => {
    const result = run(st, SETTLE_ITEM, settleArgs(settleFiles(st), "T1", "--react", "none"), {
      responses: [threadState(), posted(), threadState({ comments: [viewerComment("other")] })],
    });
    assert.equal(result.status, 1);
    assert.deepEqual(result.lines, [
      `replied ${PR_URL}#discussion_r99`,
      "not-verified reply-missing",
    ]);
  });
  await t.test("a matching reply by another author does not count", (st) => {
    const result = run(st, SETTLE_ITEM, settleArgs(settleFiles(st), "T1", "--react", "none"), {
      responses: [
        threadState({ comments: [{ ...viewerComment(THREAD_REPLY), author: { login: "alice" } }] }),
        posted(),
        threadState({ comments: [{ ...viewerComment(THREAD_REPLY), author: { login: "alice" } }] }),
      ],
    });
    assert.equal(result.status, 1);
    assert.deepEqual(result.lines, [
      `replied ${PR_URL}#discussion_r99`,
      "not-verified reply-missing",
    ]);
  });
  await t.test("the thread is still unresolved", (st) => {
    const result = run(
      st,
      SETTLE_ITEM,
      settleArgs(settleFiles(st), "T1", "--resolve", "--react", "none"),
      {
        responses: [
          threadState(),
          posted(),
          RESOLVED,
          threadState({ comments: [viewerComment(THREAD_REPLY)] }),
        ],
      },
    );
    assert.equal(result.status, 1);
    assert.deepEqual(result.lines.at(-1), "not-verified thread-unresolved");
  });
});

test("settle-item fails a read without writing", async (t) => {
  await t.test("a GraphQL error on the first read", (st) => {
    const result = run(st, SETTLE_ITEM, settleArgs(settleFiles(st), "T1", "--react", "none"), {
      responses: [{ stdout: JSON.stringify({ errors: [{ message: "Could not resolve" }] }) }],
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(
      result.stderr,
      /^settle-item\.mjs: read failed: GraphQL errors: Could not resolve$/m,
    );
  });
  await t.test("a response missing the thread", (st) => {
    const result = run(st, SETTLE_ITEM, settleArgs(settleFiles(st), "T1", "--react", "none"), {
      responses: [ok({ viewer: { login: "me" }, thread: null, subject: null })],
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /read failed: the response is missing the item/);
  });
  await t.test("gh is not on PATH", (st) => {
    const result = run(st, SETTLE_ITEM, settleArgs(settleFiles(st), "T1", "--react", "none"), {
      withGh: false,
    });
    assert.equal(result.status, 127);
    assert.match(result.stderr, /^settle-item\.mjs: gh is not on PATH$/m);
  });
});
