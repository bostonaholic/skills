#!/usr/bin/env node
// Saves, verifies, and restores the working tree around one improving-codebases make step.
// Usage: checkpoint.mjs save|verify|restore <run> <id>
//   save     record HEAD, a digest of every ref, and a copy of each path git status reports, under
//            <run>/checkpoints/<id>/
//   verify   write and print <run>/checkpoints/<id>/verify.json: `changed`, `escaped`, `problem`
//   restore  return each changed path to its saved state, then test the tree, HEAD, and refs again
//   exit 0  done; for verify, HEAD and refs are unchanged and no path escaped
//   exit 1  failure: an unreadable <run>, a save that cannot write, a moved HEAD or ref before a
//           restore, a path a restore cannot reach without a symlink, or a tree a restore left
//           changed; stderr names the path or what moved
//   exit 2  usage: an unknown command, a missing argument, or an <id> outside <lane>/<n>
//   exit 3  verify only: HEAD moved, a ref changed, or a path escaped; verify.json names it
// A changed path is a saved path, or a path git status now reports, whose state differs from the
// save; a path the save did not record had its HEAD state. A kept artifact is a path that
// <run>/make/<id>.json lists under `artifacts`, that ends in a lane suffix, and that is new: absent
// from HEAD and from the save. Git-ignored paths stay outside every command.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { listLanes } from "./list-lanes.mjs";
import { underPath } from "./render-report.mjs";
import { childEnv } from "./run-bounded.mjs";

// The skill file that explains each exit code.
const DOC_PATH = fileURLToPath(new URL("../SKILL.md", import.meta.url));

const COMMANDS = new Set(["save", "verify", "restore"]);
const FINDING_ID = /^[a-z0-9-]+\/[1-9][0-9]*$/;
// git output and blobs can pass spawnSync's 1 MiB default buffer on a large repository.
const GIT_MAX_BUFFER = 256 * 1024 * 1024;
const EXECUTABLE = 0o111;
const FILE_MODES = new Set(["100644", "100755"]);
const SYMLINK_MODE = "120000";
const EXIT_PROBLEM = 3;

class Failure extends Error {}

function git(root, args, encoding = "utf8") {
  const run = spawnSync("git", args, {
    cwd: root,
    encoding,
    env: childEnv(),
    maxBuffer: GIT_MAX_BUFFER,
  });
  if (run.status !== 0) {
    const stderr = Buffer.isBuffer(run.stderr) ? run.stderr.toString("utf8") : (run.stderr ?? "");
    throw new Failure(`git ${args[0]} failed: ${run.error?.message ?? stderr.trim()}`);
  }
  return run.stdout;
}

const digest = (text) => createHash("sha256").update(text).digest("hex");

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Failure(`cannot read ${path}: ${error.message}`);
  }
}

// HEAD as a commit and the branch it names, so a checkout of another branch counts as a move.
function headState(root) {
  const commit = git(root, ["rev-parse", "HEAD"]).trim();
  const branch = spawnSync("git", ["symbolic-ref", "-q", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    env: childEnv(),
  }).stdout.trim();
  return branch ? `${commit} ${branch}` : commit;
}

function refsDigest(root) {
  return digest(git(root, ["for-each-ref"]));
}

function statusPaths(root) {
  const out = git(root, ["status", "--porcelain", "-z", "--untracked-files=all", "--no-renames"]);
  return out
    .split("\0")
    .filter(Boolean)
    .map((entry) => entry.slice(3));
}

// Each path in HEAD's tree, with its mode.
function headTree(root) {
  const tree = new Map();
  for (const entry of git(root, ["ls-tree", "-r", "-z", "--full-tree", "HEAD"]).split("\0")) {
    const match = entry.match(/^(\d+) \w+ [0-9a-f]+\t(.+)$/s);
    if (match) tree.set(match[2], match[1]);
  }
  return tree;
}

// True when every directory between the root and `path` is a real directory, not a symlink.
function reachable(root, path) {
  const parts = path.split("/");
  for (let depth = 1; depth < parts.length; depth += 1) {
    try {
      const stat = lstatSync(join(root, ...parts.slice(0, depth)));
      if (stat.isSymbolicLink()) return false;
      if (!stat.isDirectory()) return true;
    } catch (error) {
      if (error.code === "ENOENT") return true;
      throw error;
    }
  }
  return true;
}

