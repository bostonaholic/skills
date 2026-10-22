// Fails when update.mjs plans or runs a step for an install that is current or absent, adds a
// skill to a copy directory that lacked it, deletes or overwrites a copy without a backup,
// changes anything on a dry run or when the plan id differs, runs steps past a blocker or a
// failed step, runs the Claude Code or Codex commands out of order, or leaves a failure
// without a final `see` line. The release is a local bare repository read through file://, so its clone is shallow, the machine a fake
// HOME, and the Claude Code and Codex CLIs fake executables on PATH that log each call.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test, { after } from "node:test";
import { normalizeRemote } from "../skills/engineering/updating-bostonaholic-skills/scripts/update.mjs";

const SCRIPT = resolve("skills/engineering/updating-bostonaholic-skills/scripts/update.mjs");
const BASH = spawnSync("bash", ["-c", "command -v bash"], { encoding: "utf8" }).stdout.trim();
const GIT = spawnSync("bash", ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim();
const CAT = spawnSync("bash", ["-c", "command -v cat"], { encoding: "utf8" }).stdout.trim();
const ZERO_ID = "0".repeat(40);
const GIT_ENV = {
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.com",
};

function scratch(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "updating-bostonaholic-skills-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function write(path, text, mode) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  if (mode) chmodSync(path, mode);
}

function git(cwd, ...args) {
  const result = spawnSync(GIT, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...GIT_ENV },
  });
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

// The skills a release at `version` holds. `alpha` changes between 1.1.0 and 1.2.0.
function releaseFiles(version) {
  return {
    ".claude-plugin/plugin.json": JSON.stringify({
      name: "bostonaholic",
      version,
      skills: ["./skills/engineering/alpha", "./skills/productivity/beta"],
    }),
    "skills/engineering/alpha/SKILL.md": `alpha ${version}\n`,
    "skills/engineering/alpha/agents/openai.yaml": "interface: alpha\n",
    "skills/engineering/alpha/references/detail.md": `detail ${version}\n`,
    "skills/engineering/alpha/scripts/run.sh": "#!/bin/sh\n",
    "skills/productivity/beta/SKILL.md": "beta\n",
    "skills/productivity/beta/agents/openai.yaml": "interface: beta\n",
    "skills/deprecated/old/SKILL.md.disabled": "old\n",
  };
}

// A bare repository tagged v1.1.0 then v1.2.0 on main, plus a clone to commit from. Tests only
// read it (a clone or pull copies from it), so every test shares one.
let sharedRelease;
let sharedRoot;
after(() => {
  if (sharedRoot) rmSync(sharedRoot, { recursive: true, force: true });
});

function makeRelease() {
  sharedRelease ??= createRelease();
  return sharedRelease;
}

function createRelease() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "updating-bostonaholic-skills-release-")));
  sharedRoot = root;
  const work = join(root, "work");
  const bare = join(root, "release.git");
  mkdirSync(work);
  git(work, "init", "--quiet", "--initial-branch=main");
  for (const version of ["1.1.0", "1.2.0"]) {
    for (const [path, text] of Object.entries(releaseFiles(version))) {
      write(join(work, path), text, path.endsWith("run.sh") ? 0o755 : undefined);
    }
    git(work, "add", "-A");
    git(work, "commit", "--quiet", "-m", `release ${version}`);
    git(work, "tag", `v${version}`);
  }
  git(root, "init", "--quiet", "--bare", "--initial-branch=main", bare);
  git(work, "push", "--quiet", bare, "main", "--tags");
  return { bare, work, url: `file://${bare}` };
}

function writeExecutable(path, body) {
  write(path, `#!${BASH}\n${body}`, 0o755);
}

// A machine with a fake HOME. `tools` has a `git` wrapper, so a CLI is on PATH only when the
// test fakes it. A fake CLI logs its arguments to `log`, prints the listing file for
// `plugin list`, and fails with exit 7 and "boom" when its arguments contain FAKE_FAIL.
function makeMachine(t, release) {
  const root = scratch(t);
  const machine = {
    home: join(root, "home"),
    bin: join(root, "bin"),
    log: join(root, "calls.log"),
    release,
    clis: [],
  };
  mkdirSync(machine.home);
  writeExecutable(join(machine.bin, "git"), `exec ${GIT} "$@"\n`);
  writeFileSync(machine.log, "");
  return machine;
}

