// Fails when a landing-prs script lands a PR it should stop on: preflight.sh passing a
// closed, fork, or wrong-branch PR, a push that misses the PR head, a remote head the branch
// lacks, or a dirty tree it would rebase, or miscounting BEHIND or MERGES; ci-gate.mjs
// returning merge before CI finishes, on a stale base, on a second UNSTABLE, or on an
// unnamed state, or waiting past its cap; merge.sh merging without the head guard or the
// "(#n)" subject, or calling a queued PR merged.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
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

const SKILL = resolve("skills/engineering/landing-prs/scripts");
const PREFLIGHT = join(SKILL, "preflight.sh");
const CI_GATE = join(SKILL, "ci-gate.mjs");
const MERGE = join(SKILL, "merge.sh");
const BASH = spawnSync("bash", ["-c", "command -v bash"], { encoding: "utf8" }).stdout.trim();
const URL = "https://github.example/acme/api/pull/42";
const OID = "5d7e9b1c3a2f4e6d8b0c1a3e5f7d9b2c4e6a8f0d";
const OTHER_OID = "1111111111111111111111111111111111111111";

function scratch(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "landing-prs-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// A fake `gh` that logs each call's argv as a JSON line and answers from `rules`:
// [substring of the space-joined args, [{out, err, code, sleepMs}, ...]]. The first rule
// whose substring matches answers; each call to a rule takes its next response, and the
// last response repeats. A call no rule matches exits 99.
function fakeGh(dir, rules) {
  const bin = join(dir, "bin");
  mkdirSync(bin, { recursive: true });
  const spec = join(dir, "gh-spec.json");
  writeFileSync(spec, JSON.stringify(rules));
  const log = join(dir, "gh.log");
  writeFileSync(log, "");
  const gh = join(bin, "gh");
  writeFileSync(
    gh,
    `#!${process.execPath}
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + "\\n");
const rules = JSON.parse(fs.readFileSync(${JSON.stringify(spec)}, "utf8"));
const joined = args.join(" ");
const index = rules.findIndex(([match]) => joined.includes(match));
if (index < 0) { process.stderr.write("fake gh: no rule for " + joined + "\\n"); process.exit(99); }
const countFile = ${JSON.stringify(join(dir, "gh-count-"))} + index;
const count = fs.existsSync(countFile) ? Number(fs.readFileSync(countFile, "utf8")) : 0;
fs.writeFileSync(countFile, String(count + 1));
const responses = rules[index][1];
const r = responses[Math.min(count, responses.length - 1)];
const finish = () => {
  process.stdout.write(r.out ?? "");
  process.stderr.write(r.err ?? "");
  process.exit(r.code ?? 0);
};
if (r.sleepMs) setTimeout(finish, r.sleepMs); else finish();
`,
  );
  chmodSync(gh, 0o755);
  return { bin, log };
}

function ghCalls(log) {
  return readFileSync(log, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function keyValues(stdout) {
  return Object.fromEntries(
    stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
  );
}

// ---- preflight.sh ----

const GIT_ENV = {
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.invalid",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.invalid",
};

function git(cwd, ...args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...GIT_ENV },
  });
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

function commit(cwd, file, text) {
  writeFileSync(join(cwd, file), text);
  git(cwd, "add", file);
  git(cwd, "commit", "-q", "-m", `edit ${file}`);
  return git(cwd, "rev-parse", "HEAD");
}

// A bare remote at <dir>/remotes/acme/api.git with `main`, and a clone at <dir>/work on
// `feature`, one commit ahead of main and pushed with its upstream set.
function repoPair(dir) {
  const remote = join(dir, "remotes", "acme", "api.git");
  mkdirSync(remote, { recursive: true });
  git(remote, "init", "-q", "--bare", "-b", "main");
  const seed = join(dir, "seed");
  git(dir, "clone", "-q", remote, seed);
  git(seed, "checkout", "-q", "-b", "main");
  commit(seed, "base.txt", "base\n");
  git(seed, "push", "-q", "origin", "main");
  const work = join(dir, "work");
  git(dir, "clone", "-q", remote, work);
  git(work, "checkout", "-q", "-b", "feature");
  const lease = commit(work, "feature.txt", "feature\n");
  git(work, "push", "-q", "-u", "origin", "feature");
  return { remote, seed, work, lease };
}

const PR_FIELDS = (fields = {}) => {
  const f = {
    number: 42,
    state: "OPEN",
    cross: "false",
    head: "feature",
    base: "main",
    url: URL,
    ...fields,
  };
  return `${[f.number, f.state, f.cross, f.head, f.base, f.url].join("\t")}\n`;
};

function preflight(t, { prView = { out: PR_FIELDS() }, squash = "true\n", args = [], setup } = {}) {
  const dir = scratch(t);
  const repos = repoPair(dir);
  setup?.(repos);
  const { bin, log } = fakeGh(dir, [
    ["pr view", [prView]],
    ["repo view", [{ out: squash }]],
  ]);
  const result = spawnSync(BASH, [PREFLIGHT, ...args], {
    cwd: repos.work,
    encoding: "utf8",
    env: { ...process.env, ...GIT_ENV, PATH: `${bin}:${process.env.PATH}` },
  });
  return { result, repos, calls: ghCalls(log) };
}

test("preflight.sh exits 2 on an argument that is not digits, or more than one", () => {
  for (const args of [["4x"], ["42", "43"], ["--repo"]]) {
    const result = spawnSync(BASH, [PREFLIGHT, ...args], { encoding: "utf8" });
    assert.equal(result.status, 2, args.join(" "));
    assert.match(result.stderr, /usage: preflight\.sh \[<n>\]/);
  }
});

test("preflight.sh exits 127 naming a missing gh", (t) => {
  const bin = join(scratch(t), "bin");
  mkdirSync(bin);
  const gitPath = spawnSync(BASH, ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim();
  symlinkSync(gitPath, join(bin, "git"));
  const result = spawnSync(BASH, [PREFLIGHT], { encoding: "utf8", env: { PATH: bin } });
  assert.equal(result.status, 127);
  assert.match(result.stderr, /missing required tool: gh/);
});

test("preflight.sh prints every key in order for a ready PR that is not behind", (t) => {
  const { result, repos, calls } = preflight(t, { args: ["42"] });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split("\n"), [
    "PR=42",
    `URL=${URL}`,
    "HOST=github.example",
    "OWNER=acme",
    "REPO=api",
    "HEAD_REF=feature",
    "BASE_REF=main",
    "REMOTE=origin",
    `LEASE=${repos.lease}`,
    "BEHIND=0",
    "MERGES=0",
  ]);
  assert.deepEqual(calls[0].slice(0, 3), ["pr", "view", "42"]);
  assert.deepEqual(calls[1].slice(0, 3), ["repo", "view", "github.example/acme/api"]);
});

test("preflight.sh exits 3 when there is no PR or it is merged or closed", (t) => {
  const none = preflight(t, { prView: { err: "no pull requests found\n", code: 1 } });
  assert.equal(none.result.status, 3);
  assert.match(none.result.stderr, /no pull requests found/);
  for (const state of ["MERGED", "CLOSED"]) {
    const { result } = preflight(t, { prView: { out: PR_FIELDS({ state }) } });
    assert.equal(result.status, 3, state);
    assert.match(result.stderr, new RegExp(`PR #42 is ${state}`));
  }
});

test("preflight.sh exits 4 for a fork PR or a branch that is not the PR head", (t) => {
  const fork = preflight(t, { prView: { out: PR_FIELDS({ cross: "true" }) } });
  assert.equal(fork.result.status, 4);
  assert.match(fork.result.stderr, /head lives in a fork/);
  const wrong = preflight(t, { prView: { out: PR_FIELDS({ head: "other" }) } });
  assert.equal(wrong.result.status, 4);
  assert.match(wrong.result.stderr, /not PR #42's head 'other'; run gh pr checkout 42/);
});

test("preflight.sh exits 5 when squash is disallowed or the base name is unsafe", (t) => {
  const squash = preflight(t, { squash: "false\n" });
  assert.equal(squash.result.status, 5);
  assert.match(squash.result.stderr, /disallows squash merging/);
  const base = preflight(t, { prView: { out: PR_FIELDS({ base: "main;rm" }) } });
  assert.equal(base.result.status, 5);
  assert.match(base.result.stderr, /base name 'main;rm'/);
});

test("preflight.sh exits 6 when a plain push would not update the PR head", (t) => {
  const elsewhere = preflight(t, {
    setup: ({ work, remote }) => {
      const other = remote.replace(/acme[/\\]api\.git$/, "acme/other.git");
      git(work, "remote", "set-url", "origin", other);
      git(work, "remote", "set-url", "--push", "origin", other);
    },
  });
  assert.equal(elsewhere.result.status, 6);
  assert.match(elsewhere.result.stderr, /remote origin \(.*other\.git\) is not acme\/api/);

  const noUpstream = preflight(t, {
    setup: ({ work }) => git(work, "branch", "--unset-upstream"),
  });
  assert.equal(noUpstream.result.status, 6);
  assert.match(noUpstream.result.stderr, /git push targets 'nothing'/);
});

test("preflight.sh exits 7 when the remote head has commits the branch lacks", (t) => {
  const { result } = preflight(t, {
    setup: ({ seed, work }) => {
      git(seed, "fetch", "-q", "origin", "feature");
      git(seed, "checkout", "-q", "-b", "feature", "FETCH_HEAD");
      commit(seed, "theirs.txt", "theirs\n");
      git(seed, "push", "-q", "origin", "feature");
      git(work, "fetch", "-q", "origin");
    },
  });
  assert.equal(result.status, 7);
  assert.match(result.stderr, /origin\/feature has commits this branch lacks/);
});

test("preflight.sh records the lease before the fetch and counts BEHIND and MERGES", (t) => {
  const { result, repos } = preflight(t, {
    setup: ({ seed, work }) => {
      commit(seed, "base.txt", "base 2\n");
      commit(seed, "base.txt", "base 3\n");
      git(seed, "push", "-q", "origin", "main");
      git(work, "checkout", "-q", "-b", "side", "HEAD~1");
      commit(work, "side.txt", "side\n");
      git(work, "checkout", "-q", "feature");
      git(work, "merge", "-q", "--no-ff", "-m", "merge side", "side");
    },
  });
  assert.equal(result.status, 0, result.stderr);
  const out = keyValues(result.stdout);
  assert.equal(out.LEASE, repos.lease);
  assert.equal(out.BEHIND, "2");
  assert.equal(out.MERGES, "1");
  assert.equal(
    git(repos.work, "rev-parse", "refs/remotes/origin/main"),
    git(repos.seed, "rev-parse", "main"),
  );
});

test("preflight.sh exits 8 only when the branch is behind and tracked files are dirty", (t) => {
  const behindDirty = preflight(t, {
    setup: ({ seed, work }) => {
      commit(seed, "base.txt", "base 2\n");
      git(seed, "push", "-q", "origin", "main");
      writeFileSync(join(work, "feature.txt"), "uncommitted\n");
    },
  });
  assert.equal(behindDirty.result.status, 8);
  assert.match(behindDirty.result.stderr, /1 behind main and the working tree has uncommitted/);

  const currentDirty = preflight(t, {
    setup: ({ work }) => writeFileSync(join(work, "feature.txt"), "uncommitted\n"),
  });
  assert.equal(currentDirty.result.status, 0, currentDirty.result.stderr);
});

// ---- ci-gate.mjs ----

const view = (status, extra = {}) => ({
  out: JSON.stringify({ mergeStateStatus: status, headRefOid: OID, baseRefName: "main", ...extra }),
});
const settled = (status, checks = 2) =>
  view(status, {
    statusCheckRollup: Array.from({ length: checks }, (_, i) => ({ name: `c${i}` })),
  });

function ciGate(t, rules, { args = [URL], env = {} } = {}) {
  const dir = scratch(t);
  const { bin, log } = fakeGh(dir, rules);
  const result = spawnSync(process.execPath, [CI_GATE, ...args], {
    encoding: "utf8",
    env: { PATH: bin, CI_GATE_POLL_SECONDS: "0", ...env },
  });
  const calls = ghCalls(log);
  const count = (match) => calls.filter((call) => call.join(" ").includes(match)).length;
  return { result, calls, count, out: keyValues(result.stdout) };
}

const SETTLE = "mergeStateStatus,statusCheckRollup";
const GATE = "mergeStateStatus,headRefOid,baseRefName";
const WATCH = "--watch";
const COMPARE = "compare/";

test("ci-gate.mjs exits 2 on a malformed URL or option before any gh call", (t) => {
  for (const args of [
    [],
    ["https://github.example/acme/api/issues/42"],
    [URL, "--cap-seconds"],
    [URL, "--cap-seconds", "soon"],
    [URL, "extra"],
  ]) {
    const { result, calls } = ciGate(t, [], { args });
    assert.equal(result.status, 2, args.join(" "));
    assert.match(result.stderr, /^ci-gate\.mjs: usage: ci-gate\.mjs /);
    assert.deepEqual(calls, []);
  }
});

test("ci-gate.mjs exits 127 naming a missing gh", (t) => {
  const result = spawnSync(process.execPath, [CI_GATE, URL], {
    encoding: "utf8",
    env: { PATH: scratch(t) },
  });
  assert.equal(result.status, 127);
  assert.match(result.stderr, /missing required tool: gh/);
  assert.equal(result.stdout, "VERDICT=error\n");
});

test("ci-gate.mjs settles, watches, and merges on CLEAN with the base not ahead", (t) => {
  const { result, calls, count, out } = ciGate(t, [
    [SETTLE, [view("UNKNOWN", { statusCheckRollup: [] }), settled("CLEAN")]],
    [WATCH, [{}]],
    [GATE, [view("CLEAN")]],
    [COMPARE, [{ out: "0\n" }]],
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `VERDICT=merge\nSTATUS=CLEAN\nHEAD=${OID}\nBEHIND_BY=0\n`);
  assert.equal(count(SETTLE), 2);
  assert.deepEqual(
    calls.find((call) => call.includes("--watch")),
    ["pr", "checks", URL, "--watch", "--fail-fast", "--interval", "30"],
  );
  assert.deepEqual(
    calls.find((call) => call[0] === "api"),
    [
      "api",
      "--hostname",
      "github.example",
      `repos/acme/api/compare/main...${OID}`,
      "--jq",
      ".behind_by",
    ],
  );
  assert.equal(out.HEAD, OID);
});

test("ci-gate.mjs skips the watch when no check attaches within the settle polls", (t) => {
  const { result, count } = ciGate(t, [
    [SETTLE, [view("CLEAN", { statusCheckRollup: [] })]],
    [GATE, [view("HAS_HOOKS")]],
    [COMPARE, [{ out: "0\n" }]],
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(count(SETTLE), 12);
  assert.equal(count(WATCH), 0);
});

test("ci-gate.mjs returns rebase on BEHIND, or on CLEAN with the base ahead", (t) => {
  const behind = ciGate(t, [
    [SETTLE, [settled("BEHIND")]],
    [WATCH, [{}]],
    [GATE, [view("BEHIND")]],
  ]);
  assert.equal(behind.result.status, 10);
  assert.equal(behind.out.VERDICT, "rebase");
  assert.equal(behind.count(COMPARE), 0);

  const stale = ciGate(t, [
    [SETTLE, [settled("CLEAN")]],
    [WATCH, [{}]],
    [GATE, [view("CLEAN")]],
    [COMPARE, [{ out: "3\n" }]],
  ]);
  assert.equal(stale.result.status, 10);
  assert.deepEqual(stale.out, { VERDICT: "rebase", STATUS: "CLEAN", HEAD: OID, BEHIND_BY: "3" });
});

test("ci-gate.mjs exits 1 naming each failing check when the watch fails", (t) => {
  const { result } = ciGate(t, [
    [SETTLE, [settled("UNSTABLE")]],
    [WATCH, [{ code: 1 }]],
    [
      "--json name,bucket",
      [
        {
          out: JSON.stringify([
            { name: "lint", bucket: "pass" },
            { name: "unit tests", bucket: "fail" },
          ]),
          code: 1,
        },
      ],
    ],
  ]);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "VERDICT=fail\nFAILED=unit tests\n");
});

test("ci-gate.mjs exits 124 when the watch outlasts the cap", (t) => {
  const started = Date.now();
  const { result } = ciGate(
    t,
    [
      [SETTLE, [settled("UNSTABLE")]],
      [WATCH, [{ sleepMs: 60_000 }]],
    ],
    { args: [URL, "--cap-seconds", "1"] },
  );
  assert.equal(result.status, 124);
  assert.equal(result.stdout, "VERDICT=timeout\n");
  assert.match(result.stderr, /CI wait timed out/);
  assert.ok(Date.now() - started < 30_000, "the cap killed the watch");
});

test("ci-gate.mjs watches once more on UNSTABLE and exits 11 on a second", (t) => {
  const twice = ciGate(t, [
    [SETTLE, [settled("UNSTABLE")]],
    [WATCH, [{}]],
    [GATE, [view("UNSTABLE")]],
  ]);
  assert.equal(twice.result.status, 11);
  assert.equal(twice.out.VERDICT, "unstable");
  assert.equal(twice.count(WATCH), 2);

  const recovered = ciGate(t, [
    [SETTLE, [settled("UNSTABLE")]],
    [WATCH, [{}]],
    [GATE, [view("UNSTABLE"), view("CLEAN")]],
    [COMPARE, [{ out: "0\n" }]],
  ]);
  assert.equal(recovered.result.status, 0, recovered.result.stderr);
});

test("ci-gate.mjs re-reads UNKNOWN once and stops on any unnamed state", (t) => {
  const unknown = ciGate(t, [
    [SETTLE, [settled("CLEAN")]],
    [WATCH, [{}]],
    [GATE, [view("UNKNOWN")]],
  ]);
  assert.equal(unknown.result.status, 3);
  assert.equal(unknown.out.STATUS, "UNKNOWN");
  assert.equal(unknown.count(GATE), 2);

  for (const status of ["BLOCKED", "DIRTY", "DRAFT"]) {
    const stop = ciGate(t, [
      [SETTLE, [settled(status)]],
      [WATCH, [{}]],
      [GATE, [view(status)]],
    ]);
    assert.equal(stop.result.status, 3, status);
    assert.equal(stop.result.stdout, `VERDICT=stop\nSTATUS=${status}\nHEAD=${OID}\n`);
  }
});

test("ci-gate.mjs exits 4 when a gh read fails or prints malformed JSON", (t) => {
  for (const response of [{ err: "HTTP 502\n", code: 1 }, { out: "not json" }]) {
    const { result } = ciGate(t, [[SETTLE, [response]]]);
    assert.equal(result.status, 4);
    assert.equal(result.stdout, "VERDICT=error\n");
  }
});

// ---- merge.sh ----

function merge(t, rules, args = [URL, OID]) {
  const dir = scratch(t);
  const { bin, log } = fakeGh(dir, rules);
  const result = spawnSync(BASH, [MERGE, ...args], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
  });
  return { result, calls: ghCalls(log) };
}

const STATE = "state,mergeCommit";

test("merge.sh exits 2 on a wrong argument count, URL, or oid before any gh call", (t) => {
  for (const args of [[URL], [URL, "abc123"], ["https://github.example/acme/api/issues/42", OID]]) {
    const { result, calls } = merge(t, [], args);
    assert.equal(result.status, 2, args.join(" "));
    assert.match(result.stderr, /usage: merge\.sh /);
    assert.deepEqual(calls, []);
  }
});

test("merge.sh exits 127 naming a missing gh", (t) => {
  const result = spawnSync(BASH, [MERGE, URL, OID], {
    encoding: "utf8",
    env: { PATH: scratch(t) },
  });
  assert.equal(result.status, 127);
  assert.match(result.stderr, /missing required tool: gh/);
});

test("merge.sh squash-merges with the head guard and a (#n) subject, then confirms", (t) => {
  const { result, calls } = merge(t, [
    [STATE, [{ out: "OPEN \n" }, { out: "MERGED c0ffee1\n" }]],
    ["--json title", [{ out: "Expire cache entries\n" }]],
    ["pr merge", [{}]],
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "MERGED=c0ffee1\n");
  assert.deepEqual(
    calls.find((call) => call[1] === "merge"),
    [
      "pr",
      "merge",
      URL,
      "--squash",
      "--match-head-commit",
      OID,
      "--subject",
      "Expire cache entries (#42)",
    ],
  );
});

test("merge.sh reports an already merged PR without a second merge call", (t) => {
  const { result, calls } = merge(t, [[STATE, [{ out: "MERGED c0ffee1\n" }]]]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "MERGED=c0ffee1\n");
  assert.equal(calls.filter((call) => call[1] === "merge").length, 0);
});

test("merge.sh exits 3 when the head moved and 4 when GitHub rejects the same head", (t) => {
  const rejected = (head) => [
    [STATE, [{ out: "OPEN \n" }]],
    ["--json title", [{ out: "T\n" }]],
    ["pr merge", [{ err: "GraphQL: merge refused\n", code: 1 }]],
    ["--json headRefOid", [{ out: `${head}\n` }]],
  ];
  const moved = merge(t, rejected(OTHER_OID));
  assert.equal(moved.result.status, 3);
  assert.match(moved.result.stderr, /head moved after the CI gate/);
  const refused = merge(t, rejected(OID));
  assert.equal(refused.result.status, 4);
  assert.match(refused.result.stderr, /merge refused/);
  assert.match(refused.result.stderr, /GitHub rejected the merge of PR #42/);
});

test("merge.sh exits 5 when the PR is not merged after the merge call", (t) => {
  const { result } = merge(t, [
    [STATE, [{ out: "OPEN \n" }]],
    ["--json title", [{ out: "T\n" }]],
    ["pr merge", [{}]],
  ]);
  assert.equal(result.status, 5);
  assert.match(result.stderr, /PR #42 is OPEN, not merged yet/);
  assert.equal(result.stdout, "");
});

test("merge.sh exits 1 when a gh read fails", (t) => {
  const { result } = merge(t, [[STATE, [{ err: "HTTP 502\n", code: 1 }]]]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /could not read PR #42/);
});
