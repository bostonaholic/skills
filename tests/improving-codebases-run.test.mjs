// Acceptance tests for the improving-codebases scripts that read the lane registry and run
// commands: list-lanes.mjs, run-tlc.mjs, run-bounded.mjs, and the make-step chain that joins
// checkpoint.mjs, run-bounded.mjs, run-tlc.mjs, and render-report.mjs. Stub tlc and java
// executables stand in for TLC. The TLC fixtures below are real TLC2 2.19 output, with the
// machine-specific "Parsing file" line dropped. Fixture commits use a /dev/null global config.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPTS = fileURLToPath(
  new URL("../skills/engineering/improving-codebases/scripts/", import.meta.url),
);

const GIT_ENV = {
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.invalid",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.invalid",
};

// ---- helpers ----

function script(name) {
  const path = join(SCRIPTS, name);
  assert.ok(existsSync(path), `missing ${path}`);
  return path;
}

function tempDir(t, prefix) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function write(root, path, text) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  return path;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function git(cwd, ...args) {
  const run = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...GIT_ENV },
  });
  assert.equal(run.status, 0, `git ${args.join(" ")}: ${run.stderr}`);
  return run.stdout.trim();
}

function fixtureRepo(t, files) {
  const root = tempDir(t, "improving-codebases-repo-");
  for (const [path, text] of Object.entries(files)) write(root, path, text);
  git(root, "init", "-q", "-b", "main");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "fixture");
  return root;
}

function node(path, args, env = process.env) {
  const run = spawnSync(process.execPath, [path, ...args], {
    encoding: "utf8",
    env,
    timeout: 60_000,
  });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

// Calls an exported run function in a child process, so a test can pass a small bound and its
// own environment. The child exits when the function settles.
function callExport(scriptPath, exportName, args, env) {
  const code = `const mod = await import(process.argv[1]);
await mod[process.argv[2]](...JSON.parse(process.argv[3]));`;
  const run = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      code,
      pathToFileURL(scriptPath).href,
      exportName,
      JSON.stringify(args),
    ],
    { encoding: "utf8", env, timeout: 20_000 },
  );
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