function fakeCli(machine, name, listing, { failList = false } = {}) {
  const listingFile = join(machine.home, `${name}-listing.json`);
  write(listingFile, JSON.stringify(listing));
  writeExecutable(
    join(machine.bin, name),
    `echo "${name} $*" >> "${machine.log}"
if [ "$1 $2" = "plugin list" ]; then
  ${failList ? 'echo "oops: listing broke" >&2; exit 1' : `${CAT} "${listingFile}"; exit 0`}
fi
case "$*" in *"$FAKE_FAIL"*) [ -n "$FAKE_FAIL" ] && { echo boom >&2; exit 7; } ;; esac
exit 0
`,
  );
}

function claudeListing(version, scope = "user") {
  return [{ id: "bostonaholic@skills", version, scope, enabled: true }];
}

function codexListing(version) {
  return {
    installed: [{ pluginId: "bostonaholic@skills", version, installed: true }],
    available: [{ pluginId: "bostonaholic@skills", installed: false }],
  };
}

function run(machine, args, env = {}) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: "utf8",
    env: {
      PATH: machine.bin,
      HOME: machine.home,
      UPDATING_BOSTONAHOLIC_SKILLS_SOURCE: machine.release.url,
      ...GIT_ENV,
      ...env,
    },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function plan(machine) {
  const result = run(machine, ["plan"]);
  return { ...result, id: /^Plan id: ([0-9a-f]{40})$/m.exec(result.stdout)?.[1] };
}

// Calls to the fake CLIs, without the listing reads that plan and apply make.
function mutations(machine) {
  return readFileSync(machine.log, "utf8")
    .split("\n")
    .filter((line) => line && !line.includes("plugin list"));
}

function copyDirectory(machine, harness) {
  return {
    opencode: join(machine.home, ".config/opencode/skills"),
    cursor: join(machine.home, ".cursor/skills"),
    "grok-bot": join(machine.home, "agent-data/workflows"),
  }[harness];
}

function backupRoot(machine) {
  const root = join(machine.home, ".local/share/updating-bostonaholic-skills/backups");
  if (!existsSync(root)) return undefined;
  return join(root, readdirSync(root)[0]);
}

function seeLine(stderr) {
  const lines = stderr.trimEnd().split("\n");
  const last = lines.at(-1);
  assert.match(last, /^see \//, `last stderr line is not a see line: ${last}`);
  assert.ok(existsSync(last.slice(4)), `${last} names a file that does not exist`);
}

// ---------------------------------------------------------------------------

test("plans nothing when every install is current, and apply runs nothing", (t) => {
  const machine = makeMachine(t, makeRelease());
  fakeCli(machine, "claude", claudeListing("1.2.0"));
  fakeCli(machine, "codex", codexListing("1.2.0"));
  const result = plan(machine);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Latest release: v1\.2\.0/);
  assert.match(result.stdout, /^Nothing to do\.$/m);
  assert.doesNotMatch(result.stdout, /Steps, in order/);
  const applied = run(machine, ["apply", result.id]);
  assert.equal(applied.status, 0);
  assert.deepEqual(mutations(machine), []);
});

test("an install ahead of the release counts as current", (t) => {
  const machine = makeMachine(t, makeRelease());
  fakeCli(machine, "claude", claudeListing("1.3.0"));
  assert.match(plan(machine).stdout, /^Nothing to do\.$/m);
});

test("plans and runs the Claude Code marketplace update before the plugin update", (t) => {
  const machine = makeMachine(t, makeRelease());
  fakeCli(machine, "claude", [...claudeListing("1.1.0"), ...claudeListing("1.0.0", "project")]);
  const result = plan(machine);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /1\. \[claude\] bostonaholic@skills 1\.1\.0 is behind v1\.2\.0/);
  assert.match(
    result.stdout,
    /\$ claude plugin marketplace update skills\n.*\$ claude plugin update bostonaholic@skills --scope user/s,
  );
  assert.match(result.stdout, /^left: claude: .* project scope/m);
  assert.deepEqual(mutations(machine), []);
  const applied = run(machine, ["apply", result.id]);
  assert.equal(applied.status, 0, applied.stderr);
  assert.match(applied.stdout, /\[1\/1\] \[claude\]/);
  assert.deepEqual(mutations(machine), [
    "claude plugin marketplace update skills",
    "claude plugin update bostonaholic@skills --scope user",
  ]);
});

