// Fails when re-request-review.mjs re-requests review while feedback still awaits a response,
// misses a reviewer it should re-request, lets a body byte reach stdout, sends a write after a
// failed or incomplete read, or calls gh without --hostname.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptUrl = new URL(
  "../skills/engineering/addressing-pr-comments/scripts/re-request-review.mjs",
  import.meta.url,
);
const scriptPath = fileURLToPath(scriptUrl);

// A missing or broken script must fail each test through an assertion, not abort the file.
const scriptModule = await import(scriptUrl.href).catch((error) => ({ loadError: error }));

const PULL_REQUEST_412 = { host: "github.com", owner: "o", repo: "r", number: 412 };
const PR_URL = "https://github.com/o/r/pull/412";
const BODY_SENTINEL = "BODY-SENTINEL-q9z4";
const FIXED_SUBMITTED_AT = "2026-09-20T12:00:00Z";

function derive(reviewState, pullRequest) {
  assert.equal(
    typeof scriptModule.deriveReRequest,
    "function",
    `re-request-review.mjs must export deriveReRequest (load error: ${scriptModule.loadError?.message ?? "none"})`,
  );
  return scriptModule.deriveReRequest(reviewState, pullRequest);
}

function user(login) {
  return { __typename: "User", login };
}

function bot(login) {
  return { __typename: "Bot", login };
}

function review({ author, state, url, body, inlineCommentCount }) {
  return {
    author,
    state,
    url,
    body,
    submittedAt: FIXED_SUBMITTED_AT,
    comments: { totalCount: inlineCommentCount },
  };
}

function thread({ isResolved, firstCommentUrl, latestAuthor, latestBody }) {
  return {
    isResolved,
    firstComment: { nodes: [{ url: firstCommentUrl }] },
    latestComment: { nodes: [{ author: latestAuthor, body: latestBody }] },
  };
}

function conversationComment({ author, url, body, reactionGroups = [] }) {
  return { author, url, body, reactionGroups };
}

function requestedUser(login) {
  return { requestedReviewer: { __typename: "User", login } };
}

function reviewState(fields) {
  return {
    viewerLogin: "me",
    reviewDecision: null,
    latestOpinionatedReviews: [],
    reviewRequests: [],
    reviewThreads: [],
    reviews: [],
    comments: [],
    ...fields,
  };
}

// alice requested changes through inline threads, so her review body is empty but not a
// clarification stop.
const ALICE_CHANGES_REQUESTED_WITH_THREADS = review({
  author: user("alice"),
  state: "CHANGES_REQUESTED",
  url: `${PR_URL}#pullrequestreview-100`,
  body: "",
  inlineCommentCount: 1,
});

const CAROL_CHANGES_REQUESTED_WITH_THREADS = review({
  author: user("carol"),
  state: "CHANGES_REQUESTED",
  url: `${PR_URL}#pullrequestreview-300`,
  body: "",
  inlineCommentCount: 2,
});

const BOB_APPROVED = review({
  author: user("bob"),
  state: "APPROVED",
  url: `${PR_URL}#pullrequestreview-200`,
  body: "",
  inlineCommentCount: 0,
});

function unresolvedReviewerThread(discussionId) {
  return thread({
    isResolved: false,
    firstCommentUrl: `${PR_URL}#discussion_r${discussionId}`,
    latestAuthor: { login: "alice" },
    latestBody: BODY_SENTINEL,
  });
}

const FAKE_GH_SOURCE = `
const { appendFileSync, existsSync, readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const stateDir = process.env.FAKE_GH_STATE;
appendFileSync(join(stateDir, "calls.jsonl"), JSON.stringify(process.argv.slice(2)) + "\\n");
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

function runScript(t, { args, responses }) {
  const binDir = mkdtempSync(join(tmpdir(), "rr-fake-gh-bin-"));
  const stateDir = mkdtempSync(join(tmpdir(), "rr-fake-gh-state-"));
  t.after(() => {
    rmSync(binDir, { recursive: true, force: true });
    rmSync(stateDir, { recursive: true, force: true });
  });
  const fakeGhPath = join(binDir, "gh");
  writeFileSync(fakeGhPath, `#!${process.execPath}\n${FAKE_GH_SOURCE}`);
  chmodSync(fakeGhPath, 0o755);
  writeFileSync(join(stateDir, "responses.json"), JSON.stringify(responses));

  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${binDir}${delimiter}${process.env.PATH}`,
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

function connection(nodes, pageInfo = { hasNextPage: false, endCursor: null }) {
  return { nodes, pageInfo };
}

function pageOneResponse({
  viewerLogin = "me",
  reviewDecision = null,
  latestOpinionatedReviews = connection([]),
  reviewRequests = connection([]),
  reviewThreads = connection([]),
  reviews = connection([]),
  comments = connection([]),
}) {
  const data = {
    viewer: { login: viewerLogin },
    repository: {
      pullRequest: {
        reviewDecision,
        latestOpinionatedReviews,
        reviewRequests,
        reviewThreads,
        reviews,
        comments,
      },
    },
  };
  return { stdout: JSON.stringify({ data }), stderr: "", exitCode: 0 };
}

function followUpPageResponse(connectionName, connectionPage) {
  const data = { repository: { pullRequest: { [connectionName]: connectionPage } } };
  return { stdout: JSON.stringify({ data }), stderr: "", exitCode: 0 };
}

function resolvedThread(discussionId) {
  return thread({
    isResolved: true,
    firstCommentUrl: `${PR_URL}#discussion_r${discussionId}`,
    latestAuthor: { login: "me" },
    latestBody: BODY_SENTINEL,
  });
}

function postReviewerRequest(login) {
  return [
    "api",
    "--hostname",
    "github.com",
    "--method",
    "POST",
    "repos/o/r/pulls/412/requested_reviewers",
    "-f",
    `reviewers[]=${login}`,
  ];
}

