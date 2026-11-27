// Fails when list.sh stops exiting 64 on a usage error or 69 on a missing tool; proposes
// deleting a branch with unpushed commits or keeps a squash-merged one; proposes removing
// an unmerged worktree or one changed in the last 7 days, or keeps a merged one older than
// that; or stops printing a warning row for a scratch tree with a commit from the last day.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const LIST = resolve("skills/engineering/cleaning-up-sessions/scripts/list.sh");
const BASH = spawnSync("bash", ["-c", "command -v bash"], { encoding: "utf8" }).stdout.trim();
const DAY = 86400;
const OLD = Math.floor(Date.now() / 1000) - 30 * DAY;

function scratch(t, base = tmpdir()) {
  const dir = realpathSync(mkdtempSync(join(base, "cleaning-up-sessions-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function git(cwd, args, epoch) {
  const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
  if (epoch) env.GIT_AUTHOR_DATE = env.GIT_COMMITTER_DATE = `@${epoch} +0000`;
  return execFileSync(
    "git",
    ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args],
    { cwd, env, encoding: "utf8" },
  ).trim();
}

function commit(cwd, name, epoch) {
  writeFileSync(join(cwd, name), name);
  git(cwd, ["add", name]);
  git(cwd, ["commit", "-qm", name], epoch);
  return git(cwd, ["rev-parse", "HEAD"]);
}

// A clone of a bare origin with one pushed commit on main, dated 30 days ago.
function repo(t) {
  const dir = scratch(t);
  git(dir, ["init", "-q", "--bare", "-b", "main", "origin.git"]);
  git(dir, ["clone", "-q", "origin.git", "work"]);
  const work = join(dir, "work");
  git(work, ["checkout", "-qb", "main"]);
  commit(work, "base", OLD);
  git(work, ["push", "-q", "-u", "origin", "main"]);
  git(work, ["remote", "set-head", "origin", "main"]);
  return { dir, work };
}

// A PATH with a fake gh that prints each `merged` SHA whose branch or SHA matches the
// --head or --search value, a fake lsof that lists no listener, then the host PATH.
function fakeBin(dir, merged = {}) {
  const bin = join(dir, "bin");
  mkdirSync(bin);
  const table = Object.entries(merged)
    .map(([branch, sha]) => `${branch} ${sha}`)
    .join("\n");
  writeFileSync(join(dir, "merged.txt"), `${table}\n`);
  writeFileSync(
    join(bin, "gh"),
    `#!${BASH}
while [ $# -gt 0 ]; do
  case $1 in --head|--search) key=$2; shift ;; esac
  shift
done
awk -v k="$key" '$1 == k || $2 == k { print $2 }' ${JSON.stringify(join(dir, "merged.txt"))}
`,
  );
  writeFileSync(join(bin, "lsof"), `#!${BASH}\nexit 0\n`);
  for (const tool of ["gh", "lsof"]) chmodSync(join(bin, tool), 0o755);
  return `${bin}:${process.env.PATH}`;
}

function list(t, { cwd, args = [], path, scratchRoot }) {
  const result = spawnSync(BASH, [LIST, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      PATH: path,
      HOME: cwd,
      GIT_CONFIG_GLOBAL: "/dev/null",
      CLEANUP_SCRATCH_ROOT: scratchRoot ?? scratch(t),
    },
  });
  const rows = result.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [kind, target, age, merged, action, command] = line.split("\t");
      return { kind, target, age, merged, action, command };
    });
  return { result, rows };
}

function rowFor(rows, kind, target) {
  const found = rows.find((row) => row.kind === kind && row.target === target);
  assert.ok(found, `no ${kind} row for ${target}`);
  return found;
}

// Dates a worktree's admin files `epoch`, so it reads as unchanged since then.
function age(work, name, epoch) {
  const admin = join(work, ".git", "worktrees", name);
  for (const file of readdirSync(admin)) utimesSync(join(admin, file), epoch, epoch);
}

test("list.sh exits 64 given more than one argument", (t) => {
  const { work } = repo(t);
  const { result } = list(t, { cwd: work, args: [".", "."], path: process.env.PATH });
  assert.equal(result.status, 64);
});

test("list.sh exits 64 outside a git repository", (t) => {
  const dir = scratch(t);
  const { result } = list(t, { cwd: dir, path: process.env.PATH });
  assert.equal(result.status, 64);
});

