// Acceptance tests for skills/engineering/improving-codebases/scripts/checkpoint.mjs: a failed make
// step undoes only its own work, verify names every path outside the step's bounds, and the script
// stops on a tree it cannot undo. Each case runs a copy of the skill's scripts beside a synthetic
// lane brief, so no case reads the real brief. Fixture commits use a /dev/null global config.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPTS = fileURLToPath(
  new URL("../skills/engineering/improving-codebases/scripts/", import.meta.url),
);
const CHECKPOINT = join(SCRIPTS, "checkpoint.mjs");

const GIT_ENV = {
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.invalid",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.invalid",
};

// A makes: true lane whose kept artifacts are .tla and .cfg files.
const MACHINES_BRIEF = `---
lane: machines
summary: Finds implicit state machines
makes: true
report: findings
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
`;

function tempDir(t, prefix) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
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

function write(root, path, text) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

function read(root, path) {
  return readFileSync(join(root, path), "utf8");
}

// A git repository with one commit holding `files`, plus a <run> holding report.json, plus a copy
// of the skill's scripts beside the synthetic brief. `checkpoint(command, id)` runs the copy.
function checkpointFixture(t, { files, paths = ["."], gaps = [], coveringTests = [] }) {
  assert.ok(existsSync(CHECKPOINT), `missing ${CHECKPOINT}`);
  const skill = tempDir(t, "improving-codebases-skill-");
  cpSync(SCRIPTS, join(skill, "scripts"), { recursive: true });
  write(skill, "references/lanes/machines.md", MACHINES_BRIEF);

  const root = tempDir(t, "improving-codebases-repo-");
  for (const [path, text] of Object.entries(files)) write(root, path, text);
  git(root, "init", "-q", "-b", "main");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "fixture");

  const run = tempDir(t, "improving-codebases-run-");
  const finding = (id) => ({
    id,
    lane: "machines",
    title: `machine ${id}`,
    citations: [],
    evidence: [],
    coveringTests,
    outcome: "deferred",
    reason: "make step pending",
  });
  const report = {
    version: 1,
    skill: "improving-codebases",
    scope: { root, commit: git(root, "rev-parse", "HEAD"), date: "2026-11-06", paths, dirty: [] },
    groups: [],
    lanes: [{ lane: "machines", ran: [], failed: [] }],
    gaps,
    findings: [finding("machines/1"), finding("machines/2")],
  };
  writeFileSync(join(run, "report.json"), `${JSON.stringify(report, null, 2)}\n`);

  const checkpoint = (...args) => {
    const result = spawnSync(
      process.execPath,
      [join(skill, "scripts", "checkpoint.mjs"), ...args],
      {
        encoding: "utf8",
        env: process.env,
        timeout: 60_000,
      },
    );
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  };
  return { root, run, checkpoint };
}

// The make return a complete step leaves at <run>/make/<id>.json.
function saveMakeReturn(run, id, artifacts) {
  write(
    run,
    `make/${id}.json`,
    `${JSON.stringify({ artifacts, proposedChange: "Route the holder through one table.", checks: [], reason: "" })}\n`,
  );
}

function verifyJson(run, id) {
  return JSON.parse(read(run, `checkpoints/${id}/verify.json`));
}