const POST_SUCCEEDED = { stdout: JSON.stringify({ url: PR_URL }), stderr: "", exitCode: 0 };

test("derives targets and the review-decision gate", async (t) => {
  await t.test("a CHANGES_REQUESTED review makes its author the write target", () => {
    const result = derive(
      reviewState({
        reviewDecision: "CHANGES_REQUESTED",
        latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, ["alice"]);
    assert.deepEqual(result.lines, []);
  });

  await t.test("APPROVED and DISMISSED reviews are not targets", () => {
    const carolDismissed = review({
      author: user("carol"),
      state: "DISMISSED",
      url: `${PR_URL}#pullrequestreview-301`,
      body: "",
      inlineCommentCount: 0,
    });
    const result = derive(
      reviewState({
        latestOpinionatedReviews: [BOB_APPROVED, carolDismissed],
        reviews: [BOB_APPROVED, carolDismissed],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, []);
    assert.deepEqual(result.lines, ["not-requested no-changes-requested-reviewer"]);
  });

  await t.test(
    "a reviewer with a pending review request prints already-requested and gets no write",
    () => {
      const result = derive(
        reviewState({
          latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
          reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
          reviewRequests: [requestedUser("alice")],
        }),
        PULL_REQUEST_412,
      );
      assert.deepEqual(result.logins, []);
      assert.deepEqual(result.lines, [
        "already-requested alice",
        "not-requested no-changes-requested-reviewer",
      ]);
    },
  );

  await t.test("the viewer's own CHANGES_REQUESTED review is dropped with no line", () => {
    const viewerChangesRequested = review({
      author: user("me"),
      state: "CHANGES_REQUESTED",
      url: `${PR_URL}#pullrequestreview-900`,
      body: "",
      inlineCommentCount: 1,
    });
    const result = derive(
      reviewState({
        viewerLogin: "me",
        latestOpinionatedReviews: [viewerChangesRequested, ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviews: [viewerChangesRequested, ALICE_CHANGES_REQUESTED_WITH_THREADS],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, ["alice"]);
    assert.deepEqual(result.lines, []);
  });

  await t.test("a Bot author with a valid login prints skipped <login> not-a-user", () => {
    const botChangesRequested = review({
      author: bot("renovate"),
      state: "CHANGES_REQUESTED",
      url: `${PR_URL}#pullrequestreview-400`,
      body: "",
      inlineCommentCount: 1,
    });
    const result = derive(
      reviewState({
        latestOpinionatedReviews: [botChangesRequested],
        reviews: [botChangesRequested],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, []);
    assert.deepEqual(result.lines, [
      "skipped renovate not-a-user",
      "not-requested no-changes-requested-reviewer",
    ]);
  });

  await t.test("an x[bot] login prints skipped invalid-login without the login", () => {
    const bracketBotChangesRequested = review({
      author: bot("x[bot]"),
      state: "CHANGES_REQUESTED",
      url: `${PR_URL}#pullrequestreview-401`,
      body: "",
      inlineCommentCount: 1,
    });
    const result = derive(
      reviewState({
        latestOpinionatedReviews: [bracketBotChangesRequested],
        reviews: [bracketBotChangesRequested],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, []);
    assert.deepEqual(result.lines, [
      "skipped invalid-login",
      "not-requested no-changes-requested-reviewer",
    ]);
  });

  await t.test("a User login that fails the login pattern prints skipped invalid-login", () => {
    const leadingHyphenChangesRequested = review({
      author: user("-alice"),
      state: "CHANGES_REQUESTED",
      url: `${PR_URL}#pullrequestreview-402`,
      body: "",
      inlineCommentCount: 1,
    });
    const result = derive(
      reviewState({
        latestOpinionatedReviews: [leadingHyphenChangesRequested],
        reviews: [leadingHyphenChangesRequested],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, []);
    assert.deepEqual(result.lines, [
      "skipped invalid-login",
      "not-requested no-changes-requested-reviewer",
    ]);
  });

  await t.test("a null review author prints skipped author-unavailable", () => {
    const ghostChangesRequested = review({
      author: null,
      state: "CHANGES_REQUESTED",
      url: `${PR_URL}#pullrequestreview-403`,
      body: "",
      inlineCommentCount: 1,
    });
    const result = derive(
      reviewState({
        latestOpinionatedReviews: [ghostChangesRequested],
        reviews: [ghostChangesRequested],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, []);
    assert.deepEqual(result.lines, [
      "skipped author-unavailable",
      "not-requested no-changes-requested-reviewer",
    ]);
  });

  await t.test(
    "reviewDecision APPROVED makes no write even with a changes-requesting reviewer",
    () => {
      const result = derive(
        reviewState({
          reviewDecision: "APPROVED",
          latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
          reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        }),
        PULL_REQUEST_412,
      );
      assert.deepEqual(result.logins, []);
      assert.deepEqual(result.lines, ["not-requested review-decision APPROVED"]);
    },
  );

  await t.test("a null reviewDecision with a target still writes", () => {
    const result = derive(
      reviewState({
        reviewDecision: null,
        latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, ["alice"]);
  });

  await t.test("a PR with no reviews prints not-requested no-changes-requested-reviewer", () => {
    const result = derive(reviewState({}), PULL_REQUEST_412);
    assert.deepEqual(result.logins, []);
    assert.deepEqual(result.lines, ["not-requested no-changes-requested-reviewer"]);
  });

  await t.test("two targets are written in login order", () => {
    const result = derive(
      reviewState({
        latestOpinionatedReviews: [
          CAROL_CHANGES_REQUESTED_WITH_THREADS,
          ALICE_CHANGES_REQUESTED_WITH_THREADS,
        ],
        reviews: [CAROL_CHANGES_REQUESTED_WITH_THREADS, ALICE_CHANGES_REQUESTED_WITH_THREADS],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, ["alice", "carol"]);
  });
});

test("derives pending feedback without markers", async (t) => {
  await t.test("a resolved thread is not pending", () => {
    const result = derive(
      reviewState({
        latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviewThreads: [
          thread({
            isResolved: true,
            firstCommentUrl: `${PR_URL}#discussion_r1001`,
            latestAuthor: { login: "alice" },
            latestBody: BODY_SENTINEL,
          }),
        ],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, ["alice"]);
    assert.deepEqual(result.lines, []);
  });

  await t.test("an unresolved thread is pending and blocks the write", () => {
    const result = derive(
      reviewState({
        latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviewThreads: [
          thread({
            isResolved: false,
            firstCommentUrl: `${PR_URL}#discussion_r1001`,
            latestAuthor: { login: "alice" },
            latestBody: BODY_SENTINEL,
          }),
        ],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, []);
    assert.deepEqual(result.lines, [
      `pending ${PR_URL}#discussion_r1001`,
      "not-requested pending-feedback",
    ]);
  });

  await t.test("an unresolved thread whose latest author is null is pending", () => {
    const result = derive(
      reviewState({
        latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviewThreads: [
          thread({
            isResolved: false,
            firstCommentUrl: `${PR_URL}#discussion_r1001`,
            latestAuthor: null,
            latestBody: BODY_SENTINEL,
          }),
        ],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, []);
    assert.deepEqual(result.lines, [
      `pending ${PR_URL}#discussion_r1001`,
      "not-requested pending-feedback",
    ]);
  });

  await t.test("a human review summary is pending", () => {
    const daveSummary = review({
      author: user("dave"),
      state: "COMMENTED",
      url: `${PR_URL}#pullrequestreview-2001`,
      body: BODY_SENTINEL,
      inlineCommentCount: 0,
    });
    const result = derive(
      reviewState({
        latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS, daveSummary],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, []);
    assert.deepEqual(result.lines, [
      `pending ${PR_URL}#pullrequestreview-2001`,
      "not-requested pending-feedback",
    ]);
  });

  await t.test("a human conversation comment is pending", () => {
    const result = derive(
      reviewState({
        latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        comments: [
          conversationComment({
            author: user("dave"),
            url: `${PR_URL}#issuecomment-3001`,
            body: BODY_SENTINEL,
          }),
        ],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, []);
    assert.deepEqual(result.lines, [
      `pending ${PR_URL}#issuecomment-3001`,
      "not-requested pending-feedback",
    ]);
  });

  await t.test("a viewer reaction alone leaves a conversation comment pending", () => {
    const result = derive(
      reviewState({
        latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        comments: [
          conversationComment({
            author: user("dave"),
            url: `${PR_URL}#issuecomment-3001`,
            body: BODY_SENTINEL,
            reactionGroups: [{ content: "THUMBS_UP", viewerHasReacted: true }],
          }),
        ],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, []);
    assert.deepEqual(result.lines, [
      `pending ${PR_URL}#issuecomment-3001`,
      "not-requested pending-feedback",
    ]);
  });

  await t.test("a Bot conversation comment is ignored", () => {
    const result = derive(
      reviewState({
        latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        comments: [
          conversationComment({
            author: bot("graphite-app"),
            url: `${PR_URL}#issuecomment-3002`,
            body: BODY_SENTINEL,
          }),
        ],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, ["alice"]);
    assert.deepEqual(result.lines, []);
  });

  await t.test(
    "an empty CHANGES_REQUESTED review with no inline comments blocks every write",
    () => {
      const bobEmptyChangesRequested = review({
        author: user("bob"),
        state: "CHANGES_REQUESTED",
        url: `${PR_URL}#pullrequestreview-201`,
        body: "",
        inlineCommentCount: 0,
      });
      const result = derive(
        reviewState({
          latestOpinionatedReviews: [
            ALICE_CHANGES_REQUESTED_WITH_THREADS,
            bobEmptyChangesRequested,
          ],
          reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS, bobEmptyChangesRequested],
        }),
        PULL_REQUEST_412,
      );
      assert.deepEqual(result.logins, []);
      assert.deepEqual(result.lines, [
        "pending empty-changes-request bob",
        "not-requested pending-feedback",
      ]);
    },
  );

  await t.test(
    "an empty CHANGES_REQUESTED review clears once its reviewer is in reviewRequests",
    () => {
      const bobEmptyChangesRequested = review({
        author: user("bob"),
        state: "CHANGES_REQUESTED",
        url: `${PR_URL}#pullrequestreview-201`,
        body: "",
        inlineCommentCount: 0,
      });
      const result = derive(
        reviewState({
          latestOpinionatedReviews: [
            ALICE_CHANGES_REQUESTED_WITH_THREADS,
            bobEmptyChangesRequested,
          ],
          reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS, bobEmptyChangesRequested],
          reviewRequests: [requestedUser("bob")],
        }),
        PULL_REQUEST_412,
      );
      assert.deepEqual(result.logins, ["alice"]);
      assert.deepEqual(result.lines, ["already-requested bob"]);
    },
  );

  await t.test("eleven pending items print ten pending lines and pending-more 1", () => {
    const result = derive(
      reviewState({
        latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviewThreads: [
          unresolvedReviewerThread(1001),
          unresolvedReviewerThread(1002),
          unresolvedReviewerThread(1003),
          unresolvedReviewerThread(1004),
          unresolvedReviewerThread(1005),
          unresolvedReviewerThread(1006),
          unresolvedReviewerThread(1007),
          unresolvedReviewerThread(1008),
          unresolvedReviewerThread(1009),
          unresolvedReviewerThread(1010),
          unresolvedReviewerThread(1011),
        ],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, []);
    assert.deepEqual(result.lines, [
      `pending ${PR_URL}#discussion_r1001`,
      `pending ${PR_URL}#discussion_r1002`,
      `pending ${PR_URL}#discussion_r1003`,
      `pending ${PR_URL}#discussion_r1004`,
      `pending ${PR_URL}#discussion_r1005`,
      `pending ${PR_URL}#discussion_r1006`,
      `pending ${PR_URL}#discussion_r1007`,
      `pending ${PR_URL}#discussion_r1008`,
      `pending ${PR_URL}#discussion_r1009`,
      `pending ${PR_URL}#discussion_r1010`,
      "pending-more 1",
      "not-requested pending-feedback",
    ]);
  });

  await t.test("a pending item whose url names another PR prints pending url-unavailable", () => {
    const result = derive(
      reviewState({
        latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviewThreads: [
          thread({
            isResolved: false,
            firstCommentUrl: "https://github.com/o/r/pull/999#discussion_r1001",
            latestAuthor: { login: "alice" },
            latestBody: BODY_SENTINEL,
          }),
        ],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, []);
    assert.deepEqual(result.lines, ["pending url-unavailable", "not-requested pending-feedback"]);
  });
});

test("CLI writes only when nothing is pending", async (t) => {
  await t.test("a malformed PR URL exits 2 and runs no gh", (st) => {
    const run = runScript(st, { args: ["https://github.com/o/r/pull/412;echo"], responses: [] });
    assert.equal(run.status, 2);
    assert.deepEqual(run.calls, []);
  });

  await t.test("unparseable gh JSON prints review-state-read-failed and exits 1", (st) => {
    const run = runScript(st, {
      args: [PR_URL],
      responses: [{ stdout: "not json", stderr: "", exitCode: 0 }],
    });
    assert.deepEqual(run.lines, ["not-requested review-state-read-failed"]);
    assert.match(run.stderr, /^re-request-review\.mjs: gh printed output that is not JSON$/m);
    assert.equal(run.status, 1);
  });

  await t.test("a pending item sends no POST and exits 0", (st) => {
    const run = runScript(st, {
      args: [PR_URL],
      responses: [
        pageOneResponse({
          latestOpinionatedReviews: connection([ALICE_CHANGES_REQUESTED_WITH_THREADS]),
          reviews: connection([ALICE_CHANGES_REQUESTED_WITH_THREADS]),
          reviewThreads: connection([unresolvedReviewerThread(1001)]),
        }),
      ],
    });
    assert.deepEqual(run.lines, [
      `pending ${PR_URL}#discussion_r1001`,
      "not-requested pending-feedback",
    ]);
    assert.equal(run.status, 0);
    assert.equal(run.calls.length, 1, "only the review-state read may run");
  });

  await t.test(
    "a failed first POST prints failed <login> http-<status>, the second POST still runs, and exit is 1",
    (st) => {
      const run = runScript(st, {
        args: [PR_URL],
        responses: [
          pageOneResponse({
            latestOpinionatedReviews: connection([
              CAROL_CHANGES_REQUESTED_WITH_THREADS,
              ALICE_CHANGES_REQUESTED_WITH_THREADS,
            ]),
            reviews: connection([
              CAROL_CHANGES_REQUESTED_WITH_THREADS,
              ALICE_CHANGES_REQUESTED_WITH_THREADS,
            ]),
          }),
          { stdout: "", stderr: "gh: Validation Failed (HTTP 422)\n", exitCode: 1 },
          POST_SUCCEEDED,
        ],
      });
      assert.deepEqual(run.lines, ["failed alice http-422", "re-requested carol"]);
      assert.deepEqual(run.calls.slice(1), [
        postReviewerRequest("alice"),
        postReviewerRequest("carol"),
      ]);
      assert.equal(run.status, 1);
    },
  );

  await t.test("no stdout line carries a body byte", (st) => {
    const daveSummary = review({
      author: user("dave"),
      state: "COMMENTED",
      url: `${PR_URL}#pullrequestreview-2001`,
      body: BODY_SENTINEL,
      inlineCommentCount: 0,
    });
    const run = runScript(st, {
      args: [PR_URL],
      responses: [
        pageOneResponse({
          latestOpinionatedReviews: connection([ALICE_CHANGES_REQUESTED_WITH_THREADS]),
          reviews: connection([ALICE_CHANGES_REQUESTED_WITH_THREADS, daveSummary]),
          reviewThreads: connection([unresolvedReviewerThread(1001)]),
          comments: connection([
            conversationComment({
              author: user("dave"),
              url: `${PR_URL}#issuecomment-3001`,
              body: BODY_SENTINEL,
            }),
            conversationComment({
              author: user("me"),
              url: `${PR_URL}#issuecomment-3002`,
              body: BODY_SENTINEL,
            }),
          ]),
        }),
      ],
    });
    assert.deepEqual(run.lines, [
      `pending ${PR_URL}#discussion_r1001`,
      `pending ${PR_URL}#pullrequestreview-2001`,
      `pending ${PR_URL}#issuecomment-3001`,
      "not-requested pending-feedback",
    ]);
    assert.doesNotMatch(run.stdout, new RegExp(BODY_SENTINEL));
  });
});

test("a viewer marker clears only the item it names", async (t) => {
  await t.test("a viewer-last thread with a marker for that thread is clear", () => {
    const result = derive(
      reviewState({
        viewerLogin: "me",
        latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviewThreads: [
          thread({
            isResolved: false,
            firstCommentUrl: `${PR_URL}#discussion_r1001`,
            latestAuthor: { login: "me" },
            latestBody: `${BODY_SENTINEL}\n<!-- feedback-outcome: ${PR_URL}#discussion_r1001 -->`,
          }),
        ],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, ["alice"]);
    assert.deepEqual(result.lines, []);
  });

  await t.test("a viewer-last thread with no marker is pending", () => {
    const result = derive(
      reviewState({
        viewerLogin: "me",
        latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviewThreads: [
          thread({
            isResolved: false,
            firstCommentUrl: `${PR_URL}#discussion_r1001`,
            latestAuthor: { login: "me" },
            latestBody: BODY_SENTINEL,
          }),
        ],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, []);
    assert.deepEqual(result.lines, [
      `pending ${PR_URL}#discussion_r1001`,
      "not-requested pending-feedback",
    ]);
  });

  await t.test("a viewer-last thread with a marker for another item is pending", () => {
    const result = derive(
      reviewState({
        viewerLogin: "me",
        latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviewThreads: [
          thread({
            isResolved: false,
            firstCommentUrl: `${PR_URL}#discussion_r1001`,
            latestAuthor: { login: "me" },
            latestBody: `${BODY_SENTINEL}\n<!-- feedback-outcome: ${PR_URL}#discussion_r1002 -->`,
          }),
        ],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, []);
    assert.deepEqual(result.lines, [
      `pending ${PR_URL}#discussion_r1001`,
      "not-requested pending-feedback",
    ]);
  });

  await t.test("a viewer marker for issuecomment-123 leaves issuecomment-12 pending", () => {
    const result = derive(
      reviewState({
        viewerLogin: "me",
        latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        comments: [
          conversationComment({
            author: user("dave"),
            url: `${PR_URL}#issuecomment-12`,
            body: BODY_SENTINEL,
          }),
          conversationComment({
            author: user("me"),
            url: `${PR_URL}#issuecomment-900`,
            body: `${BODY_SENTINEL}\n<!-- feedback-outcome: ${PR_URL}#issuecomment-123 -->`,
          }),
        ],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, []);
    assert.deepEqual(result.lines, [
      `pending ${PR_URL}#issuecomment-12`,
      "not-requested pending-feedback",
    ]);
  });

  await t.test("one viewer comment with two marker lines clears both items", () => {
    const daveSummary = review({
      author: user("dave"),
      state: "COMMENTED",
      url: `${PR_URL}#pullrequestreview-2001`,
      body: BODY_SENTINEL,
      inlineCommentCount: 0,
    });
    const result = derive(
      reviewState({
        viewerLogin: "me",
        latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS, daveSummary],
        comments: [
          conversationComment({
            author: user("dave"),
            url: `${PR_URL}#issuecomment-12`,
            body: BODY_SENTINEL,
          }),
          conversationComment({
            author: user("me"),
            url: `${PR_URL}#issuecomment-900`,
            body: `${BODY_SENTINEL}\n<!-- feedback-outcome: ${PR_URL}#issuecomment-12 -->\n<!-- feedback-outcome: ${PR_URL}#pullrequestreview-2001 -->`,
          }),
        ],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result.logins, ["alice"]);
    assert.deepEqual(result.lines, []);
  });
});

test("a marker in a non-viewer comment clears nothing", () => {
  const result = derive(
    reviewState({
      viewerLogin: "me",
      latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
      reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
      comments: [
        conversationComment({
          author: user("dave"),
          url: `${PR_URL}#issuecomment-12`,
          body: BODY_SENTINEL,
        }),
        conversationComment({
          author: user("mallory"),
          url: `${PR_URL}#issuecomment-13`,
          body: `<!-- feedback-outcome: ${PR_URL}#issuecomment-12 -->`,
        }),
      ],
    }),
    PULL_REQUEST_412,
  );
  assert.deepEqual(result.logins, []);
  assert.deepEqual(result.lines, [
    `pending ${PR_URL}#issuecomment-12`,
    `pending ${PR_URL}#issuecomment-13`,
    "not-requested pending-feedback",
  ]);
});

test("CLI follows a second page by cursor", (t) => {
  const run = runScript(t, {
    args: [PR_URL],
    responses: [
      pageOneResponse({
        latestOpinionatedReviews: connection([BOB_APPROVED], {
          hasNextPage: true,
          endCursor: "opinionated-cursor-1",
        }),
        reviews: connection([BOB_APPROVED, ALICE_CHANGES_REQUESTED_WITH_THREADS]),
      }),
      followUpPageResponse(
        "latestOpinionatedReviews",
        connection([ALICE_CHANGES_REQUESTED_WITH_THREADS], {
          hasNextPage: false,
          endCursor: "opinionated-cursor-2",
        }),
      ),
      POST_SUCCEEDED,
    ],
  });
  assert.equal(
    run.calls[1]?.includes("after=opinionated-cursor-1"),
    true,
    "second gh call must carry after=<endCursor>",
  );
  assert.deepEqual(run.lines, ["re-requested alice"]);
  assert.deepEqual(run.calls[2], postReviewerRequest("alice"));
  assert.equal(run.status, 0);
});

test("CLI stops at the page cap and on a failed page", async (t) => {
  await t.test(
    "hasNextPage on page 10 prints review-state-incomplete after exactly 10 reads and sends no POST",
    (st) => {
      const run = runScript(st, {
        args: [PR_URL],
        responses: [
          pageOneResponse({
            latestOpinionatedReviews: connection([ALICE_CHANGES_REQUESTED_WITH_THREADS]),
            reviews: connection([ALICE_CHANGES_REQUESTED_WITH_THREADS]),
            reviewThreads: connection([resolvedThread(1001)], {
              hasNextPage: true,
              endCursor: "threads-cursor-1",
            }),
          }),
          followUpPageResponse(
            "reviewThreads",
            connection([resolvedThread(1002)], {
              hasNextPage: true,
              endCursor: "threads-cursor-2",
            }),
          ),
          followUpPageResponse(
            "reviewThreads",
            connection([resolvedThread(1003)], {
              hasNextPage: true,
              endCursor: "threads-cursor-3",
            }),
          ),
          followUpPageResponse(
            "reviewThreads",
            connection([resolvedThread(1004)], {
              hasNextPage: true,
              endCursor: "threads-cursor-4",
            }),
          ),
          followUpPageResponse(
            "reviewThreads",
            connection([resolvedThread(1005)], {
              hasNextPage: true,
              endCursor: "threads-cursor-5",
            }),
          ),
          followUpPageResponse(
            "reviewThreads",
            connection([resolvedThread(1006)], {
              hasNextPage: true,
              endCursor: "threads-cursor-6",
            }),
          ),
          followUpPageResponse(
            "reviewThreads",
            connection([resolvedThread(1007)], {
              hasNextPage: true,
              endCursor: "threads-cursor-7",
            }),
          ),
          followUpPageResponse(
            "reviewThreads",
            connection([resolvedThread(1008)], {
              hasNextPage: true,
              endCursor: "threads-cursor-8",
            }),
          ),
          followUpPageResponse(
            "reviewThreads",
            connection([resolvedThread(1009)], {
              hasNextPage: true,
              endCursor: "threads-cursor-9",
            }),
          ),
          followUpPageResponse(
            "reviewThreads",
            connection([resolvedThread(1010)], {
              hasNextPage: true,
              endCursor: "threads-cursor-10",
            }),
          ),
        ],
      });
      assert.deepEqual(run.lines, ["not-requested review-state-incomplete"]);
      assert.match(run.stderr, /^re-request-review\.mjs: reviewThreads has more than 10 pages$/m);
      assert.equal(run.calls.length, 10, "page 1 plus 9 follow-up pages, then stop");
      assert.equal(run.status, 1);
    },
  );

  await t.test("a failed second page prints review-state-read-failed and exits 1", (st) => {
    const run = runScript(st, {
      args: [PR_URL],
      responses: [
        pageOneResponse({
          latestOpinionatedReviews: connection([ALICE_CHANGES_REQUESTED_WITH_THREADS]),
          reviews: connection([ALICE_CHANGES_REQUESTED_WITH_THREADS]),
          reviewThreads: connection([resolvedThread(1001)], {
            hasNextPage: true,
            endCursor: "threads-cursor-1",
          }),
        }),
        { stdout: "", stderr: "gh: Bad Gateway (HTTP 502)\n", exitCode: 1 },
      ],
    });
    assert.deepEqual(run.lines, ["not-requested review-state-read-failed"]);
    assert.equal(run.calls.length, 2, "no POST after a failed page");
    assert.equal(run.status, 1);
  });
});

const ENTERPRISE_PR_URL = "https://ghe.example.com/o/r/pull/412";

function changesRequested({ author, reviewId, body = "", inlineCommentCount = 1, prUrl = PR_URL }) {
  return review({
    author,
    state: "CHANGES_REQUESTED",
    url: `${prUrl}#pullrequestreview-${reviewId}`,
    body,
    inlineCommentCount,
  });
}

function viewerLastThread({ discussionId, latestBody }) {
  return thread({
    isResolved: false,
    firstCommentUrl: `${PR_URL}#discussion_r${discussionId}`,
    latestAuthor: { login: "me" },
    latestBody,
  });
}

const ALICE_TARGET_PAGE = pageOneResponse({
  latestOpinionatedReviews: connection([ALICE_CHANGES_REQUESTED_WITH_THREADS]),
  reviews: connection([ALICE_CHANGES_REQUESTED_WITH_THREADS]),
});

test("CLI refuses a wrong argument count before any gh call", async (t) => {
  await t.test("no argument exits 2 with a usage line", (st) => {
    const run = runScript(st, { args: [], responses: [] });
    assert.equal(run.status, 2);
    assert.match(run.stderr, /^re-request-review\.mjs: usage: re-request-review\.mjs /);
    assert.deepEqual(run.calls, []);
    assert.deepEqual(run.lines, []);
  });

  await t.test("two arguments exit 2", (st) => {
    const run = runScript(st, { args: [PR_URL, PR_URL], responses: [] });
    assert.equal(run.status, 2);
    assert.deepEqual(run.calls, []);
    assert.deepEqual(run.lines, []);
  });
});

test("CLI prints not-requested gh-unavailable and exits 1 when gh is not on PATH", (t) => {
  const emptyDir = mkdtempSync(join(tmpdir(), "rr-no-gh-"));
  t.after(() => rmSync(emptyDir, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [scriptPath, PR_URL], {
    encoding: "utf8",
    env: { PATH: emptyDir },
  });
  assert.equal(result.stdout, "not-requested gh-unavailable\n");
  assert.match(result.stderr, /^re-request-review\.mjs: cannot run gh: /m);
  assert.equal(result.status, 1);
});

test("CLI treats a failed or erroring first read as review-state-read-failed", async (t) => {
  await t.test("a non-zero gh exit on the first read passes gh's stderr through", (st) => {
    const run = runScript(st, {
      args: [PR_URL],
      responses: [{ stdout: "", stderr: "gh: Bad credentials (HTTP 401)\n", exitCode: 1 }],
    });
    assert.deepEqual(run.lines, ["not-requested review-state-read-failed"]);
    assert.match(run.stderr, /^gh: Bad credentials \(HTTP 401\)$/m);
    assert.match(run.stderr, /^re-request-review\.mjs: gh api graphql exited 1$/m);
    assert.equal(run.calls.length, 1);
    assert.equal(run.status, 1);
  });

  await t.test("a GraphQL errors key with exit 0 names the error on stderr", (st) => {
    const page = JSON.parse(ALICE_TARGET_PAGE.stdout);
    const run = runScript(st, {
      args: [PR_URL],
      responses: [
        {
          stdout: JSON.stringify({
            ...page,
            errors: [{ type: "NOT_FOUND", message: "Could not resolve" }],
          }),
          stderr: "",
          exitCode: 0,
        },
      ],
    });
    assert.deepEqual(run.lines, ["not-requested review-state-read-failed"]);
    assert.match(run.stderr, /^re-request-review\.mjs: GraphQL errors: Could not resolve$/m);
    assert.equal(run.calls.length, 1, "no POST after an erroring read");
    assert.equal(run.status, 1);
  });

  await t.test("a response with no pull request", (st) => {
    const run = runScript(st, {
      args: [PR_URL],
      responses: [
        {
          stdout: JSON.stringify({
            data: { viewer: { login: "me" }, repository: { pullRequest: null } },
          }),
          stderr: "",
          exitCode: 0,
        },
      ],
    });
    assert.deepEqual(run.lines, ["not-requested review-state-read-failed"]);
    assert.match(run.stderr, /^re-request-review\.mjs: the response has no pull request$/m);
    assert.equal(run.status, 1);
  });
});

test("CLI prints gh-exit-<n> when a failed POST names no HTTP status", (t) => {
  const run = runScript(t, {
    args: [PR_URL],
    responses: [
      ALICE_TARGET_PAGE,
      { stdout: "", stderr: "error connecting to api.github.com\n", exitCode: 4 },
    ],
  });
  assert.deepEqual(run.lines, ["failed alice gh-exit-4"]);
  assert.equal(run.status, 1);
});

test("CLI passes --hostname for a non-github.com host", (t) => {
  const enterpriseAlice = changesRequested({
    author: user("alice"),
    reviewId: 100,
    prUrl: ENTERPRISE_PR_URL,
  });
  const run = runScript(t, {
    args: [ENTERPRISE_PR_URL],
    responses: [
      pageOneResponse({
        latestOpinionatedReviews: connection([enterpriseAlice]),
        reviews: connection([enterpriseAlice]),
      }),
      POST_SUCCEEDED,
    ],
  });
  assert.deepEqual(run.lines, ["re-requested alice"]);
  const [readCall, postCall] = run.calls;
  assert.equal(readCall[readCall.indexOf("--hostname") + 1], "ghe.example.com");
  assert.equal(readCall[readCall.indexOf("-F") + 1], "number=412");
  assert.deepEqual(postCall, [
    "api",
    "--hostname",
    "ghe.example.com",
    "--method",
    "POST",
    "repos/o/r/pulls/412/requested_reviewers",
    "-f",
    "reviewers[]=alice",
  ]);
  assert.equal(run.status, 0);
});

test("CLI passes --hostname github.com on the read and the POST, so GH_HOST cannot redirect them", (t) => {
  const run = runScript(t, { args: [PR_URL], responses: [ALICE_TARGET_PAGE, POST_SUCCEEDED] });
  assert.deepEqual(run.lines, ["re-requested alice"]);
  const [readCall, postCall] = run.calls;
  assert.deepEqual(readCall.slice(0, 4), ["api", "graphql", "--hostname", "github.com"]);
  assert.deepEqual(postCall, postReviewerRequest("alice"));
  assert.equal(run.status, 0);
});

test("an empty changes request from an author that cannot be re-requested does not block", async (t) => {
  await t.test("the viewer's own empty changes request", () => {
    const viewerEmpty = changesRequested({
      author: user("me"),
      reviewId: 900,
      inlineCommentCount: 0,
    });
    const result = derive(
      reviewState({
        latestOpinionatedReviews: [viewerEmpty, ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviews: [viewerEmpty, ALICE_CHANGES_REQUESTED_WITH_THREADS],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result, { lines: [], logins: ["alice"] });
  });

  await t.test("a Bot author's empty changes request", () => {
    const botEmpty = changesRequested({
      author: bot("renovate"),
      reviewId: 901,
      inlineCommentCount: 0,
    });
    const result = derive(
      reviewState({
        latestOpinionatedReviews: [botEmpty, ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviews: [botEmpty, ALICE_CHANGES_REQUESTED_WITH_THREADS],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result, { lines: ["skipped renovate not-a-user"], logins: ["alice"] });
  });
});

test("a non-empty changes-request body is pending until answered", () => {
  const aliceWithBody = changesRequested({
    author: user("alice"),
    reviewId: 100,
    body: BODY_SENTINEL,
    inlineCommentCount: 0,
  });
  const result = derive(
    reviewState({ latestOpinionatedReviews: [aliceWithBody], reviews: [aliceWithBody] }),
    PULL_REQUEST_412,
  );
  assert.deepEqual(result, {
    lines: [`pending ${PR_URL}#pullrequestreview-100`, "not-requested pending-feedback"],
    logins: [],
  });
});

test("more than ten pending urls list the empty changes requests after pending-more", () => {
  const bobEmpty = changesRequested({ author: user("bob"), reviewId: 200, inlineCommentCount: 0 });
  const result = derive(
    reviewState({
      latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS, bobEmpty],
      reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS, bobEmpty],
      reviewThreads: [
        unresolvedReviewerThread(2000),
        unresolvedReviewerThread(2001),
        unresolvedReviewerThread(2002),
        unresolvedReviewerThread(2003),
        unresolvedReviewerThread(2004),
        unresolvedReviewerThread(2005),
        unresolvedReviewerThread(2006),
        unresolvedReviewerThread(2007),
        unresolvedReviewerThread(2008),
        unresolvedReviewerThread(2009),
        unresolvedReviewerThread(2010),
      ],
    }),
    PULL_REQUEST_412,
  );
  assert.deepEqual(result.logins, []);
  assert.deepEqual(result.lines, [
    `pending ${PR_URL}#discussion_r2000`,
    `pending ${PR_URL}#discussion_r2001`,
    `pending ${PR_URL}#discussion_r2002`,
    `pending ${PR_URL}#discussion_r2003`,
    `pending ${PR_URL}#discussion_r2004`,
    `pending ${PR_URL}#discussion_r2005`,
    `pending ${PR_URL}#discussion_r2006`,
    `pending ${PR_URL}#discussion_r2007`,
    `pending ${PR_URL}#discussion_r2008`,
    `pending ${PR_URL}#discussion_r2009`,
    "pending-more 1",
    "pending empty-changes-request bob",
    "not-requested pending-feedback",
  ]);
});

test("an outcome marker counts only as a whole line", async (t) => {
  await t.test("a marker line ending in CRLF clears its thread", () => {
    const result = derive(
      reviewState({
        latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviewThreads: [
          viewerLastThread({
            discussionId: 1001,
            latestBody: `${BODY_SENTINEL}\r\n<!-- feedback-outcome: ${PR_URL}#discussion_r1001 -->\r\n`,
          }),
        ],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result, { lines: [], logins: ["alice"] });
  });

  await t.test("a marker inside a line of prose clears nothing", () => {
    const result = derive(
      reviewState({
        latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
        reviewThreads: [
          viewerLastThread({
            discussionId: 1001,
            latestBody: `Fixed. <!-- feedback-outcome: ${PR_URL}#discussion_r1001 -->`,
          }),
        ],
      }),
      PULL_REQUEST_412,
    );
    assert.deepEqual(result, {
      lines: [`pending ${PR_URL}#discussion_r1001`, "not-requested pending-feedback"],
      logins: [],
    });
  });
});

test("a marker in a viewer review body does not clear a PR-level item", () => {
  const viewerReview = review({
    author: user("me"),
    state: "COMMENTED",
    url: `${PR_URL}#pullrequestreview-300`,
    body: `<!-- feedback-outcome: ${PR_URL}#issuecomment-12 -->`,
    inlineCommentCount: 0,
  });
  const result = derive(
    reviewState({
      latestOpinionatedReviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS],
      reviews: [ALICE_CHANGES_REQUESTED_WITH_THREADS, viewerReview],
      comments: [
        conversationComment({
          author: user("dave"),
          url: `${PR_URL}#issuecomment-12`,
          body: BODY_SENTINEL,
        }),
      ],
    }),
    PULL_REQUEST_412,
  );
  assert.deepEqual(result, {
    lines: [`pending ${PR_URL}#issuecomment-12`, "not-requested pending-feedback"],
    logins: [],
  });
});

test("CLI fails the read on a malformed follow-up page", async (t) => {
  await t.test("hasNextPage with no endCursor fails before any follow-up read", (st) => {
    const run = runScript(st, {
      args: [PR_URL],
      responses: [
        pageOneResponse({
          latestOpinionatedReviews: connection([ALICE_CHANGES_REQUESTED_WITH_THREADS]),
          reviews: connection([ALICE_CHANGES_REQUESTED_WITH_THREADS], {
            hasNextPage: true,
            endCursor: null,
          }),
        }),
      ],
    });
    assert.deepEqual(run.lines, ["not-requested review-state-read-failed"]);
    assert.match(run.stderr, /^re-request-review\.mjs: page 1 of reviews is malformed$/m);
    assert.equal(run.calls.length, 1);
    assert.equal(run.status, 1);
  });

  await t.test("a follow-up page with a GraphQL errors key fails the read", (st) => {
    const run = runScript(st, {
      args: [PR_URL],
      responses: [
        pageOneResponse({
          latestOpinionatedReviews: connection([ALICE_CHANGES_REQUESTED_WITH_THREADS]),
          reviews: connection([ALICE_CHANGES_REQUESTED_WITH_THREADS], {
            hasNextPage: true,
            endCursor: "reviews-cursor-1",
          }),
        }),
        {
          stdout: JSON.stringify({ data: null, errors: [{ message: "timeout" }] }),
          stderr: "",
          exitCode: 0,
        },
      ],
    });
    assert.deepEqual(run.lines, ["not-requested review-state-read-failed"]);
    assert.match(run.stderr, /^re-request-review\.mjs: GraphQL errors: timeout$/m);
    assert.equal(run.calls.length, 2);
    assert.equal(run.status, 1);
  });
});

test("CLI merges follow-up nodes into the pending check", (t) => {
  const daveComment = conversationComment({
    author: user("dave"),
    url: `${PR_URL}#issuecomment-12`,
    body: BODY_SENTINEL,
  });
  const run = runScript(t, {
    args: [PR_URL],
    responses: [
      pageOneResponse({
        latestOpinionatedReviews: connection([ALICE_CHANGES_REQUESTED_WITH_THREADS]),
        reviews: connection([ALICE_CHANGES_REQUESTED_WITH_THREADS]),
        comments: connection([], { hasNextPage: true, endCursor: "comments-cursor-1" }),
      }),
      followUpPageResponse("comments", connection([daveComment])),
    ],
  });
  assert.deepEqual(run.lines, [
    `pending ${PR_URL}#issuecomment-12`,
    "not-requested pending-feedback",
  ]);
  assert.equal(run.calls.length, 2, "no POST while a follow-up page holds pending feedback");
  assert.equal(run.calls[1].includes("after=comments-cursor-1"), true);
  assert.equal(run.status, 0);
});

test("CLI passes --hostname on follow-up reads for a non-github.com host", (t) => {
  const enterpriseAlice = changesRequested({
    author: user("alice"),
    reviewId: 100,
    prUrl: ENTERPRISE_PR_URL,
  });
  const run = runScript(t, {
    args: [ENTERPRISE_PR_URL],
    responses: [
      pageOneResponse({
        latestOpinionatedReviews: connection([], {
          hasNextPage: true,
          endCursor: "opinionated-cursor-1",
        }),
        reviews: connection([enterpriseAlice]),
      }),
      followUpPageResponse("latestOpinionatedReviews", connection([enterpriseAlice])),
      POST_SUCCEEDED,
    ],
  });
  assert.deepEqual(run.lines, ["re-requested alice"]);
  assert.deepEqual(run.calls[1].slice(0, 4), ["api", "graphql", "--hostname", "ghe.example.com"]);
  assert.equal(run.calls[1].includes("after=opinionated-cursor-1"), true);
  assert.equal(run.status, 0);
});