test("plans and runs the Codex marketplace upgrade before adding the plugin", (t) => {
  const machine = makeMachine(t, makeRelease());
  fakeCli(machine, "codex", codexListing("1.1.0"));
  const result = plan(machine);
  assert.match(result.stdout, /\[codex\] bostonaholic@skills 1\.1\.0 is behind v1\.2\.0/);
  const applied = run(machine, ["apply", result.id]);
  assert.equal(applied.status, 0, applied.stderr);
  assert.deepEqual(mutations(machine), [
    "codex plugin marketplace upgrade skills",
    "codex plugin add bostonaholic@skills",
  ]);
});

test("replaces a differing copy, backs up the old one, and never adds a missing skill", (t) => {
  const machine = makeMachine(t, makeRelease());
  const directory = copyDirectory(machine, "opencode");
  write(join(directory, "alpha/SKILL.md"), "alpha stale\n");
  write(join(directory, "alpha/stray.md"), "stray\n");
  write(join(directory, "mine/SKILL.md"), "not in the collection\n");
  const result = plan(machine);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /\[opencode\] 1 of 2 collection copies .* differ from v1\.2\.0/);
  assert.equal(readFileSync(join(directory, "alpha/SKILL.md"), "utf8"), "alpha stale\n");
  const applied = run(machine, ["apply", result.id]);
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(readFileSync(join(directory, "alpha/SKILL.md"), "utf8"), "alpha 1.2.0\n");
  assert.equal(
    readFileSync(join(directory, "alpha/agents/openai.yaml"), "utf8"),
    "interface: alpha\n",
  );
  assert.ok(
    lstatSync(join(directory, "alpha/scripts/run.sh")).mode & 0o111,
    "script lost its exec bit",
  );
  assert.ok(!existsSync(join(directory, "alpha/stray.md")));
  assert.deepEqual(readdirSync(directory).sort(), ["alpha", "mine"]);
  const backups = backupRoot(machine);
  assert.equal(readFileSync(join(backups, "opencode/alpha/SKILL.md"), "utf8"), "alpha stale\n");
  assert.equal(readFileSync(join(backups, "opencode/alpha/stray.md"), "utf8"), "stray\n");
  assert.match(applied.stdout, new RegExp(`Backups: ${backups}`));
  assert.match(plan(machine).stdout, /^Nothing to do\.$/m);
});

test("a copy directory without a collection skill gets nothing", (t) => {
  const machine = makeMachine(t, makeRelease());
  write(join(copyDirectory(machine, "cursor"), "mine/SKILL.md"), "mine\n");
  const result = plan(machine);
  assert.match(result.stdout, /^Nothing to do\.$/m);
  assert.match(result.stdout, /Installs found: none/);
});

test("Grok Bot copies carry no agents/openai.yaml, and are compared without it", (t) => {
  const machine = makeMachine(t, makeRelease());
  const directory = copyDirectory(machine, "grok-bot");
  write(join(directory, "alpha/SKILL.md"), "alpha stale\n");
  write(join(directory, "beta/SKILL.md"), "beta\n");
  const result = plan(machine);
  assert.match(result.stdout, /\[grok-bot\] 1 of 2 collection copies/);
  const applied = run(machine, ["apply", result.id]);
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(
    readFileSync(join(directory, "alpha/references/detail.md"), "utf8"),
    "detail 1.2.0\n",
  );
  assert.ok(!existsSync(join(directory, "alpha/agents")), "a Grok Bot copy gained agents/");
  assert.match(plan(machine).stdout, /^Nothing to do\.$/m);
});