// The state of `path` in the working tree: absent, a file with its bytes, a link with its target,
// another kind such as a directory, or unreachable through a symlinked directory.
function treeState(root, path) {
  if (!reachable(root, path)) return { kind: "unreachable" };
  let stat;
  try {
    stat = lstatSync(join(root, path));
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return { kind: "absent" };
    throw error;
  }
  if (stat.isSymbolicLink()) return { kind: "link", target: readlinkSync(join(root, path)) };
  if (stat.isFile())
    return { kind: "file", mode: stat.mode & 0o777, bytes: readFileSync(join(root, path)) };
  return { kind: "other" };
}

// The state of `path` in HEAD, with the bytes `git checkout` would write.
function headPathState(root, tree, path) {
  const mode = tree.get(path);
  if (mode === undefined) return { kind: "absent" };
  if (mode === SYMLINK_MODE)
    return { kind: "link", target: git(root, ["cat-file", "blob", `HEAD:${path}`]) };
  if (!FILE_MODES.has(mode)) return { kind: "other" };
  return {
    kind: "file",
    mode: mode === "100755" ? 0o755 : 0o644,
    bytes: git(root, ["cat-file", "--filters", `HEAD:${path}`], "buffer"),
  };
}

function sameState(a, b) {
  if (a.kind !== b.kind) return false;
  if (a.kind === "link") return a.target === b.target;
  if (a.kind === "file")
    return (a.mode & EXECUTABLE) === (b.mode & EXECUTABLE) && a.bytes.equals(b.bytes);
  return a.kind !== "unreachable" && a.kind !== "other";
}

function checkpointDir(run, id) {
  return join(run, "checkpoints", id);
}

function loadManifest(run, id) {
  const dir = checkpointDir(run, id);
  const manifest = readJson(join(dir, "manifest.json"));
  const saved = new Map();
  for (const entry of manifest.paths) {
    if (entry.kind === "file")
      saved.set(entry.path, {
        kind: "file",
        mode: entry.mode,
        bytes: readFileSync(join(dir, entry.copy)),
      });
    else saved.set(entry.path, entry);
  }
  return { ...manifest, saved };
}

// What a step may not touch, and which new files it keeps, read from <run>.
function loadBounds(run, id) {
  const report = readJson(join(run, "report.json"));
  const scope = report.scope ?? {};
  if (typeof scope.root !== "string" || scope.root === "")
    throw new Failure(`${join(run, "report.json")} has no scope.root`);
  const finding = (report.findings ?? []).find((item) => item?.id === id);
  if (!finding) throw new Failure(`${join(run, "report.json")} holds no finding ${id}`);
  const lane = listLanes().lanes.find((item) => item.lane === finding.lane);
  if (!lane) throw new Failure(`lane ${finding.lane} of ${id} is not in the lane registry`);
  let artifacts = [];
  try {
    artifacts = JSON.parse(readFileSync(join(run, "make", `${id}.json`), "utf8")).artifacts ?? [];
  } catch {
    // With no saved make return, no path is kept.
  }
  return {
    root: scope.root,
    paths: scope.paths ?? [],
    gaps: (report.gaps ?? []).map((gap) => gap.path),
    tests: (finding.coveringTests ?? []).map((test) => String(test).replace(/:[^:]*$/, "")),
    suffixes: lane.artifacts,
    artifacts: Array.isArray(artifacts) ? artifacts : [],
  };
}