function stub(bin, name, body) {
  const path = join(bin, name);
  writeFileSync(path, `#!/bin/sh\n${body}`);
  chmodSync(path, 0o755);
  return path;
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

// Waits for a process to exit, polling its pid, and gives up after `limitMs`.
async function gone(pid, limitMs = 5_000) {
  const deadline = Date.now() + limitMs;
  while (alive(pid) && Date.now() < deadline) {
    await new Promise((settle) => setTimeout(settle, 25));
  }
  return !alive(pid);
}

function readPid(t, path) {
  assert.ok(existsSync(path), `the stub never wrote ${path}`);
  const pid = Number(readFileSync(path, "utf8").trim());
  t.after(() => {
    if (alive(pid)) process.kill(pid, "SIGKILL");
  });
  return pid;
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

// ---- TLC fixtures, copied from real runs ----

const TWO_TLA = String.raw`---- MODULE Two ----
VARIABLE s
Init == s = "a"
Next == \/ s = "a" /\ s' = "b"
        \/ s = "b" /\ s' = "a"
TypeOK == s \in {"a","b"}
NotC == s # "c"
====
`;

const TWO_CFG = `INIT Init
NEXT Next
INVARIANTS TypeOK NotC
`;

const HIST_CFG = `INIT Init
NEXT Next
INVARIANTS TypeOK NoSkip
`;

const HISTBAD_CFG = `INIT Init
NEXT Next
INVARIANTS TypeOK NoSkip
`;

const BAD_CFG = `INIT Init
NEXT Next
INVARIANT Never
`;

const GOOD_CFG = `INIT Init
NEXT Next
INVARIANT TypeOK
`;

const DEAD_CFG = `INIT Init
NEXT Next
`;

const TWO_OUT = `TLC2 Version 2.19 of 08 August 2024 (rev: 5a47802)
Warning: Please run the Java VM which executes TLC with a throughput optimized garbage collector by passing the "-XX:+UseParallelGC" property.
(Use the -nowarning option to disable this warning.)
Running breadth-first search Model-Checking with fp 32 and seed -3941441576137800980 with 1 worker on 8 cores with 6144MB heap and 64MB offheap memory [pid: 87958] (Mac OS X 26.6.2 aarch64, Eclipse Adoptium 21.0.13 x86_64, MSBDiskFPSet, DiskStateQueue).
Semantic processing of module Two
Starting... (2026-11-06 20:13:19)
Computing initial states...
Finished computing initial states: 1 distinct state generated at 2026-11-06 20:13:19.
Model checking completed. No error has been found.
  Estimates of the probability that TLC did not check all reachable states
  because two distinct states had the same fingerprint:
  calculated (optimistic):  val = 1.1E-19
3 states generated, 2 distinct states found, 0 states left on queue.
The depth of the complete state graph search is 2.
The average outdegree of the complete state graph is 1 (minimum is 0, the maximum 1 and the 95th percentile is 1).
Finished in 00s at (2026-11-06 20:13:19)
`;

const HIST_OUT = `TLC2 Version 2.19 of 08 August 2024 (rev: 5a47802)
Warning: Please run the Java VM which executes TLC with a throughput optimized garbage collector by passing the "-XX:+UseParallelGC" property.
(Use the -nowarning option to disable this warning.)
Running breadth-first search Model-Checking with fp 77 and seed -6375784759420828173 with 1 worker on 8 cores with 6144MB heap and 64MB offheap memory [pid: 99997] (Mac OS X 26.6.2 aarch64, Eclipse Adoptium 21.0.13 x86_64, MSBDiskFPSet, DiskStateQueue).
Semantic processing of module Hist
Starting... (2026-11-06 21:44:13)
Computing initial states...
Finished computing initial states: 1 distinct state generated at 2026-11-06 21:44:13.
Model checking completed. No error has been found.
  Estimates of the probability that TLC did not check all reachable states
  because two distinct states had the same fingerprint:
  calculated (optimistic):  val = 0.0
3 states generated, 3 distinct states found, 0 states left on queue.
The depth of the complete state graph search is 3.
The average outdegree of the complete state graph is 1 (minimum is 0, the maximum 1 and the 95th percentile is 1).
Finished in 01s at (2026-11-06 21:44:13)
`;

const HISTBAD_OUT = String.raw`TLC2 Version 2.19 of 08 August 2024 (rev: 5a47802)
Warning: Please run the Java VM which executes TLC with a throughput optimized garbage collector by passing the "-XX:+UseParallelGC" property.
(Use the -nowarning option to disable this warning.)
Running breadth-first search Model-Checking with fp 96 and seed 5671214910714003370 with 1 worker on 8 cores with 6144MB heap and 64MB offheap memory [pid: 110] (Mac OS X 26.6.2 aarch64, Eclipse Adoptium 21.0.13 x86_64, MSBDiskFPSet, DiskStateQueue).
Semantic processing of module HistBad
Starting... (2026-11-06 21:44:15)
Computing initial states...
Finished computing initial states: 1 distinct state generated at 2026-11-06 21:44:16.
Error: Invariant NoSkip is violated.
Error: The behavior up to this point is:
State 1: <Initial predicate>
/\ s = "pending"
/\ prev = "pending"

State 2: <Skip line 7, col 9 to line 7, col 52 of module HistBad>
/\ s = "shipped"
/\ prev = "pending"

3 states generated, 3 distinct states found, 1 states left on queue.
The depth of the complete state graph search is 2.
Finished in 01s at (2026-11-06 21:44:16)
`;

const BAD_OUT = `TLC2 Version 2.19 of 08 August 2024 (rev: 5a47802)
Warning: Please run the Java VM which executes TLC with a throughput optimized garbage collector by passing the "-XX:+UseParallelGC" property.
(Use the -nowarning option to disable this warning.)
Running breadth-first search Model-Checking with fp 1 and seed -7282515112905650709 with 1 worker on 8 cores with 6144MB heap and 64MB offheap memory [pid: 67035] (Mac OS X 26.6.2 aarch64, Eclipse Adoptium 21.0.13 x86_64, MSBDiskFPSet, DiskStateQueue).
Semantic processing of module Bad
Starting... (2026-11-06 19:55:40)
Computing initial states...
Finished computing initial states: 1 distinct state generated at 2026-11-06 19:55:42.
Error: Invariant Never is violated.
Error: The behavior up to this point is:
State 1: <Initial predicate>
s = "a"

State 2: <Next line 4, col 9 to line 4, col 27 of module Bad>
s = "b"

2 states generated, 2 distinct states found, 0 states left on queue.
The depth of the complete state graph search is 2.
Finished in 06s at (2026-11-06 19:55:42)
`;

const GOOD_OUT = `TLC2 Version 2.19 of 08 August 2024 (rev: 5a47802)
Running breadth-first search Model-Checking with fp 9 and seed 9093966959593738728 with 1 worker on 8 cores with 5461MB heap and 64MB offheap memory [pid: 66914] (Mac OS X 26.6.2 aarch64, Eclipse Adoptium 21.0.13 x86_64, MSBDiskFPSet, DiskStateQueue).
Semantic processing of module Good
Starting... (2026-11-06 19:55:33)
Computing initial states...
Finished computing initial states: 1 distinct state generated at 2026-11-06 19:55:35.
Model checking completed. No error has been found.
  Estimates of the probability that TLC did not check all reachable states
  because two distinct states had the same fingerprint:
  calculated (optimistic):  val = 1.1E-19
3 states generated, 2 distinct states found, 0 states left on queue.
The depth of the complete state graph search is 2.
The average outdegree of the complete state graph is 1 (minimum is 0, the maximum 1 and the 95th percentile is 1).
Finished in 04s at (2026-11-06 19:55:35)
`;

const DEAD_OUT = `TLC2 Version 2.19 of 08 August 2024 (rev: 5a47802)
Warning: Please run the Java VM which executes TLC with a throughput optimized garbage collector by passing the "-XX:+UseParallelGC" property.
(Use the -nowarning option to disable this warning.)
Running breadth-first search Model-Checking with fp 44 and seed 8542959280607406746 with 1 worker on 8 cores with 6144MB heap and 64MB offheap memory [pid: 68145] (Mac OS X 26.6.2 aarch64, Eclipse Adoptium 21.0.13 x86_64, MSBDiskFPSet, DiskStateQueue).
Semantic processing of module Dead
Starting... (2026-11-06 19:56:05)
Computing initial states...
Finished computing initial states: 1 distinct state generated at 2026-11-06 19:56:06.
Error: Deadlock reached.
Error: The behavior up to this point is:
State 1: <Initial predicate>
s = "a"

State 2: <Next line 4, col 9 to line 4, col 27 of module Dead>
s = "b"

2 states generated, 2 distinct states found, 0 states left on queue.
The depth of the complete state graph search is 2.
The average outdegree of the complete state graph is 1 (minimum is 0, the maximum 1 and the 95th percentile is 1).
Finished in 04s at (2026-11-06 19:56:06)
`;

const DEAD_NODEADLOCK_OUT = `TLC2 Version 2.19 of 08 August 2024 (rev: 5a47802)
Warning: Please run the Java VM which executes TLC with a throughput optimized garbage collector by passing the "-XX:+UseParallelGC" property.
(Use the -nowarning option to disable this warning.)
Running breadth-first search Model-Checking with fp 61 and seed 3453330016877993973 with 1 worker on 8 cores with 6144MB heap and 64MB offheap memory [pid: 87977] (Mac OS X 26.6.2 aarch64, Eclipse Adoptium 21.0.13 x86_64, MSBDiskFPSet, DiskStateQueue).
Semantic processing of module Dead
Starting... (2026-11-06 20:13:20)
Computing initial states...
Finished computing initial states: 1 distinct state generated at 2026-11-06 20:13:20.
Model checking completed. No error has been found.
  Estimates of the probability that TLC did not check all reachable states
  because two distinct states had the same fingerprint:
  calculated (optimistic):  val = 0.0
2 states generated, 2 distinct states found, 0 states left on queue.
The depth of the complete state graph search is 2.
The average outdegree of the complete state graph is 1 (minimum is 0, the maximum 1 and the 95th percentile is 1).
Finished in 00s at (2026-11-06 20:13:20)
`;

// syn.out holds a line with a trailing space, so it is written line by line.
const SYN_OUT = [
  "TLC2 Version 2.19 of 08 August 2024 (rev: 5a47802)",
  'Warning: Please run the Java VM which executes TLC with a throughput optimized garbage collector by passing the "-XX:+UseParallelGC" property.',
  "(Use the -nowarning option to disable this warning.)",
  "Running breadth-first search Model-Checking with fp 113 and seed 291114412354340372 with 1 worker on 8 cores with 6144MB heap and 64MB offheap memory [pid: 67521] (Mac OS X 26.6.2 aarch64, Eclipse Adoptium 21.0.13 x86_64, MSBDiskFPSet, DiskStateQueue).",
  "***Parse Error***",
  'Was expecting "Expression or Instance"',
  'Encountered "==" at line 2, column 9 and token "==" ',
  "",
  "Residual stack trace follows:",
  "Definition starting at line 2, column 1.",
  "Module body starting at line 2, column 1.",
  "Module definition starting at line 1, column 1.",
  "",
  "",
  "Fatal errors while parsing TLA+ spec in file Syn",
  "",
  "tla2sany.semantic.AbortException",
  "*** Abort messages: 1",
  "",
  "In module Syn",
  "",
  "Could not parse module Syn from file Syn.tla",
  "",
  "",
  "Starting... (2026-11-06 19:55:47)",
  "Error: Parsing or semantic analysis failed.",
  "Finished in 03s at (2026-11-06 19:55:47)",
  "",
].join("\n");

const TWO_OUT_WITHOUT_PASS_LINE = TWO_OUT.replace(
  "Model checking completed. No error has been found.\n",
  "",
);

const TWO_OUT_WITH_ONE_STATE = TWO_OUT.replace(
  "3 states generated, 2 distinct states found",
  "1 states generated, 1 distinct states found",
);

async function classifyTlc(input) {
  const { classifyTlc: classify } = await import(pathToFileURL(script("run-tlc.mjs")).href);
  return classify(input);
}

// ---- lane briefs ----

const WIDGETS_BRIEF = `---
lane: widgets
summary: Finds widgets
makes: false
evidence: state, transition
checks:
artifacts:
---

## Find

A candidate is a widget.
`;

const GADGETS_BRIEF = `---
lane: gadgets
summary: Finds gadgets
makes: false
evidence: guard
checks:
artifacts:
---

## Find

A candidate is a gadget.
`;

// A directory holding scripts/list-lanes.mjs beside references/lanes/ with `briefs` in it.
function laneRegistry(t, briefs) {
  const dir = tempDir(t, "improving-codebases-lanes-");
  mkdirSync(join(dir, "scripts"));
  mkdirSync(join(dir, "references", "lanes"), { recursive: true });
  copyFileSync(script("list-lanes.mjs"), join(dir, "scripts", "list-lanes.mjs"));
  for (const [name, text] of Object.entries(briefs)) {
    writeFileSync(join(dir, "references", "lanes", name), text);
  }
  return dir;
}

function listLanes(dir, ...args) {
  return node(join(dir, "scripts", "list-lanes.mjs"), args);
}

describe("slice 1: report implicit state machines", () => {
  test("list-lanes.mjs reads the registry from references/lanes", async (t) => {
    await t.test("a placed brief appears in the JSON with no other change", (st) => {
      const dir = laneRegistry(st, { "widgets.md": WIDGETS_BRIEF });
      const before = listLanes(dir);
      writeFileSync(join(dir, "references", "lanes", "gadgets.md"), GADGETS_BRIEF);

      const after = listLanes(dir);

      assert.equal(before.status, 0, before.stderr);
      assert.deepEqual(
        JSON.parse(before.stdout).map((lane) => lane.lane),
        ["widgets"],
      );
      assert.equal(after.status, 0, after.stderr);
      assert.deepEqual(
        JSON.parse(after.stdout).map((lane) => lane.lane),
        ["gadgets", "widgets"],
      );
    });

    await t.test("empty checks and artifacts pass", (st) => {
      const dir = laneRegistry(st, { "widgets.md": WIDGETS_BRIEF });

      const run = listLanes(dir);

      assert.equal(run.status, 0, run.stderr);
      assert.deepEqual(JSON.parse(run.stdout)[0].checks, []);
      assert.deepEqual(JSON.parse(run.stdout)[0].artifacts, []);
    });

    await t.test("an absent key: exit 1", (st) => {
      const dir = laneRegistry(st, {
        "widgets.md": `---
lane: widgets
summary: Finds widgets
makes: false
evidence: state, transition
artifacts:
---

## Find

A candidate is a widget.
`,
      });

      const run = listLanes(dir);

      assert.equal(run.status, 1, run.stderr);
      assert.match(run.stderr, /missing key checks/);
    });

    await t.test("a lane that differs from the stem: exit 1", (st) => {
      const dir = laneRegistry(st, {
        "widgets.md": `---
lane: gizmos
summary: Finds widgets
makes: false
evidence: state, transition
checks:
artifacts:
---

## Find

A candidate is a widget.
`,
      });

      const run = listLanes(dir);

      assert.equal(run.status, 1, run.stderr);
      assert.match(run.stderr, /does not match the file name/);
    });

    await t.test("a makes that is not true or false: exit 1", (st) => {
      const dir = laneRegistry(st, {
        "widgets.md": `---
lane: widgets
summary: Finds widgets
makes: yes
evidence: state, transition
checks:
artifacts:
---

## Find

A candidate is a widget.
`,
      });

      const run = listLanes(dir);

      assert.equal(run.status, 1, run.stderr);
      assert.match(run.stderr, /makes must be true or false/);
    });

    await t.test("no ## Find: exit 1", (st) => {
      const dir = laneRegistry(st, {
        "widgets.md": `---
lane: widgets
summary: Finds widgets
makes: false
evidence: state, transition
checks:
artifacts:
---

## Search

A candidate is a widget.
`,
      });

      const run = listLanes(dir);

      assert.equal(run.status, 1, run.stderr);
      assert.match(run.stderr, /missing ## Find/);
    });

    await t.test("a makes: true brief with no ## Make: exit 1", (st) => {
      const dir = laneRegistry(st, {
        "widgets.md": `---
lane: widgets
summary: Finds widgets
makes: true
evidence: state, transition
checks: model-check
artifacts: .tla, .cfg
---

## Find

A candidate is a widget.

## Review

Refute each claim.
`,
      });

      const run = listLanes(dir);

      assert.equal(run.status, 1, run.stderr);
      assert.match(run.stderr, /missing ## Make/);
    });

    await t.test("a makes: true brief with no ## Review: exit 1", (st) => {
      const dir = laneRegistry(st, {
        "widgets.md": `---
lane: widgets
summary: Finds widgets
makes: true
evidence: state, transition
checks: model-check
artifacts: .tla, .cfg
---

## Find

A candidate is a widget.

## Make

Write a spec, then refactor.
`,
      });

      const run = listLanes(dir);

      assert.equal(run.status, 1, run.stderr);
      assert.match(run.stderr, /missing ## Review/);
    });

    await t.test("an empty references/lanes/: exit 1", (st) => {
      const dir = laneRegistry(st, {});

      const run = listLanes(dir);

      assert.equal(run.status, 1, run.stderr);
      assert.match(run.stderr, /no lane briefs/);
    });

    await t.test("a stray argument: exit 2", (st) => {
      const dir = laneRegistry(st, { "widgets.md": WIDGETS_BRIEF });

      const run = listLanes(dir, "stray");

      assert.equal(run.status, 2, run.stderr);
    });
  });
});

describe("slice 2: spec and model-check each machine", () => {
  test("classifyTlc turns each saved TLC run into one status", async (t) => {
    await t.test("two.out with Two.cfg: pass with distinctStates", async () => {
      const result = await classifyTlc({ exitCode: 0, output: TWO_OUT, cfg: TWO_CFG });

      assert.equal(result.status, "pass");
      assert.equal(result.distinctStates, 2);
    });

    await t.test("hist.out with Hist.cfg: pass with distinctStates", async () => {
      const result = await classifyTlc({ exitCode: 0, output: HIST_OUT, cfg: HIST_CFG });

      assert.equal(result.status, "pass");
      assert.equal(result.distinctStates, 3);
    });

    await t.test("histbad.out with HistBad.cfg: fail with the trace", async () => {
      const result = await classifyTlc({ exitCode: 12, output: HISTBAD_OUT, cfg: HISTBAD_CFG });

      assert.equal(result.status, "fail");
      assert.match(
        result.trace,
        /State 2: <Skip line 7, col 9 to line 7, col 52 of module HistBad>/,
      );
    });

    await t.test("bad.out with Bad.cfg: fail with the trace", async () => {
      const result = await classifyTlc({ exitCode: 12, output: BAD_OUT, cfg: BAD_CFG });

      assert.equal(result.status, "fail");
      assert.match(result.trace, /State 2: <Next line 4, col 9 to line 4, col 27 of module Bad>/);
    });

    await t.test(
      "good.out with Good.cfg: not-run, because the .cfg names only TypeOK",
      async () => {
        const result = await classifyTlc({ exitCode: 0, output: GOOD_OUT, cfg: GOOD_CFG });

        assert.equal(result.status, "not-run");
      },
    );

    await t.test("dead.out with Dead.cfg: not-run", async () => {
      const result = await classifyTlc({ exitCode: 11, output: DEAD_OUT, cfg: DEAD_CFG });

      assert.equal(result.status, "not-run");
    });

    await t.test("syn.out with Dead.cfg: not-run", async () => {
      const result = await classifyTlc({ exitCode: 150, output: SYN_OUT, cfg: DEAD_CFG });

      assert.equal(result.status, "not-run");
    });

    await t.test("dead-nodeadlock.out with Dead.cfg: not-run", async () => {
      const result = await classifyTlc({
        exitCode: 0,
        output: DEAD_NODEADLOCK_OUT,
        cfg: DEAD_CFG,
      });

      assert.equal(result.status, "not-run");
    });

    await t.test("exit 0 with no pass line, with Two.cfg: not-run", async () => {
      assert.doesNotMatch(TWO_OUT_WITHOUT_PASS_LINE, /No error has been found/);

      const result = await classifyTlc({
        exitCode: 0,
        output: TWO_OUT_WITHOUT_PASS_LINE,
        cfg: TWO_CFG,
      });

      assert.equal(result.status, "not-run");
    });

    await t.test("the pass line with 1 distinct state, with Two.cfg: not-run", async () => {
      assert.match(TWO_OUT_WITH_ONE_STATE, /^1 states generated, 1 distinct states found/m);

      const result = await classifyTlc({
        exitCode: 0,
        output: TWO_OUT_WITH_ONE_STATE,
        cfg: TWO_CFG,
      });

      assert.equal(result.status, "not-run");
    });

    await t.test("unknown text, with Two.cfg: not-run", async () => {
      const result = await classifyTlc({
        exitCode: 0,
        output: "TLC2 printed something this script has never seen.\n",
        cfg: TWO_CFG,
      });

      assert.equal(result.status, "not-run");
    });
  });

  test("run-tlc.mjs finds the checker and holds it to its bounds", async (t) => {
    // A spec directory holding Two.tla and Two.cfg, an empty bin directory, and a <run>.
    const checkerFixture = (st) => {
      const specs = tempDir(st, "improving-codebases-specs-");
      writeFileSync(join(specs, "Two.tla"), TWO_TLA);
      writeFileSync(join(specs, "Two.cfg"), TWO_CFG);
      return {
        specs,
        spec: join(specs, "Two.tla"),
        bin: tempDir(st, "improving-codebases-bin-"),
        run: tempDir(st, "improving-codebases-run-"),
      };
    };

    await t.test(
      "no tlc and no TLA2TOOLS_JAR: not-run, and reason names what the script looked for",
      (st) => {
        const fx = checkerFixture(st);
        const result = join(fx.run, "tlc", "1.json");
        mkdirSync(dirname(result));

        const run = node(script("run-tlc.mjs"), [fx.spec, result], { PATH: fx.bin });

        assert.equal(run.status, 0, run.stderr);
        assert.equal(readJson(result).status, "not-run");
        assert.match(readJson(result).reason, /tlc/);
        assert.match(readJson(result).reason, /TLA2TOOLS_JAR/);
      },
    );

    await t.test("TLA2TOOLS_JAR with no java: not-run, and reason names java", (st) => {
      const fx = checkerFixture(st);
      const jar = join(fx.run, "tla2tools.jar");
      writeFileSync(jar, "");
      const result = join(fx.run, "tlc", "1.json");
      mkdirSync(dirname(result));

      const run = node(script("run-tlc.mjs"), [fx.spec, result], {
        PATH: fx.bin,
        TLA2TOOLS_JAR: jar,
      });

      assert.equal(run.status, 0, run.stderr);
      assert.equal(readJson(result).status, "not-run");
      assert.match(readJson(result).reason, /java/);
    });

    await t.test("tlc on PATH: the argv holds -deadlock", (st) => {
      const fx = checkerFixture(st);
      const argvFile = join(fx.run, "argv.txt");
      stub(fx.bin, "tlc", `printf '%s\\n' "$@" > '${argvFile}'\n`);
      const result = join(fx.run, "tlc", "1.json");
      mkdirSync(dirname(result));

      const run = node(script("run-tlc.mjs"), [fx.spec, result], { PATH: fx.bin });

      assert.equal(run.status, 0, run.stderr);
      assert.ok(readFileSync(argvFile, "utf8").split("\n").includes("-deadlock"));
    });

    await t.test("java with the jar: the argv holds the jar and -deadlock", (st) => {
      const fx = checkerFixture(st);
      const jar = join(fx.run, "tla2tools.jar");
      writeFileSync(jar, "");
      const argvFile = join(fx.run, "argv.txt");
      stub(fx.bin, "java", `printf '%s\\n' "$@" > '${argvFile}'\n`);
      const result = join(fx.run, "tlc", "1.json");
      mkdirSync(dirname(result));

      const run = node(script("run-tlc.mjs"), [fx.spec, result], {
        PATH: fx.bin,
        TLA2TOOLS_JAR: jar,
      });

      assert.equal(run.status, 0, run.stderr);
      assert.ok(readFileSync(argvFile, "utf8").split("\n").includes(jar));
      assert.ok(readFileSync(argvFile, "utf8").split("\n").includes("-deadlock"));
    });

    await t.test(
      "a child past the wall clock, with a grandchild: the group dies, and the result reads not-run",
      async (st) => {
        const fx = checkerFixture(st);
        const childPid = join(fx.run, "child.pid");
        const grandchildPid = join(fx.run, "grandchild.pid");
        stub(
          fx.bin,
          "tlc",
          `/bin/sleep 30 &
printf '%s\\n' "$!" > '${grandchildPid}'
printf '%s\\n' "$$" > '${childPid}'
wait
`,
        );
        const result = join(fx.run, "tlc", "1.json");
        mkdirSync(dirname(result));

        const run = callExport(
          script("run-tlc.mjs"),
          "runTlc",
          [fx.spec, result, { wallClockMs: 2_000, distinctStateLimit: 1_000_000 }],
          { PATH: fx.bin },
        );

        assert.equal(run.status, 0, run.stderr);
        assert.equal(readJson(result).status, "not-run");
        assert.equal(await gone(readPid(st, childPid)), true, "the tlc child outlived the bound");
        assert.equal(
          await gone(readPid(st, grandchildPid)),
          true,
          "the tlc grandchild outlived the bound",
        );
      },
    );

    await t.test("a progress line past the distinct-state bound: the same result", async (st) => {
      const fx = checkerFixture(st);
      const childPid = join(fx.run, "child.pid");
      stub(
        fx.bin,
        "tlc",
        `printf '%s\\n' "$$" > '${childPid}'
printf '%s\\n' 'Progress(3) at 2026-11-06 19:55:42: 5,000 states generated (5,000 s/min), 2,500 distinct states found, 1,200 states left on queue.'
exec /bin/sleep 30
`,
      );
      const result = join(fx.run, "tlc", "1.json");
      mkdirSync(dirname(result));

      const run = callExport(
        script("run-tlc.mjs"),
        "runTlc",
        [fx.spec, result, { wallClockMs: 60_000, distinctStateLimit: 1_000 }],
        { PATH: fx.bin },
      );

      assert.equal(run.status, 0, `runTlc did not stop at the state bound: ${run.stderr}`);
      assert.equal(readJson(result).status, "not-run");
      assert.equal(await gone(readPid(st, childPid)), true, "the tlc child outlived the bound");
    });

    await t.test("inputs holds a digest for each .tla and .cfg copied, siblings included", (st) => {
      const fx = checkerFixture(st);
      const helperTla = "---- MODULE Helper ----\nConst == 1\n====\n";
      writeFileSync(join(fx.specs, "Helper.tla"), helperTla);
      writeFileSync(join(fx.specs, "notes.md"), "not a TLA+ input\n");
      stub(fx.bin, "tlc", "exit 0\n");
      const result = join(fx.run, "tlc", "1.json");
      mkdirSync(dirname(result));

      const run = node(script("run-tlc.mjs"), [fx.spec, result], { PATH: fx.bin });

      assert.equal(run.status, 0, run.stderr);
      assert.deepEqual(
        Object.fromEntries(readJson(result).inputs.map((input) => [input.path, input.sha256])),
        {
          [join(fx.specs, "Helper.tla")]: sha256(helperTla),
          [join(fx.specs, "Two.cfg")]: sha256(TWO_CFG),
          [join(fx.specs, "Two.tla")]: sha256(TWO_TLA),
        },
      );
    });

    await t.test("a stub that writes states/ leaves nothing beside the spec", (st) => {
      const fx = checkerFixture(st);
      const ranFile = join(fx.run, "ran.txt");
      stub(
        fx.bin,
        "tlc",
        `/bin/mkdir states
printf 'trace\\n' > Two_TTrace_1.tla
printf 'ran\\n' > '${ranFile}'
`,
      );
      const result = join(fx.run, "tlc", "1.json");
      mkdirSync(dirname(result));

      const run = node(script("run-tlc.mjs"), [fx.spec, result], { PATH: fx.bin });

      assert.equal(run.status, 0, run.stderr);
      assert.ok(existsSync(ranFile), "the tlc stub never ran");
      assert.deepEqual(readdirSync(fx.specs).sort(), ["Two.cfg", "Two.tla"]);
    });

    await t.test("a variable outside the allowlist does not reach the stub", (st) => {
      const fx = checkerFixture(st);
      const envFile = join(fx.run, "env.txt");
      stub(fx.bin, "tlc", `/usr/bin/env > '${envFile}'\n`);
      const result = join(fx.run, "tlc", "1.json");
      mkdirSync(dirname(result));

      const run = node(script("run-tlc.mjs"), [fx.spec, result], {
        PATH: fx.bin,
        IMPROVING_CODEBASES_SECRET: "must-not-leak",
      });

      assert.equal(run.status, 0, run.stderr);
      assert.match(readFileSync(envFile, "utf8"), /^PATH=/m);
      assert.doesNotMatch(readFileSync(envFile, "utf8"), /IMPROVING_CODEBASES_SECRET/);
    });

    await t.test("a bad module name: exit 2", (st) => {
      const fx = checkerFixture(st);
      writeFileSync(join(fx.specs, "two.tla"), TWO_TLA);
      const result = join(fx.run, "tlc", "1.json");
      mkdirSync(dirname(result));

      const run = node(script("run-tlc.mjs"), [join(fx.specs, "two.tla"), result], {
        PATH: fx.bin,
      });

      assert.equal(run.status, 2, run.stderr);
    });

    await t.test("an unwritable result: exit 1", (st) => {
      const fx = checkerFixture(st);
      const blocker = join(fx.run, "blocker");
      writeFileSync(blocker, "a file where a directory belongs\n");

      const run = node(script("run-tlc.mjs"), [fx.spec, join(blocker, "1.json")], {
        PATH: fx.bin,
      });

      assert.equal(run.status, 1, run.stderr);
    });

    await t.test("a first run, with no <run>/tlc/<id>/ yet: exit 0, and the result", (st) => {
      const fx = checkerFixture(st);
      stub(fx.bin, "tlc", "exit 0\n");
      const result = join(fx.run, "tlc", "state-machines", "1", "1.json");

      const run = node(script("run-tlc.mjs"), [fx.spec, result], { PATH: fx.bin });

      assert.equal(run.status, 0, run.stderr);
      assert.equal(readJson(result).check, "model-check");
    });

    await t.test("the result names the spec it checked, apart from its siblings", (st) => {
      const fx = checkerFixture(st);
      writeFileSync(join(fx.specs, "Helper.tla"), "---- MODULE Helper ----\nConst == 1\n====\n");
      stub(fx.bin, "tlc", "exit 0\n");
      const result = join(fx.run, "tlc", "1.json");
      mkdirSync(dirname(result));

      const run = node(script("run-tlc.mjs"), [fx.spec, result], { PATH: fx.bin });

      assert.equal(run.status, 0, run.stderr);
      assert.equal(readJson(result).spec, fx.spec);
    });
  });
});

describe("slice 4: refactor each machine under a test gate", () => {
  test("run-bounded.mjs writes one result for each way a command ends", async (t) => {
    // A git repository with one tracked file, and a <run> outside it for the request and result.
    const commandFixture = (st) => {
      const root = fixtureRepo(st, { "src.txt": "one\n" });
      const run = tempDir(st, "improving-codebases-run-");
      return { root, run, result: join(run, "result.json"), log: join(run, "command.log") };
    };
    const request = (fx, argv, extra = {}) =>
      writeJson(join(fx.run, "request.json"), {
        check: "tests",
        argv,
        cwd: fx.root,
        env: [],
        result: fx.result,
        log: fx.log,
        ...extra,
      });

    await t.test("exit 0 with an unchanged tree: pass, with command, seconds, and tree", (st) => {
      const fx = commandFixture(st);
      const argv = [process.execPath, "-e", "process.exit(0)"];

      const run = node(script("run-bounded.mjs"), [request(fx, argv)]);

      assert.equal(run.status, 0, run.stderr);
      assert.equal(readJson(fx.result).status, "pass");
      assert.deepEqual(readJson(fx.result).command, argv);
      assert.equal(typeof readJson(fx.result).seconds, "number");
      assert.match(readJson(fx.result).tree, /\S/);
    });

    await t.test("a non-zero exit: fail, and trace holds the log tail", (st) => {
      const fx = commandFixture(st);
      const argv = [
        process.execPath,
        "-e",
        "console.error('gate failed: marker 7f3a'); process.exit(3)",
      ];

      const run = node(script("run-bounded.mjs"), [request(fx, argv)]);

      assert.equal(run.status, 0, run.stderr);
      assert.equal(readJson(fx.result).status, "fail");
      assert.match(readJson(fx.result).trace, /gate failed: marker 7f3a/);
    });

    await t.test(
      "a child that ignores SIGTERM past the bound: killed, and the result reads not-run",
      async (st) => {
        const fx = commandFixture(st);
        const pidFile = join(fx.run, "child.pid");
        const argv = [
          process.execPath,
          "-e",
          "process.on('SIGTERM', () => {}); require('fs').writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000);",
          pidFile,
        ];
        const body = {
          check: "tests",
          argv,
          cwd: fx.root,
          env: [],
          result: fx.result,
          log: fx.log,
        };

        const run = callExport(
          script("run-bounded.mjs"),
          "runBounded",
          [body, { wallClockMs: 2_000 }],
          process.env,
        );

        assert.equal(run.status, 0, run.stderr);
        assert.equal(readJson(fx.result).status, "not-run");
        assert.equal(await gone(readPid(st, pidFile)), true, "the child outlived the bound");
      },
    );

    await t.test("a run that edits a tracked file: fail, and reason names the file", (st) => {
      const fx = commandFixture(st);
      const argv = [process.execPath, "-e", "require('fs').writeFileSync('src.txt', 'two\\n')"];

      const run = node(script("run-bounded.mjs"), [request(fx, argv)]);

      assert.equal(run.status, 0, run.stderr);
      assert.equal(readJson(fx.result).status, "fail");
      assert.match(readJson(fx.result).reason, /src\.txt/);
    });

    await t.test("a run that moves HEAD: fail, and reason names HEAD", (st) => {
      const fx = commandFixture(st);
      const tree = git(fx.root, "rev-parse", "HEAD^{tree}");
      const second = git(fx.root, "commit-tree", tree, "-p", "HEAD", "-m", "second");
      const argv = [
        process.execPath,
        "-e",
        "require('fs').writeFileSync('.git/HEAD', process.argv[1] + '\\n')",
        second,
      ];

      const run = node(script("run-bounded.mjs"), [request(fx, argv)]);

      assert.equal(run.status, 0, run.stderr);
      assert.equal(readJson(fx.result).status, "fail");
      assert.match(readJson(fx.result).reason, /HEAD/);
    });

    await t.test("a run that changes a ref: fail, and reason names refs", (st) => {
      const fx = commandFixture(st);
      const head = git(fx.root, "rev-parse", "HEAD");
      const argv = [
        process.execPath,
        "-e",
        "require('fs').writeFileSync('.git/refs/tags/made-by-the-tests', process.argv[1] + '\\n')",
        head,
      ];

      const run = node(script("run-bounded.mjs"), [request(fx, argv)]);

      assert.equal(run.status, 0, run.stderr);
      assert.equal(readJson(fx.result).status, "fail");
      assert.match(readJson(fx.result).reason, /refs/);
    });

    await t.test("a run that writes only an untracked file: pass", (st) => {
      const fx = commandFixture(st);
      const argv = [
        process.execPath,
        "-e",
        "require('fs').writeFileSync('coverage.txt', 'report\\n')",
      ];

      const run = node(script("run-bounded.mjs"), [request(fx, argv)]);

      assert.equal(run.status, 0, run.stderr);
      assert.equal(readJson(fx.result).status, "pass");
    });

    await t.test("an argv element with shell characters reaches the child unchanged", (st) => {
      const fx = commandFixture(st);
      const record = join(fx.run, "argv.json");
      const shellText = "$(touch pwned); `id` | cat > out & * 'single' \"double\"";
      const argv = [
        process.execPath,
        "-e",
        "require('fs').writeFileSync(process.argv[1], JSON.stringify(process.argv.slice(2)))",
        record,
        shellText,
      ];

      const run = node(script("run-bounded.mjs"), [request(fx, argv)]);

      assert.equal(run.status, 0, run.stderr);
      assert.deepEqual(readJson(record), [shellText]);
    });

    await t.test(
      "a variable outside the allowlist does not reach the child, and a name in env does",
      (st) => {
        const fx = commandFixture(st);
        const record = join(fx.run, "env.json");
        const argv = [
          process.execPath,
          "-e",
          "require('fs').writeFileSync(process.argv[1], JSON.stringify({ secret: process.env.IMPROVING_CODEBASES_SECRET ?? null, wanted: process.env.IMPROVING_CODEBASES_WANTED ?? null }))",
          record,
        ];

        const run = node(
          script("run-bounded.mjs"),
          [request(fx, argv, { env: ["IMPROVING_CODEBASES_WANTED"] })],
          {
            ...process.env,
            IMPROVING_CODEBASES_SECRET: "must-not-leak",
            IMPROVING_CODEBASES_WANTED: "passed-by-the-user",
          },
        );

        assert.equal(run.status, 0, run.stderr);
        assert.deepEqual(readJson(record), { secret: null, wanted: "passed-by-the-user" });
      },
    );

    await t.test("an unreadable request: exit 1", (st) => {
      const fx = commandFixture(st);

      const run = node(script("run-bounded.mjs"), [join(fx.run, "absent-request.json")]);

      assert.equal(run.status, 1, run.stderr);
    });

    await t.test("an unwritable result: exit 1", (st) => {
      const fx = commandFixture(st);
      const blocker = join(fx.run, "blocker");
      writeFileSync(blocker, "a file where a directory belongs\n");
      const argv = [process.execPath, "-e", "process.exit(0)"];

      const run = node(script("run-bounded.mjs"), [
        request(fx, argv, { result: join(blocker, "result.json") }),
      ]);

      assert.equal(run.status, 1, run.stderr);
    });

    await t.test("no arguments: exit 2", () => {
      const run = node(script("run-bounded.mjs"), []);

      assert.equal(run.status, 2, run.stderr);
    });
  });

  test("two findings end applied and proposed with no commit", async (t) => {
    const ORDERS_AT_HEAD = `let paymentStatus = "pending";
export function pay() { if (paymentStatus === "pending") paymentStatus = "paid"; }
export function refund() { if (paymentStatus === "paid") paymentStatus = "refunded"; }
let shippingStatus = "waiting";
export function ship() { if (shippingStatus === "waiting") shippingStatus = "shipped"; }
export function deliver() { if (shippingStatus === "shipped") shippingStatus = "delivered"; }
`;
    const ORDERS_PAYMENT_EXPLICIT = `const PAYMENT = { pay: ["pending", "paid"], refund: ["paid", "refunded"] };
let paymentStatus = "pending";
function applyPayment(action) { if (paymentStatus === PAYMENT[action][0]) paymentStatus = PAYMENT[action][1]; }
export function pay() { applyPayment("pay"); }
export function refund() { applyPayment("refund"); }
let shippingStatus = "waiting";
export function ship() { if (shippingStatus === "waiting") shippingStatus = "shipped"; }
export function deliver() { if (shippingStatus === "shipped") shippingStatus = "delivered"; }
`;
    const ORDERS_BOTH_EDITED = `const PAYMENT = { pay: ["pending", "paid"], refund: ["paid", "refunded"] };
let paymentStatus = "pending";
function applyPayment(action) { if (paymentStatus === PAYMENT[action][0]) paymentStatus = PAYMENT[action][1]; }
export function pay() { applyPayment("pay"); }
export function refund() { applyPayment("refund"); }
let shippingStatus = "waiting";
export function ship() { shippingStatus = "shipped"; } // BROKEN: the guard is gone
export function deliver() { shippingStatus = "delivered"; } // BROKEN: the guard is gone
`;
    // The covering test: it fails when the source holds the BROKEN marker.
    const ORDERS_GATE = `import { readFileSync } from "node:fs";
const source = readFileSync(new URL("../src/orders.js", import.meta.url), "utf8");
if (source.includes("BROKEN")) {
  console.error("orders gate: a transition lost its guard");
  process.exit(1);
}
`;
    const PAYMENT_TLA = String.raw`---- MODULE PaymentStatus ----
VARIABLES s, prev
States == {"pending", "paid", "refunded"}
Init == s = "pending" /\ prev = "pending"
Pay == s = "pending" /\ s' = "paid" /\ prev' = s
Refund == s = "paid" /\ s' = "refunded" /\ prev' = s
Next == Pay \/ Refund
TypeOK == s \in States /\ prev \in States
NoSkip == ~(prev = "pending" /\ s = "refunded")
====
`;
    const SHIPPING_TLA = String.raw`---- MODULE ShippingStatus ----
VARIABLES s, prev
States == {"waiting", "shipped", "delivered"}
Init == s = "waiting" /\ prev = "waiting"
Ship == s = "waiting" /\ s' = "shipped" /\ prev' = s
Deliver == s = "shipped" /\ s' = "delivered" /\ prev' = s
Next == Ship \/ Deliver
TypeOK == s \in States /\ prev \in States
NoSkip == ~(prev = "waiting" /\ s = "delivered")
====
`;
    const SPEC_CFG = "INIT Init\nNEXT Next\nINVARIANTS TypeOK NoSkip\n";

    const skill = tempDir(t, "improving-codebases-skill-");
    script("checkpoint.mjs");
    script("run-bounded.mjs");
    script("run-tlc.mjs");
    script("render-report.mjs");
    cpSync(SCRIPTS, join(skill, "scripts"), { recursive: true });
    write(
      skill,
      "references/lanes/machines.md",
      `---
lane: machines
summary: Finds implicit state machines
makes: true
evidence: state, transition, guard
checks: model-check
artifacts: .tla, .cfg
---

## Find

A candidate is a status variable with guarded transitions.

## Make

Write a spec, then refactor.

## Review

Refute each claim.
`,
    );
    const skillScript = (name) => join(skill, "scripts", name);
    const root = fixtureRepo(t, {
      "src/orders.js": ORDERS_AT_HEAD,
      "test/orders.test.mjs": ORDERS_GATE,
    });
    const commit = git(root, "rev-parse", "HEAD");
    const refsBefore = git(root, "for-each-ref");
    const run = tempDir(t, "improving-codebases-run-");
    const noTlc = { PATH: tempDir(t, "improving-codebases-bin-") };
    const testCommand = (id, result) => ({
      check: "tests",
      argv: [process.execPath, "test/orders.test.mjs"],
      cwd: root,
      env: [],
      result,
      log: join(dirname(result), `${id}.log`),
    });

    const payment = {
      id: "machines/1",
      lane: "machines",
      title: "paymentStatus moves through pending, paid, and refunded with no declared table",
      citations: ["src/orders.js:1"],
      evidence: [
        { kind: "state", name: "pending", citation: "src/orders.js:1" },
        { kind: "transition", name: "pay", citation: "src/orders.js:2" },
        { kind: "guard", name: 'paymentStatus === "pending"', citation: "src/orders.js:2" },
      ],
      coveringTests: ["test/orders.test.mjs:1"],
    };
    const shipping = {
      id: "machines/2",
      lane: "machines",
      title: "shippingStatus moves through waiting, shipped, and delivered with no declared table",
      citations: ["src/orders.js:4"],
      evidence: [
        { kind: "state", name: "waiting", citation: "src/orders.js:4" },
        { kind: "transition", name: "ship", citation: "src/orders.js:5" },
        { kind: "guard", name: 'shippingStatus === "waiting"', citation: "src/orders.js:5" },
      ],
      coveringTests: ["test/orders.test.mjs:1"],
    };
    const report = (findings) => ({
      version: 1,
      skill: "improving-codebases",
      scope: { root, commit, date: "2026-11-06", paths: ["."], dirty: [] },
      groups: [{ id: "group-1", files: ["src/orders.js", "test/orders.test.mjs"] }],
      lanes: [{ lane: "machines", ran: ["group-1"], failed: [] }],
      gaps: [],
      findings,
    });
    writeJson(
      join(run, "report.json"),
      report([
        { ...payment, outcome: "deferred", reason: "make step pending" },
        { ...shipping, outcome: "deferred", reason: "make step pending" },
      ]),
    );

    const baseline = node(skillScript("run-bounded.mjs"), [
      writeJson(
        join(run, "requests", "baseline.json"),
        testCommand("baseline", join(run, "baseline.json")),
      ),
    ]);
    assert.equal(baseline.status, 0, baseline.stderr);
    assert.equal(readJson(join(run, "baseline.json")).status, "pass");

    // Finding 1: the refactor keeps the covering test green.
    const save1 = node(skillScript("checkpoint.mjs"), ["save", run, "machines/1"]);
    assert.equal(save1.status, 0, save1.stderr);
    write(root, "specs/tla/PaymentStatus.tla", PAYMENT_TLA);
    write(root, "specs/tla/PaymentStatus.cfg", SPEC_CFG);
    const tlc1 = join(run, "tlc", "machines", "1", "1.json");
    mkdirSync(dirname(tlc1), { recursive: true });
    const check1 = node(
      skillScript("run-tlc.mjs"),
      [join(root, "specs/tla/PaymentStatus.tla"), tlc1],
      noTlc,
    );
    assert.equal(check1.status, 0, check1.stderr);
    write(root, "src/orders.js", ORDERS_PAYMENT_EXPLICIT);
    writeJson(join(run, "make", "machines", "1.json"), {
      artifacts: ["specs/tla/PaymentStatus.tla", "specs/tla/PaymentStatus.cfg"],
      proposedChange: "Route paymentStatus through the PAYMENT table.",
      checks: [{ name: "model-check", result: tlc1 }],
      reason: "",
    });
    const verify1 = node(skillScript("checkpoint.mjs"), ["verify", run, "machines/1"]);
    assert.equal(verify1.status, 0, verify1.stderr);
    const tests1 = join(run, "checkpoints", "machines", "1", "tests.json");
    const gate1 = node(skillScript("run-bounded.mjs"), [
      writeJson(join(run, "requests", "machines-1.json"), testCommand("machines-1", tests1)),
    ]);
    assert.equal(gate1.status, 0, gate1.stderr);
    assert.equal(readJson(tests1).status, "pass");

    // Finding 2: the refactor turns the covering test red, so restore undoes it.
    const save2 = node(skillScript("checkpoint.mjs"), ["save", run, "machines/2"]);
    assert.equal(save2.status, 0, save2.stderr);
    write(root, "specs/tla/ShippingStatus.tla", SHIPPING_TLA);
    write(root, "specs/tla/ShippingStatus.cfg", SPEC_CFG);
    const tlc2 = join(run, "tlc", "machines", "2", "1.json");
    mkdirSync(dirname(tlc2), { recursive: true });
    const check2 = node(
      skillScript("run-tlc.mjs"),
      [join(root, "specs/tla/ShippingStatus.tla"), tlc2],
      noTlc,
    );
    assert.equal(check2.status, 0, check2.stderr);
    write(root, "src/orders.js", ORDERS_BOTH_EDITED);
    writeJson(join(run, "make", "machines", "2.json"), {
      artifacts: ["specs/tla/ShippingStatus.tla", "specs/tla/ShippingStatus.cfg"],
      proposedChange: "Route shippingStatus through a SHIPPING table that keeps both guards.",
      checks: [{ name: "model-check", result: tlc2 }],
      reason: "",
    });
    const verify2 = node(skillScript("checkpoint.mjs"), ["verify", run, "machines/2"]);
    assert.equal(verify2.status, 0, verify2.stderr);
    const tests2 = join(run, "checkpoints", "machines", "2", "tests.json");
    const gate2 = node(skillScript("run-bounded.mjs"), [
      writeJson(join(run, "requests", "machines-2.json"), testCommand("machines-2", tests2)),
    ]);
    assert.equal(gate2.status, 0, gate2.stderr);
    assert.equal(readJson(tests2).status, "fail");
    const restore2 = node(skillScript("checkpoint.mjs"), ["restore", run, "machines/2"]);
    assert.equal(restore2.status, 0, restore2.stderr);

    writeJson(
      join(run, "report.json"),
      report([
        {
          ...payment,
          outcome: "applied",
          reason: "",
          changed: readJson(join(run, "checkpoints", "machines", "1", "verify.json")).changed,
          artifacts: ["specs/tla/PaymentStatus.tla", "specs/tla/PaymentStatus.cfg"],
          checks: [
            { name: "model-check", result: tlc1 },
            { name: "tests", result: tests1 },
          ],
          review: { status: "not-run", reason: "no subagents in this run" },
        },
        {
          ...shipping,
          outcome: "proposed",
          reason: "the covering tests failed after the refactor",
          proposedChange: "Route shippingStatus through a SHIPPING table that keeps both guards.",
          artifacts: ["specs/tla/ShippingStatus.tla", "specs/tla/ShippingStatus.cfg"],
          checks: [{ name: "model-check", result: tlc2 }],
          review: { status: "not-run", reason: "the refactor was restored before review" },
        },
      ]),
    );
    const out = join(root, "docs", "plans", "2026-11-06-improving-codebases");
    const render = node(skillScript("render-report.mjs"), [join(run, "report.json"), out]);

    await t.test("the first edit stays, and the second edit is gone", () => {
      assert.equal(readFileSync(join(root, "src/orders.js"), "utf8"), ORDERS_PAYMENT_EXPLICIT);
    });

    await t.test("both specs stay", () => {
      assert.equal(readFileSync(join(root, "specs/tla/PaymentStatus.tla"), "utf8"), PAYMENT_TLA);
      assert.equal(readFileSync(join(root, "specs/tla/PaymentStatus.cfg"), "utf8"), SPEC_CFG);
      assert.equal(readFileSync(join(root, "specs/tla/ShippingStatus.tla"), "utf8"), SHIPPING_TLA);
      assert.equal(readFileSync(join(root, "specs/tla/ShippingStatus.cfg"), "utf8"), SPEC_CFG);
    });

    await t.test("report.md lists applied and proposed", () => {
      assert.equal(render.status, 0, render.stderr);
      assert.match(readFileSync(join(out, "report.md"), "utf8"), /applied/);
      assert.match(readFileSync(join(out, "report.md"), "utf8"), /proposed/);
    });

    await t.test("HEAD and git for-each-ref output are unchanged", () => {
      assert.equal(git(root, "rev-parse", "HEAD"), commit);
      assert.equal(git(root, "for-each-ref"), refsBefore);
    });
  });
});