test("leaves retired skills, symlinks, and copies without SKILL.md alone and reports each", (t) => {
  const machine = makeMachine(t, makeRelease());
  const directory = copyDirectory(machine, "cursor");
  write(join(directory, "alpha/SKILL.md"), "alpha stale\n");
  write(join(directory, "old/SKILL.md"), "retired\n");
  write(join(machine.home, "elsewhere/SKILL.md"), "linked\n");
  symlinkSync(join(machine.home, "elsewhere"), join(directory, "beta"));
  const result = plan(machine);
  assert.match(result.stdout, /^left: .*cursor\/skills\/old: retired from the collection/m);
  assert.match(result.stdout, /^left: .*cursor\/skills\/beta: a symlink or file stands where/m);
  const applied = run(machine, ["apply", result.id]);
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(readFileSync(join(directory, "old/SKILL.md"), "utf8"), "retired\n");
  assert.ok(lstatSync(join(directory, "beta")).isSymbolicLink());
  assert.equal(readFileSync(join(directory, "alpha/SKILL.md"), "utf8"), "alpha 1.2.0\n");
});

test("apply refuses a plan id that does not match and changes nothing", (t) => {
  const machine = makeMachine(t, makeRelease());
  fakeCli(machine, "claude", claudeListing("1.1.0"));
  const directory = copyDirectory(machine, "opencode");
  write(join(directory, "alpha/SKILL.md"), "alpha stale\n");
  const applied = run(machine, ["apply", ZERO_ID]);
  assert.equal(applied.status, 3);
  assert.match(applied.stderr, /the plan changed since it was confirmed/);
  seeLine(applied.stderr);
  assert.deepEqual(mutations(machine), []);
  assert.equal(readFileSync(join(directory, "alpha/SKILL.md"), "utf8"), "alpha stale\n");
  assert.equal(backupRoot(machine), undefined);
});

test("DRY_RUN=true prints the steps and changes nothing", (t) => {
  const machine = makeMachine(t, makeRelease());
  fakeCli(machine, "claude", claudeListing("1.1.0"));
  const directory = copyDirectory(machine, "opencode");
  write(join(directory, "alpha/SKILL.md"), "alpha stale\n");
  const { id } = plan(machine);
  const applied = run(machine, ["apply", id], { DRY_RUN: "true" });
  assert.equal(applied.status, 0, applied.stderr);
  assert.match(applied.stdout, /\[dry run\] claude plugin marketplace update skills/);
  assert.match(applied.stdout, /\[2\/2\] \[opencode\]/);
  assert.deepEqual(mutations(machine), []);
  assert.equal(readFileSync(join(directory, "alpha/SKILL.md"), "utf8"), "alpha stale\n");
  assert.equal(backupRoot(machine), undefined);
});

test("a failed step stops the run, passes the tool's stderr through, and names the steps not run", (t) => {
  const machine = makeMachine(t, makeRelease());
  fakeCli(machine, "claude", claudeListing("1.1.0"));
  fakeCli(machine, "codex", codexListing("1.1.0"));
  const { id } = plan(machine);
  const applied = run(machine, ["apply", id], { FAKE_FAIL: "plugin update" });
  assert.equal(applied.status, 1);
  assert.match(applied.stderr, /^boom$/m);
  assert.match(applied.stderr, /step 1 of 2 failed: \[claude\]/);
  assert.match(applied.stderr, /not run: \[codex\]/);
  assert.ok(applied.stderr.indexOf("boom") < applied.stderr.indexOf("step 1 of 2 failed"));
  seeLine(applied.stderr);
  assert.ok(!mutations(machine).some((call) => call.startsWith("codex")));
});

test("an install whose CLI is not on PATH blocks the plan", (t) => {
  const machine = makeMachine(t, makeRelease());
  write(
    join(machine.home, ".claude/plugins/installed_plugins.json"),
    JSON.stringify({ plugins: { "bostonaholic@skills": [{ scope: "user", version: "1.1.0" }] } }),
  );
  write(join(copyDirectory(machine, "opencode"), "alpha/SKILL.md"), "alpha stale\n");
  const result = plan(machine);
  assert.equal(result.status, 4);
  assert.match(result.stdout, /Blocked; nothing runs until each is resolved/);
  assert.match(
    result.stdout,
    /claude: bostonaholic@skills is installed but the claude CLI is not on PATH/,
  );
  const applied = run(machine, ["apply", result.id]);
  assert.equal(applied.status, 4);
  seeLine(applied.stderr);
  assert.equal(
    readFileSync(join(copyDirectory(machine, "opencode"), "alpha/SKILL.md"), "utf8"),
    "alpha stale\n",
  );
});