function save(run, id) {
  const { root } = loadBounds(run, id);
  const dir = checkpointDir(run, id);
  const entries = [];
  const states = statusPaths(root).map((path) => [path, treeState(root, path)]);
  try {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(join(dir, "files"), { recursive: true });
    for (const [index, [path, state]] of states.entries()) {
      if (state.kind === "file") {
        const copy = join("files", String(index));
        writeFileSync(join(dir, copy), state.bytes);
        entries.push({ path, kind: "file", mode: state.mode, copy });
      } else if (state.kind === "link") entries.push({ path, kind: "link", target: state.target });
      else entries.push({ path, kind: state.kind });
    }
    const manifest = { head: headState(root), refs: refsDigest(root), paths: entries };
    writeFileSync(join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  } catch (error) {
    if (error instanceof Failure) throw error;
    throw new Failure(`cannot write ${dir}: ${error.message}`);
  }
  return 0;
}

// Each path whose state differs from the save, the kept artifacts, and the saved state of each.
function changedPaths(bounds, manifest) {
  const tree = headTree(bounds.root);
  const candidates = new Set([...manifest.saved.keys(), ...statusPaths(bounds.root)]);
  const savedState = (path) => manifest.saved.get(path) ?? headPathState(bounds.root, tree, path);
  const kept = new Set(
    bounds.artifacts.filter(
      (path) =>
        bounds.suffixes.some((suffix) => path.endsWith(suffix)) &&
        !tree.has(path) &&
        !manifest.saved.has(path),
    ),
  );
  const changed = [...candidates]
    .filter((path) => !kept.has(path))
    .filter((path) => !sameState(savedState(path), treeState(bounds.root, path)))
    .sort();
  return { changed, savedState };
}

function moved(root, manifest) {
  const problems = [];
  const head = headState(root);
  if (head !== manifest.head) problems.push(`HEAD moved from ${manifest.head} to ${head}`);
  if (refsDigest(root) !== manifest.refs)
    problems.push("refs changed: git for-each-ref output differs from the save");
  return problems;
}

function verify(run, id) {
  const bounds = loadBounds(run, id);
  const manifest = loadManifest(run, id);
  const problems = moved(bounds.root, manifest);
  const { changed } = changedPaths(bounds, manifest);
  const escaped = changed.filter(
    (path) =>
      !bounds.paths.some((scopePath) => underPath(path, scopePath)) ||
      bounds.gaps.some((gap) => underPath(path, gap)) ||
      bounds.tests.includes(path),
  );
  if (escaped.length > 0)
    problems.push(
      `the make step changed paths outside scope.paths, under gaps, or in coveringTests: ${escaped.join(", ")}`,
    );
  const result = { changed, escaped, problem: problems.length > 0 ? problems.join("; ") : null };
  const text = `${JSON.stringify(result, null, 2)}\n`;
  try {
    writeFileSync(join(checkpointDir(run, id), "verify.json"), text);
  } catch (error) {
    throw new Failure(`cannot write verify.json: ${error.message}`);
  }
  process.stdout.write(text);
  return problems.length > 0 ? EXIT_PROBLEM : 0;
}

function unreachableReason(root, path) {
  if (path.startsWith("/") || path.split("/").includes(".."))
    return `${path} does not sit under ${root}`;
  if (!reachable(root, path)) return `${path} sits under a symlinked directory`;
  return null;
}

function put(root, path, state) {
  const target = join(root, path);
  const current = treeState(root, path);
  if (current.kind === "other") rmSync(target, { recursive: true });
  else if (current.kind !== "absent") unlinkSync(target);
  if (state.kind === "absent") return;
  mkdirSync(dirname(target), { recursive: true });
  if (state.kind === "link") symlinkSync(state.target, target);
  else {
    writeFileSync(target, state.bytes);
    chmodSync(target, state.mode);
  }
}

function restore(run, id) {
  const bounds = loadBounds(run, id);
  const manifest = loadManifest(run, id);
  const problems = moved(bounds.root, manifest);
  if (problems.length > 0)
    throw new Failure(`restore wrote nothing, because ${problems.join(" and ")}`);
  const { changed, savedState } = changedPaths(bounds, manifest);
  const blocked = changed.map((path) => unreachableReason(bounds.root, path)).filter(Boolean);
  if (blocked.length > 0) throw new Failure(`restore wrote nothing: ${blocked.join("; ")}`);
  for (const path of changed) {
    const state = savedState(path);
    if (state.kind === "other" || state.kind === "unreachable")
      throw new Failure(`cannot restore ${path}, whose saved state is not a file or a link`);
    try {
      put(bounds.root, path, state);
    } catch (error) {
      throw new Failure(`cannot restore ${path}: ${error.message}; stop the run on this tree`);
    }
  }
  const after = moved(bounds.root, manifest);
  const left = changedPaths(bounds, manifest).changed;
  if (after.length > 0 || left.length > 0)
    throw new Failure(
      `the tree still differs from the save: ${[...after, ...left].join(", ")}; stop the run on this tree`,
    );
  return 0;
}

function usage() {
  process.stderr.write(
    "checkpoint.mjs: usage: checkpoint.mjs save|verify|restore <run> <id>, with <id> as <lane>/<n>\n",
  );
  process.stderr.write(`see ${DOC_PATH}\n`);
  return 2;
}

function main(args) {
  const [command, run, id] = args;
  if (args.length !== 3 || !COMMANDS.has(command) || !FINDING_ID.test(id)) return usage();
  try {
    if (command === "save") return save(run, id);
    if (command === "verify") return verify(run, id);
    return restore(run, id);
  } catch (error) {
    if (!(error instanceof Failure)) throw error;
    process.stderr.write(`checkpoint.mjs: ${command} ${id}: ${error.message}\n`);
    process.stderr.write(`see ${DOC_PATH}\n`);
    return 1;
  }
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