describe("slice 3: undo a failed make step", () => {
  test("checkpoint.mjs restore returns each changed path to its saved state", async (t) => {
    await t.test(
      "a tracked edit, a tracked delete, and a changed untracked file return to their saved bytes",
      (st) => {
        const fx = checkpointFixture(st, {
          files: { "src/a.js": "a at head\n", "src/b.js": "b at head\n" },
        });
        write(fx.root, "notes.txt", "draft one\n");
        assert.equal(fx.checkpoint("save", fx.run, "machines/1").status, 0);
        write(fx.root, "src/a.js", "a after the step\n");
        unlinkSync(join(fx.root, "src/b.js"));
        write(fx.root, "notes.txt", "draft two\n");

        const restore = fx.checkpoint("restore", fx.run, "machines/1");

        assert.equal(restore.status, 0, restore.stderr);
        assert.equal(read(fx.root, "src/a.js"), "a at head\n");
        assert.equal(read(fx.root, "src/b.js"), "b at head\n");
        assert.equal(read(fx.root, "notes.txt"), "draft one\n");
      },
    );

    await t.test("a new file is deleted", (st) => {
      const fx = checkpointFixture(st, { files: { "src/a.js": "a at head\n" } });
      assert.equal(fx.checkpoint("save", fx.run, "machines/1").status, 0);
      write(fx.root, "src/helper.js", "new helper\n");

      const restore = fx.checkpoint("restore", fx.run, "machines/1");

      assert.equal(restore.status, 0, restore.stderr);
      assert.equal(existsSync(join(fx.root, "src/helper.js")), false);
    });

    await t.test(
      "a new file with a lane suffix, listed under artifacts in the saved return, stays",
      (st) => {
        const fx = checkpointFixture(st, { files: { "src/a.js": "a at head\n" } });
        assert.equal(fx.checkpoint("save", fx.run, "machines/1").status, 0);
        write(fx.root, "specs/tla/Orders.tla", "---- MODULE Orders ----\n====\n");
        saveMakeReturn(fx.run, "machines/1", ["specs/tla/Orders.tla"]);

        const restore = fx.checkpoint("restore", fx.run, "machines/1");

        assert.equal(restore.status, 0, restore.stderr);
        assert.equal(read(fx.root, "specs/tla/Orders.tla"), "---- MODULE Orders ----\n====\n");
      },
    );

    await t.test("a tracked file listed under artifacts is restored all the same", (st) => {
      const fx = checkpointFixture(st, {
        files: { "specs/tla/Orders.tla": "---- MODULE Orders ----\n\\* at head\n====\n" },
      });
      assert.equal(fx.checkpoint("save", fx.run, "machines/1").status, 0);
      write(fx.root, "specs/tla/Orders.tla", "---- MODULE Orders ----\n\\* rewritten\n====\n");
      saveMakeReturn(fx.run, "machines/1", ["specs/tla/Orders.tla"]);

      const restore = fx.checkpoint("restore", fx.run, "machines/1");

      assert.equal(restore.status, 0, restore.stderr);
      assert.equal(
        read(fx.root, "specs/tla/Orders.tla"),
        "---- MODULE Orders ----\n\\* at head\n====\n",
      );
    });

    await t.test("a new file with no lane suffix, listed under artifacts, is deleted", (st) => {
      const fx = checkpointFixture(st, { files: { "src/a.js": "a at head\n" } });
      assert.equal(fx.checkpoint("save", fx.run, "machines/1").status, 0);
      write(fx.root, "src/machine.js", "new source file\n");
      saveMakeReturn(fx.run, "machines/1", ["src/machine.js"]);

      const restore = fx.checkpoint("restore", fx.run, "machines/1");

      assert.equal(restore.status, 0, restore.stderr);
      assert.equal(existsSync(join(fx.root, "src/machine.js")), false);
    });

    await t.test("no saved return means no file is kept", (st) => {
      const fx = checkpointFixture(st, { files: { "src/a.js": "a at head\n" } });
      assert.equal(fx.checkpoint("save", fx.run, "machines/1").status, 0);
      write(fx.root, "specs/tla/Orders.tla", "---- MODULE Orders ----\n====\n");

      const restore = fx.checkpoint("restore", fx.run, "machines/1");

      assert.equal(restore.status, 0, restore.stderr);
      assert.equal(existsSync(join(fx.root, "specs/tla/Orders.tla")), false);
    });

    await t.test("two machines in one file: a restore of the second keeps the first", (st) => {
      const fx = checkpointFixture(st, {
        files: { "src/orders.js": "payment implicit\nshipping implicit\n" },
      });
      assert.equal(fx.checkpoint("save", fx.run, "machines/1").status, 0);
      write(fx.root, "src/orders.js", "payment explicit\nshipping implicit\n");
      assert.equal(fx.checkpoint("save", fx.run, "machines/2").status, 0);
      write(fx.root, "src/orders.js", "payment explicit\nshipping explicit\n");

      const restore = fx.checkpoint("restore", fx.run, "machines/2");

      assert.equal(restore.status, 0, restore.stderr);
      assert.equal(read(fx.root, "src/orders.js"), "payment explicit\nshipping implicit\n");
    });

    await t.test("a step that reverts an earlier kept edit to HEAD gets that edit back", (st) => {
      const fx = checkpointFixture(st, {
        files: { "src/orders.js": "payment implicit\nshipping implicit\n" },
      });
      write(fx.root, "src/orders.js", "payment explicit\nshipping implicit\n");
      assert.equal(fx.checkpoint("save", fx.run, "machines/2").status, 0);
      write(fx.root, "src/orders.js", "payment implicit\nshipping implicit\n");

      const restore = fx.checkpoint("restore", fx.run, "machines/2");

      assert.equal(restore.status, 0, restore.stderr);
      assert.equal(read(fx.root, "src/orders.js"), "payment explicit\nshipping implicit\n");
    });
  });

  test("checkpoint.mjs verify names every path outside the step's bounds", async (t) => {
    await t.test("a change inside the scope: exit 0, and changed lists it", (st) => {
      const fx = checkpointFixture(st, {
        files: { "src/a.js": "a at head\n", "lib/b.js": "b at head\n" },
        paths: ["src"],
      });
      assert.equal(fx.checkpoint("save", fx.run, "machines/1").status, 0);
      write(fx.root, "src/a.js", "a after the step\n");

      const verify = fx.checkpoint("verify", fx.run, "machines/1");

      assert.equal(verify.status, 0, verify.stderr);
      assert.deepEqual(verifyJson(fx.run, "machines/1").changed, ["src/a.js"]);
    });

    await t.test("a path reverted to HEAD counts as changed", (st) => {
      const fx = checkpointFixture(st, { files: { "src/a.js": "a at head\n" } });
      write(fx.root, "src/a.js", "a kept from an earlier step\n");
      assert.equal(fx.checkpoint("save", fx.run, "machines/2").status, 0);
      write(fx.root, "src/a.js", "a at head\n");

      const verify = fx.checkpoint("verify", fx.run, "machines/2");

      assert.equal(verify.status, 0, verify.stderr);
      assert.deepEqual(verifyJson(fx.run, "machines/2").changed, ["src/a.js"]);
    });

    await t.test("a change outside scope.paths: exit 3, naming the path", (st) => {
      const fx = checkpointFixture(st, {
        files: { "src/a.js": "a at head\n", "lib/b.js": "b at head\n" },
        paths: ["src"],
      });
      assert.equal(fx.checkpoint("save", fx.run, "machines/1").status, 0);
      write(fx.root, "lib/b.js", "b after the step\n");

      const verify = fx.checkpoint("verify", fx.run, "machines/1");

      assert.equal(verify.status, 3, verify.stderr);
      assert.deepEqual(verifyJson(fx.run, "machines/1").escaped, ["lib/b.js"]);
    });

    await t.test("a change under a gaps path: exit 3, naming the path", (st) => {
      const fx = checkpointFixture(st, {
        files: { "src/a.js": "a at head\n", "src/vendor/left-pad.js": "vendored at head\n" },
        gaps: [{ path: "src/vendor", reason: "linguist-vendored in .gitattributes" }],
      });
      assert.equal(fx.checkpoint("save", fx.run, "machines/1").status, 0);
      write(fx.root, "src/vendor/left-pad.js", "vendored after the step\n");

      const verify = fx.checkpoint("verify", fx.run, "machines/1");

      assert.equal(verify.status, 3, verify.stderr);
      assert.deepEqual(verifyJson(fx.run, "machines/1").escaped, ["src/vendor/left-pad.js"]);
    });

    await t.test("a change to a coveringTests path: exit 3, naming the path", (st) => {
      const fx = checkpointFixture(st, {
        files: { "src/a.js": "a at head\n", "src/a.test.js": "test at head\n" },
        coveringTests: ["src/a.test.js:1"],
      });
      assert.equal(fx.checkpoint("save", fx.run, "machines/1").status, 0);
      write(fx.root, "src/a.test.js", "test weakened by the step\n");

      const verify = fx.checkpoint("verify", fx.run, "machines/1");

      assert.equal(verify.status, 3, verify.stderr);
      assert.deepEqual(verifyJson(fx.run, "machines/1").escaped, ["src/a.test.js"]);
    });

    await t.test(
      "a new spec outside the scope, listed under artifacts: exit 0, and changed omits it",
      (st) => {
        const fx = checkpointFixture(st, { files: { "src/a.js": "a at head\n" }, paths: ["src"] });
        assert.equal(fx.checkpoint("save", fx.run, "machines/1").status, 0);
        write(fx.root, "src/a.js", "a after the step\n");
        write(fx.root, "specs/tla/Orders.tla", "---- MODULE Orders ----\n====\n");
        saveMakeReturn(fx.run, "machines/1", ["specs/tla/Orders.tla"]);

        const verify = fx.checkpoint("verify", fx.run, "machines/1");

        assert.equal(verify.status, 0, verify.stderr);
        assert.deepEqual(verifyJson(fx.run, "machines/1").changed, ["src/a.js"]);
      },
    );

    await t.test("a moved HEAD: exit 3, and problem names HEAD", (st) => {
      const fx = checkpointFixture(st, { files: { "src/a.js": "a at head\n" } });
      assert.equal(fx.checkpoint("save", fx.run, "machines/1").status, 0);
      git(fx.root, "commit", "-q", "--allow-empty", "-m", "a commit the skill must never make");

      const verify = fx.checkpoint("verify", fx.run, "machines/1");

      assert.equal(verify.status, 3, verify.stderr);
      assert.match(verifyJson(fx.run, "machines/1").problem, /HEAD/);
    });

    await t.test("a changed ref: exit 3, and problem names refs", (st) => {
      const fx = checkpointFixture(st, { files: { "src/a.js": "a at head\n" } });
      assert.equal(fx.checkpoint("save", fx.run, "machines/1").status, 0);
      git(fx.root, "tag", "made-by-the-step");

      const verify = fx.checkpoint("verify", fx.run, "machines/1");

      assert.equal(verify.status, 3, verify.stderr);
      assert.match(verifyJson(fx.run, "machines/1").problem, /refs/);
    });
  });

  test("checkpoint.mjs stops on what it cannot undo", async (t) => {
    await t.test(
      "a make step that replaced a directory with a symlink: restore exits 1, naming the path, and writes through no link",
      (st) => {
        const fx = checkpointFixture(st, { files: { "src/a.js": "a at head\n" } });
        const outside = tempDir(st, "improving-codebases-outside-");
        writeFileSync(join(outside, "a.js"), "outside the repository\n");
        assert.equal(fx.checkpoint("save", fx.run, "machines/1").status, 0);
        rmSync(join(fx.root, "src"), { recursive: true });
        symlinkSync(outside, join(fx.root, "src"));

        const restore = fx.checkpoint("restore", fx.run, "machines/1");

        assert.equal(restore.status, 1, restore.stderr);
        assert.match(restore.stderr, /src\/a\.js/);
        assert.equal(readFileSync(join(outside, "a.js"), "utf8"), "outside the repository\n");
      },
    );

    await t.test(
      "a make step that replaced a tracked symlink with a directory: restore brings the link back and deletes nothing through it",
      (st) => {
        const fx = checkpointFixture(st, { files: { "src/a.js": "a at head\n" } });
        const outside = tempDir(st, "improving-codebases-outside-");
        writeFileSync(join(outside, "a.js"), "outside the repository\n");
        symlinkSync(outside, join(fx.root, "lnk"));
        git(fx.root, "add", "lnk");
        git(fx.root, "commit", "-q", "-m", "a tracked symlink");
        assert.equal(fx.checkpoint("save", fx.run, "machines/1").status, 0);
        unlinkSync(join(fx.root, "lnk"));
        write(fx.root, "lnk/a.js", "made by the step\n");

        const restore = fx.checkpoint("restore", fx.run, "machines/1");

        assert.equal(restore.status, 0, restore.stderr);
        assert.equal(readlinkSync(join(fx.root, "lnk")), outside);
        assert.equal(readFileSync(join(outside, "a.js"), "utf8"), "outside the repository\n");
      },
    );

    await t.test(
      "a saved file under a link that restore itself recreates: exit 1, and nothing is written through the link",
      (st) => {
        const fx = checkpointFixture(st, { files: { "src/a.js": "a at head\n" } });
        const outside = tempDir(st, "improving-codebases-outside-");
        writeFileSync(join(outside, "a.js"), "outside the repository\n");
        assert.equal(fx.checkpoint("save", fx.run, "machines/1").status, 0);
        const dir = join(fx.run, "checkpoints", "machines", "1");
        const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
        writeFileSync(join(dir, "files", "through-link"), "written through the link\n");
        manifest.paths.push(
          { path: "lnk", kind: "link", target: outside },
          { path: "lnk/a.js", kind: "file", mode: 0o644, copy: "files/through-link" },
        );
        writeFileSync(join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

        const restore = fx.checkpoint("restore", fx.run, "machines/1");

        assert.equal(restore.status, 1, restore.stderr);
        assert.match(restore.stderr, /lnk\/a\.js/);
        assert.equal(readFileSync(join(outside, "a.js"), "utf8"), "outside the repository\n");
      },
    );

    await t.test("a HEAD that moved before restore: exit 1, naming HEAD", (st) => {
      const fx = checkpointFixture(st, { files: { "src/a.js": "a at head\n" } });
      assert.equal(fx.checkpoint("save", fx.run, "machines/1").status, 0);
      write(fx.root, "src/a.js", "a after the step\n");
      git(fx.root, "commit", "-q", "--allow-empty", "-m", "a commit the skill must never make");

      const restore = fx.checkpoint("restore", fx.run, "machines/1");

      assert.equal(restore.status, 1, restore.stderr);
      assert.match(restore.stderr, /HEAD/);
    });

    await t.test("a ref that moved before restore: exit 1, naming refs", (st) => {
      const fx = checkpointFixture(st, { files: { "src/a.js": "a at head\n" } });
      assert.equal(fx.checkpoint("save", fx.run, "machines/1").status, 0);
      write(fx.root, "src/a.js", "a after the step\n");
      git(fx.root, "tag", "made-by-the-step");

      const restore = fx.checkpoint("restore", fx.run, "machines/1");

      assert.equal(restore.status, 1, restore.stderr);
      assert.match(restore.stderr, /refs/);
    });

    await t.test("a <run> that save cannot write: exit 1", (st) => {
      const fx = checkpointFixture(st, { files: { "src/a.js": "a at head\n" } });
      writeFileSync(
        join(fx.run, "checkpoints"),
        "a file where the checkpoints directory belongs\n",
      );

      const save = fx.checkpoint("save", fx.run, "machines/1");

      assert.equal(save.status, 1, save.stderr);
    });

    await t.test("an <id> not in <lane>/<n> form: exit 2", (st) => {
      const fx = checkpointFixture(st, { files: { "src/a.js": "a at head\n" } });

      const save = fx.checkpoint("save", fx.run, "../1");

      assert.equal(save.status, 2, save.stderr);
    });

    await t.test("no arguments: exit 2", (st) => {
      const fx = checkpointFixture(st, { files: { "src/a.js": "a at head\n" } });

      const run = fx.checkpoint();

      assert.equal(run.status, 2, run.stderr);
    });
  });
});

describe("slice 5: review each refactor independently", () => {
  test("verify copies the pre-step version of each changed path to before/", async (t) => {
    await t.test("a tracked edit and a tracked delete: before/ holds the pre-step bytes", (st) => {
      const fx = checkpointFixture(st, {
        files: { "src/a.js": "a at head\n", "src/b.js": "b at head\n" },
      });
      assert.equal(fx.checkpoint("save", fx.run, "machines/1").status, 0);
      write(fx.root, "src/a.js", "a after the step\n");
      unlinkSync(join(fx.root, "src/b.js"));

      const verify = fx.checkpoint("verify", fx.run, "machines/1");

      assert.equal(verify.status, 0, verify.stderr);
      assert.equal(read(fx.run, "checkpoints/machines/1/before/src/a.js"), "a at head\n");
      assert.equal(read(fx.run, "checkpoints/machines/1/before/src/b.js"), "b at head\n");
    });

    await t.test("a path reverted to HEAD: before/ holds the earlier kept edit", (st) => {
      const fx = checkpointFixture(st, { files: { "src/a.js": "a at head\n" } });
      write(fx.root, "src/a.js", "a kept from an earlier step\n");
      assert.equal(fx.checkpoint("save", fx.run, "machines/2").status, 0);
      write(fx.root, "src/a.js", "a at head\n");

      const verify = fx.checkpoint("verify", fx.run, "machines/2");

      assert.equal(verify.status, 0, verify.stderr);
      assert.equal(
        read(fx.run, "checkpoints/machines/2/before/src/a.js"),
        "a kept from an earlier step\n",
      );
    });

    await t.test("a new file and a kept artifact: before/ omits them", (st) => {
      const fx = checkpointFixture(st, { files: { "src/a.js": "a at head\n" } });
      assert.equal(fx.checkpoint("save", fx.run, "machines/1").status, 0);
      write(fx.root, "src/a.js", "a after the step\n");
      write(fx.root, "src/helper.js", "new helper\n");
      write(fx.root, "specs/tla/Orders.tla", "---- MODULE Orders ----\n====\n");
      saveMakeReturn(fx.run, "machines/1", ["specs/tla/Orders.tla"]);

      const verify = fx.checkpoint("verify", fx.run, "machines/1");

      assert.equal(verify.status, 0, verify.stderr);
      assert.equal(existsSync(join(fx.run, "checkpoints/machines/1/before/src/a.js")), true);
      assert.equal(existsSync(join(fx.run, "checkpoints/machines/1/before/src/helper.js")), false);
      assert.equal(
        existsSync(join(fx.run, "checkpoints/machines/1/before/specs/tla/Orders.tla")),
        false,
      );
    });
  });
});