// ---------------------------------------------------------------------------
// Unreadable listings and missing CLIs

function claudeEvidence(machine) {
  write(
    join(machine.home, ".claude/plugins/installed_plugins.json"),
    JSON.stringify({ plugins: { "bostonaholic@skills": [{ scope: "user", version: "1.1.0" }] } }),
  );
}

function codexEvidence(machine) {
  write(
    join(machine.home, ".codex/config.toml"),
    '[plugins."bostonaholic@skills"]\nenabled = true\n',
  );
}

test("a Codex install without the codex CLI blocks the plan", (t) => {
  const machine = makeMachine(t, makeRelease());
  codexEvidence(machine);
  const result = plan(machine);
  assert.equal(result.status, 4);
  assert.match(
    result.stdout,
    /codex: bostonaholic@skills is installed but the codex CLI is not on PATH/,
  );
  const applied = run(machine, ["apply", result.id]);
  assert.equal(applied.status, 4);
  seeLine(applied.stderr);
});

test("a missing CLI with no install on file is not a blocker", (t) => {
  const machine = makeMachine(t, makeRelease());
  assert.match(plan(machine).stdout, /^Nothing to do\.$/m);
});

for (const [harness, evidence, listing] of [
  ["claude", claudeEvidence, claudeListing("1.1.0")],
  ["codex", codexEvidence, codexListing("1.1.0")],
]) {
  test(`an unreadable ${harness} listing blocks the plan when its files show an install`, (t) => {
    const machine = makeMachine(t, makeRelease());
    fakeCli(machine, harness, listing, { failList: true });
    evidence(machine);
    const result = plan(machine);
    assert.equal(result.status, 4);
    assert.match(
      result.stdout,
      new RegExp(`${harness}: cannot read '${harness} plugin list --json': oops: listing broke`),
    );
  });

  test(`an unreadable ${harness} listing with no install on file is skipped and blocks nothing`, (t) => {
    const machine = makeMachine(t, makeRelease());
    fakeCli(machine, harness, listing, { failList: true });
    const other = harness === "claude" ? "codex" : "claude";
    fakeCli(machine, other, other === "claude" ? claudeListing("1.1.0") : codexListing("1.1.0"));
    const result = plan(machine);
    assert.equal(result.status, 0);
    assert.match(
      result.stdout,
      new RegExp(`^left: ${harness}: skipped, no install found and cannot read`, "m"),
    );
    assert.match(
      result.stdout,
      new RegExp(`\\[${other}\\] bostonaholic@skills 1\\.1\\.0 is behind`),
    );
    assert.doesNotMatch(result.stdout, /Blocked/);
  });
}

// ---------------------------------------------------------------------------
// Cursor plugin clone

function cursorClone(machine, behind) {
  const clone = join(machine.home, ".cursor/plugins/local/bostonaholic");
  mkdirSync(dirname(clone), { recursive: true });
  git(machine.home, "clone", "--quiet", machine.release.url, clone);
  if (behind) git(clone, "reset", "--quiet", "--hard", "v1.1.0");
  return clone;
}

test("fast-forwards a clean Cursor plugin clone that is behind", (t) => {
  const machine = makeMachine(t, makeRelease());
  const clone = cursorClone(machine, true);
  const result = plan(machine);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /\[cursor-plugin\] .* is behind v1\.2\.0/);
  assert.match(result.stdout, /\$ git -C \S+ pull --ff-only/);
  const applied = run(machine, ["apply", result.id]);
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(
    git(clone, "rev-parse", "HEAD"),
    git(machine.release.work, "rev-parse", "v1.2.0^{commit}"),
  );
  assert.match(plan(machine).stdout, /^Nothing to do\.$/m);
});

test("a current Cursor plugin clone needs nothing", (t) => {
  const machine = makeMachine(t, makeRelease());
  cursorClone(machine, false);
  assert.match(plan(machine).stdout, /^Nothing to do\.$/m);
});