test("list.sh exits 69 when git is missing", (t) => {
  const dir = scratch(t);
  mkdirSync(join(dir, "empty"));
  const { result } = list(t, { cwd: dir, path: join(dir, "empty") });
  assert.equal(result.status, 69);
});

test("list.sh deletes a squash-merged branch and keeps an unpushed one", (t) => {
  const { dir, work } = repo(t);
  git(work, ["checkout", "-qb", "squashed"]);
  const squashedTip = commit(work, "a", OLD);
  git(work, ["push", "-q", "-u", "origin", "squashed"]);
  git(work, ["checkout", "-q", "main"]);
  commit(work, "a-squashed", OLD);
  git(work, ["push", "-q", "origin", "main"]);
  git(work, ["push", "-q", "origin", "--delete", "squashed"]);
  git(work, ["checkout", "-qb", "unpushed"]);
  commit(work, "b", OLD);
  git(work, ["checkout", "-q", "main"]);

  const { result, rows } = list(t, {
    cwd: work,
    path: fakeBin(dir, { squashed: squashedTip }),
  });
  assert.equal(result.status, 0, result.stderr);
  const squashed = rowFor(rows, "branch", "squashed");
  assert.equal(squashed.action, "delete");
  assert.equal(squashed.merged, "yes");
  assert.equal(rowFor(rows, "branch", "unpushed").action, "keep (unpushed)");
  assert.ok(!rows.some((row) => row.target === "main"), "the default branch is listed");
});

test("list.sh proposes a merged worktree older than 7 days and keeps unmerged or recent ones", (t) => {
  const { dir, work } = repo(t);
  const merged = join(dir, "merged-old");
  git(work, ["worktree", "add", "-q", "-b", "merged-old", merged, "main"]);
  const unmerged = join(dir, "unmerged-old");
  git(work, ["worktree", "add", "-q", "-b", "unmerged-old", unmerged, "main"]);
  commit(unmerged, "c", OLD);
  git(unmerged, ["push", "-q", "-u", "origin", "unmerged-old"]);
  const recent = join(dir, "merged-recent");
  git(work, ["worktree", "add", "-q", "-b", "merged-recent", recent, "main"]);
  age(work, "merged-old", OLD);
  age(work, "unmerged-old", OLD);

  const { result, rows } = list(t, { cwd: work, path: fakeBin(dir) });
  assert.equal(result.status, 0, result.stderr);

  const old = rowFor(rows, "worktree", merged);
  assert.equal(old.merged, "yes");
  assert.ok(Number(old.age) > 7, `age ${old.age}`);
  assert.equal(old.action, "delete");
  assert.match(old.command, /worktree remove .*merged-old && .*branch -D merged-old$/);

  const open = rowFor(rows, "worktree", unmerged);
  assert.equal(open.merged, "no");
  assert.equal(open.action, "keep (unmerged)");

  const fresh = rowFor(rows, "worktree", recent);
  assert.equal(fresh.merged, "yes");
  assert.notEqual(fresh.action, "delete");
  assert.equal(fresh.command, "-");
});

test("list.sh warns about a scratch tree with a commit from the last day", (t) => {
  const { dir, work } = repo(t);
  const base = existsSync("/private/tmp") ? "/private/tmp" : tmpdir();
  const root = scratch(t, base);
  const encoded = work.replaceAll(/[/.]/g, "-");
  const tree = join(
    root,
    "claude-501",
    `${encoded}--claude-worktrees-x`,
    "s",
    "scratchpad",
    "tree",
  );
  mkdirSync(tree, { recursive: true });
  git(tree, ["init", "-q", "-b", "main"]);
  commit(tree, "fresh");
  const stale = join(root, "claude-501", encoded, "s", "scratchpad", "stale");
  mkdirSync(stale, { recursive: true });
  git(stale, ["init", "-q", "-b", "main"]);
  commit(stale, "stale", OLD);

  const { result, rows } = list(t, { cwd: work, path: fakeBin(dir), scratchRoot: root });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(rowFor(rows, "warning", tree).action, "keep (commits in the last day)");
  assert.equal(rowFor(rows, "scratch", tree).command, "-");
  assert.ok(!rows.some((row) => row.kind === "warning" && row.target === stale));
});