test("a dirty Cursor plugin clone blocks the plan with exit 4 and changes nothing", (t) => {
  const machine = makeMachine(t, makeRelease());
  fakeCli(machine, "claude", claudeListing("1.1.0"));
  const clone = cursorClone(machine, true);
  write(join(clone, "scratch.txt"), "local work\n");
  const result = plan(machine);
  assert.equal(result.status, 4);
  assert.match(result.stdout, /cursor-plugin: .*has uncommitted changes/);
  const applied = run(machine, ["apply", result.id]);
  assert.equal(applied.status, 4);
  seeLine(applied.stderr);
  assert.equal(
    git(clone, "rev-parse", "HEAD"),
    git(machine.release.work, "rev-parse", "v1.1.0^{commit}"),
  );
  assert.deepEqual(mutations(machine), [], "the blocked plan still ran the Claude Code step");
});

test("a diverged Cursor plugin clone blocks the plan", (t) => {
  const machine = makeMachine(t, makeRelease());
  const clone = cursorClone(machine, true);
  write(join(clone, "local.txt"), "committed locally\n");
  git(clone, "add", "-A");
  git(clone, "commit", "--quiet", "-m", "local");
  const result = plan(machine);
  assert.equal(result.status, 4);
  assert.match(result.stdout, /cannot fast-forward/);
});

function blockedBy(machine, pattern) {
  const result = plan(machine);
  assert.equal(result.status, 4, result.stdout);
  assert.match(result.stdout, pattern);
  const applied = run(machine, ["apply", result.id]);
  assert.equal(applied.status, 4);
  seeLine(applied.stderr);
}

test("a Cursor plugin directory that is not a git clone blocks the plan", (t) => {
  const machine = makeMachine(t, makeRelease());
  write(join(machine.home, ".cursor/plugins/local/bostonaholic/README.md"), "a copy\n");
  blockedBy(machine, /cursor-plugin: .*is not a git clone/);
});

test("a Cursor plugin clone of another origin blocks the plan", (t) => {
  const machine = makeMachine(t, makeRelease());
  const clone = cursorClone(machine, true);
  git(clone, "remote", "set-url", "origin", "https://github.com/someone/else.git");
  blockedBy(machine, /cursor-plugin: .*has origin https:\/\/github\.com\/someone\/else\.git/);
});

test("a Cursor plugin clone on a detached HEAD blocks the plan", (t) => {
  const machine = makeMachine(t, makeRelease());
  const clone = cursorClone(machine, true);
  git(clone, "checkout", "--quiet", "--detach", "v1.1.0");
  blockedBy(machine, /cursor-plugin: .*has a detached HEAD/);
});

test("a Cursor plugin clone whose branch has no upstream blocks the plan", (t) => {
  const machine = makeMachine(t, makeRelease());
  const clone = cursorClone(machine, true);
  git(clone, "branch", "--unset-upstream");
  blockedBy(machine, /cursor-plugin: .*has no upstream branch/);
});

test("ssh and https GitHub origins, with or without .git or a slash, name the same remote", () => {
  const forms = [
    "https://github.com/bostonaholic/skills.git",
    "https://github.com/bostonaholic/skills",
    "https://github.com/bostonaholic/skills/",
    "git@github.com:bostonaholic/skills.git",
    "ssh://git@github.com/bostonaholic/skills.git\n",
  ];
  for (const form of forms)
    assert.equal(normalizeRemote(form), "https://github.com/bostonaholic/skills", form);
  assert.notEqual(normalizeRemote("git@github.com:someone/skills.git"), normalizeRemote(forms[0]));
});

// ---------------------------------------------------------------------------

test("a usage error exits 2 with a final see line", (t) => {
  const machine = makeMachine(t, makeRelease());
  for (const args of [[], ["apply"], ["apply", "abc"], ["plan", "extra"]]) {
    const result = run(machine, args);
    assert.equal(result.status, 2, args.join(" "));
    assert.match(result.stderr, /usage: update\.mjs plan \| update\.mjs apply <plan-id>/);
    seeLine(result.stderr);
  }
});

test("an unreadable release source fails with git's error and a see line", (t) => {
  const machine = makeMachine(t, makeRelease());
  const result = run(machine, ["plan"], {
    UPDATING_BOSTONAHOLIC_SKILLS_SOURCE: join(machine.home, "no-such-repository.git"),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^fatal: /m);
  assert.match(result.stderr, /cannot list the release tags/);
  seeLine(result.stderr);
});
