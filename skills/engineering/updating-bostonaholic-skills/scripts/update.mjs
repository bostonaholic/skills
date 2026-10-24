#!/usr/bin/env node

/**
 * Updates every existing install of the bostonaholic skills collection on this
 * machine to the latest release tag, in every harness that already holds it.
 *
 *     node "<skill-dir>/scripts/update.mjs" plan
 *     node "<skill-dir>/scripts/update.mjs" apply <plan-id>
 *     DRY_RUN=true node "<skill-dir>/scripts/update.mjs" apply <plan-id>
 *
 * `plan` changes nothing on the machine. It reads the latest `v*` tag of
 * https://github.com/bostonaholic/skills, shallow-clones that tag to a
 * temporary directory, inspects each harness, and prints the steps it would
 * run. `apply` reads every harness again and runs the steps only when that
 * plan has the id the user confirmed. With DRY_RUN=true it prints each
 * command and copy instead of running it.
 *
 * Harnesses, each inspected only when an install of the collection exists in
 * it. Nothing is ever installed into a harness that lacks the collection, and
 * a skill is never added to a copy directory that did not already hold it:
 *
 *   claude         `bostonaholic@skills` at user scope in `claude plugin
 *                  list --json`, behind the release: `claude plugin
 *                  marketplace update skills`, then `claude plugin update
 *                  bostonaholic@skills --scope user`
 *   codex          `bostonaholic@skills` in `codex plugin list --json`, behind
 *                  the release: `codex plugin marketplace upgrade skills`,
 *                  then `codex plugin add bostonaholic@skills`
 *   cursor-plugin  ~/.cursor/plugins/local/bostonaholic, a git clone of the
 *                  release repository behind the release tag: `git pull
 *                  --ff-only`. That moves the clone to the tip of its own
 *                  branch, which can be ahead of the tag. A clone at or past
 *                  the tag gets no step and no blocker. A foreign or diverged
 *                  clone blocks the plan, and so does a behind clone that is
 *                  dirty, detached, or without an upstream branch
 *
 * A `plugin list --json` that fails blocks the plan only when the harness's
 * own files show the collection installed (installed_plugins.json for Claude
 * Code, config.toml for Codex); otherwise that harness is skipped with a
 * `left:` line. The same files make a missing CLI a blocker.
 *
 * Copy directories, plain copies with no version stamp:
 *
 *   antigravity    ~/.gemini/antigravity-cli/skills
 *   opencode       ${XDG_CONFIG_HOME:-~/.config}/opencode/skills
 *   cursor         ~/.cursor/skills
 *   grok-bot       ~/agent-data/workflows, whose copies hold only SKILL.md,
 *                  references/, scripts/, and shared/
 *
 * In these four directories, whatever installed the copies (a copy script,
 * the `skills` CLI in copy mode, or by hand), each collection skill already there
 * as a real directory with a SKILL.md is compared with the release's copy and
 * replaced when it differs. The old copy moves to
 * ${XDG_DATA_HOME:-~/.local/share}/updating-bostonaholic-skills/backups/<UTC timestamp>/<harness>/<name>,
 * and the new copy is staged beside the old one, then moved in whole. A symlink
 * or file where a collection skill goes, and a skill the collection has
 * retired, are left alone and reported.
 *
 * Not touched: ~/.claude/skills, ~/.agents/skills, and project-level
 * `skills` CLI installs. Update those as INSTALL.md's "One skill" section shows.
 *
 * Environment: HOME, XDG_CONFIG_HOME, XDG_DATA_HOME, CLAUDE_CONFIG_DIR, and
 * CODEX_HOME locate the installs. UPDATING_BOSTONAHOLIC_SKILLS_SOURCE
 * replaces the release repository (a URL or path), for tests only.
 *
 * Stdout, `plan`: the release tag, the installs found, one numbered step per
 * gap with each exact command, `Blocked` lines, `left:` lines, then
 * `Plan id: <40 hex>`. A plan with no steps and no blockers prints
 * `Nothing to do.` before its `left:` lines. `apply`: one `[n/total]` line per
 * step followed by its commands and replaced copies, then the backup
 * directory when a copy moved there.
 *
 * Exit codes:
 *
 *   0   the plan printed, or every step ran
 *   1   a step failed (the steps not run are named), or the release or a
 *       harness could not be read; a failed tool's stderr comes first
 *   2   usage: wrong arguments or a malformed plan id. Nothing ran
 *   3   the plan changed since it was confirmed. Nothing ran
 *   4   the plan is blocked. `plan` prints the blockers; `apply` runs nothing
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  accessSync,
  constants,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT = "update.mjs";
const DOC_PATH = fileURLToPath(new URL("../references/blockers-and-failures.md", import.meta.url));
const USAGE = `${SCRIPT}: usage: ${SCRIPT} plan | ${SCRIPT} apply <plan-id>\n`;

const DEFAULT_SOURCE = "https://github.com/bostonaholic/skills.git";
const PLUGIN_ID = "bostonaholic@skills";
const MARKETPLACE = "skills";
const EXIT = { ok: 0, failure: 1, usage: 2, changed: 3, blocked: 4 };
// Files a file manager adds to a skill directory; they are not part of a copy.
const IGNORED_ENTRIES = new Set([".DS_Store"]);

class UpdateError extends Error {}

function environment() {
  const home = process.env.HOME;
  if (!home) throw new UpdateError("HOME is not set");
  return {
    home,
    source: process.env.UPDATING_BOSTONAHOLIC_SKILLS_SOURCE || DEFAULT_SOURCE,
    claudeDirectory: process.env.CLAUDE_CONFIG_DIR || join(home, ".claude"),
    codexDirectory: process.env.CODEX_HOME || join(home, ".codex"),
    backupsDirectory: join(
      process.env.XDG_DATA_HOME || join(home, ".local/share"),
      "updating-bostonaholic-skills/backups",
    ),
    dryRun: process.env.DRY_RUN === "true",
    // `entries` lists what the harness's copies carry; null means the whole skill directory.
    copyHarnesses: [
      {
        name: "antigravity",
        directory: join(home, ".gemini/antigravity-cli/skills"),
        entries: null,
      },
      {
        name: "opencode",
        directory: join(process.env.XDG_CONFIG_HOME || join(home, ".config"), "opencode/skills"),
        entries: null,
      },
      { name: "cursor", directory: join(home, ".cursor/skills"), entries: null },
      {
        name: "grok-bot",
        directory: join(home, "agent-data/workflows"),
        entries: ["SKILL.md", "references", "scripts", "shared"],
      },
    ],
    cursorPluginDirectory: join(home, ".cursor/plugins/local/bostonaholic"),
  };
}

// ---------------------------------------------------------------------------
// Tools

// A tool that cannot start is the script's own failure.
function capture(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.error) throw new UpdateError(`cannot run ${command}: ${result.error.message}`);
  return result;
}

// Runs a tool whose failure ends the script: its stderr reaches ours unaltered first.
function captureOrFail(command, args, failure, options) {
  const result = capture(command, args, options);
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    throw new UpdateError(failure);
  }
  return result.stdout;
}

function onPath(command) {
  return (process.env.PATH ?? "").split(delimiter).some((directory) => {
    if (!directory) return false;
    try {
      accessSync(join(directory, command), constants.X_OK);
      return statSync(join(directory, command)).isFile();
    } catch {
      return false;
    }
  });
}

function oneLine(text) {
  return text.trim().replace(/\s+/g, " ");
}

function readJsonIfPresent(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Release

function parseVersion(text) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(text ?? "");
  return match ? match.slice(1).map(Number) : undefined;
}

// Whether `installed` is at least `release`. A marketplace serves the default branch, which can
// be ahead of the last tag, so ahead counts as current. A version that is not semver does not.
function atLeast(installed, release) {
  const have = parseVersion(installed);
  const want = parseVersion(release);
  if (!have || !want) return false;
  for (let index = 0; index < 3; index += 1) {
    if (have[index] !== want[index]) return have[index] > want[index];
  }
  return true;
}

function latestTag(source) {
  const output = captureOrFail(
    "git",
    ["ls-remote", "--tags", "--refs", source, "v*"],
    `cannot list the release tags of ${source}`,
  );
  const tags = output
    .split("\n")
    .map((line) => /\trefs\/tags\/(v\d+\.\d+\.\d+)$/.exec(line)?.[1])
    .filter(Boolean)
    .sort((left, right) => {
      const [a, b] = [parseVersion(left), parseVersion(right)];
      return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
    });
  if (tags.length === 0) throw new UpdateError(`${source} has no v<major>.<minor>.<patch> tag`);
  return tags.at(-1);
}

function cloneRelease(source, tag, parent) {
  const directory = join(parent, "release");
  captureOrFail(
    "git",
    [
      "-c",
      "advice.detachedHead=false",
      "clone",
      "--quiet",
      "--depth",
      "1",
      "--branch",
      tag,
      source,
      directory,
    ],
    `cannot clone ${tag} of ${source}`,
  );
  const manifest = readJsonIfPresent(join(directory, ".claude-plugin/plugin.json"));
  if (!Array.isArray(manifest?.skills)) {
    throw new UpdateError(`${tag} of ${source} has no .claude-plugin/plugin.json skills array`);
  }
  const names = manifest.skills.map((path) => {
    const match = /^\.\/skills\/[a-z]+\/([a-z0-9-]+)$/.exec(path);
    if (!match || !existsSync(join(directory, path, "SKILL.md"))) {
      throw new UpdateError(`${tag} lists a skill path this script cannot read: ${path}`);
    }
    return { name: match[1], directory: join(directory, path) };
  });
  const retiredDirectory = join(directory, "skills/deprecated");
  const retired = existsSync(retiredDirectory)
    ? readdirSync(retiredDirectory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    : [];
  return { tag, directory, skills: names, retired };
}

// ---------------------------------------------------------------------------
// Copy comparison

// Maps each path under `root` to a description of what is there, so two trees are equal when
// their maps are. `only` limits the walk to those top-level entries.
function describeTree(root, only) {
  const found = new Map();
  const walk = (relative) => {
    const path = join(root, relative);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      found.set(relative, `link:${readlinkSync(path)}`);
    } else if (stat.isDirectory()) {
      found.set(relative, "directory");
      for (const entry of readdirSync(path).sort()) {
        if (!IGNORED_ENTRIES.has(entry)) walk(join(relative, entry));
      }
    } else {
      const executable = stat.mode & 0o111 ? "x" : "-";
      found.set(
        relative,
        `file:${executable}:${createHash("sha1").update(readFileSync(path)).digest("hex")}`,
      );
    }
  };
  const entries = only ?? readdirSync(root).filter((entry) => !IGNORED_ENTRIES.has(entry));
  for (const entry of entries) {
    if (lstatIfPresent(join(root, entry))) walk(entry);
  }
  return found;
}

function lstatIfPresent(path) {
  try {
    return lstatSync(path);
  } catch {
    return undefined;
  }
}

function sameTree(left, right) {
  if (left.size !== right.size) return false;
  for (const [path, description] of left) {
    if (right.get(path) !== description) return false;
  }
  return true;
}

function copyDiffers(target, releaseSkill, entries) {
  return !sameTree(describeTree(target), describeTree(releaseSkill, entries));
}

// ---------------------------------------------------------------------------
// Inspection

function newPlan(release) {
  return { release, found: [], steps: [], blockers: [], left: [] };
}

function claudeInstallEvidence(context) {
  const installed = readJsonIfPresent(
    join(context.claudeDirectory, "plugins/installed_plugins.json"),
  );
  return Boolean(installed?.plugins?.[PLUGIN_ID]?.some((entry) => entry.scope === "user"));
}

function codexInstallEvidence(context) {
  const configuration = join(context.codexDirectory, "config.toml");
  return (
    existsSync(configuration) &&
    readFileSync(configuration, "utf8")
      .split("\n")
      .some((line) => line.trim().startsWith(`[plugins."${PLUGIN_ID}"]`))
  );
}

// A listing that cannot be read blocks only when the harness's files show an install.
function unreadableListing(plan, harness, installed, listing) {
  const reason = `cannot read '${harness} plugin list --json': ${oneLine(listing.stderr) || "no JSON output"}`;
  if (installed) plan.blockers.push(`${harness}: ${reason}`);
  else plan.left.push(`${harness}: skipped, no install found and ${reason}`);
}

function inspectClaude(context, plan) {
  if (!onPath("claude")) {
    if (claudeInstallEvidence(context)) {
      plan.blockers.push(`claude: ${PLUGIN_ID} is installed but the claude CLI is not on PATH`);
    }
    return;
  }
  const listing = capture("claude", ["plugin", "list", "--json"]);
  let entries;
  try {
    entries = listing.status === 0 ? JSON.parse(listing.stdout) : undefined;
  } catch {
    entries = undefined;
  }
  if (!Array.isArray(entries)) {
    unreadableListing(plan, "claude", claudeInstallEvidence(context), listing);
    return;
  }
  const mine = entries.filter((entry) => entry.id === PLUGIN_ID);
  const user = mine.find((entry) => entry.scope === "user");
  for (const entry of mine.filter((other) => other.scope !== "user")) {
    plan.left.push(
      `claude: ${PLUGIN_ID} is installed at ${entry.scope} scope; update it with: claude plugin update ${PLUGIN_ID} --scope ${entry.scope}`,
    );
  }
  if (!user) return;
  plan.found.push("claude");
  if (atLeast(user.version, plan.release.tag)) return;
  plan.steps.push({
    harness: "claude",
    gap: `${PLUGIN_ID} ${user.version || "has no version"} is behind ${plan.release.tag}`,
    commands: [
      ["claude", "plugin", "marketplace", "update", MARKETPLACE],
      ["claude", "plugin", "update", PLUGIN_ID, "--scope", "user"],
    ],
  });
}

function inspectCodex(context, plan) {
  if (!onPath("codex")) {
    if (codexInstallEvidence(context)) {
      plan.blockers.push(`codex: ${PLUGIN_ID} is installed but the codex CLI is not on PATH`);
    }
    return;
  }
  const listing = capture("codex", ["plugin", "list", "--json"]);
  let installed;
  try {
    installed = listing.status === 0 ? JSON.parse(listing.stdout).installed : undefined;
  } catch {
    installed = undefined;
  }
  if (!Array.isArray(installed)) {
    unreadableListing(plan, "codex", codexInstallEvidence(context), listing);
    return;
  }
  const mine = installed.find((entry) => entry.pluginId === PLUGIN_ID && entry.installed);
  if (!mine) return;
  plan.found.push("codex");
  if (atLeast(mine.version, plan.release.tag)) return;
  plan.steps.push({
    harness: "codex",
    gap: `${PLUGIN_ID} ${mine.version || "has no version"} is behind ${plan.release.tag}`,
    commands: [
      ["codex", "plugin", "marketplace", "upgrade", MARKETPLACE],
      ["codex", "plugin", "add", PLUGIN_ID],
    ],
  });
}

// Treats ssh and https GitHub URLs, a trailing `.git`, and a trailing slash as the same remote.
export function normalizeRemote(url) {
  return url
    .trim()
    .replace(/^git@github\.com:/, "https://github.com/")
    .replace(/^ssh:\/\/git@github\.com\//, "https://github.com/")
    .replace(/\/+$/, "")
    .replace(/\.git$/, "");
}

function inspectCursorPlugin(context, plan) {
  const directory = context.cursorPluginDirectory;
  if (!lstatIfPresent(directory)) return;
  plan.found.push("cursor-plugin");
  const block = (reason) => plan.blockers.push(`cursor-plugin: ${directory} ${reason}`);
  const git = (...args) => capture("git", ["-C", directory, ...args]);
  if (
    git("rev-parse", "--is-inside-work-tree").stdout.trim() !== "true" ||
    !existsSync(join(directory, ".git"))
  ) {
    return block(`is not a git clone of ${context.source}. Move it aside or update it by hand.`);
  }
  const origin = git("remote", "get-url", "origin").stdout;
  if (normalizeRemote(origin) !== normalizeRemote(context.source)) {
    return block(
      `has origin ${oneLine(origin) || "(none)"}, not ${context.source}. Update it by hand.`,
    );
  }
  const releaseCommit = captureOrFail(
    "git",
    ["-C", plan.release.directory, "rev-parse", "HEAD"],
    `cannot read the ${plan.release.tag} commit`,
  ).trim();
  if (git("merge-base", "--is-ancestor", releaseCommit, "HEAD").status === 0) return;
  // The release clone is shallow; the local HEAD is an ancestor of the tag only when the
  // tag's full history says so, and a HEAD it does not know is local work that would diverge.
  const shallow = capture("git", [
    "-C",
    plan.release.directory,
    "rev-parse",
    "--is-shallow-repository",
  ]);
  if (shallow.stdout.trim() === "true") {
    captureOrFail(
      "git",
      ["-C", plan.release.directory, "fetch", "--quiet", "--unshallow"],
      "cannot read the release history",
    );
  }
  const head = git("rev-parse", "HEAD").stdout.trim();
  if (
    capture("git", [
      "-C",
      plan.release.directory,
      "merge-base",
      "--is-ancestor",
      head,
      releaseCommit,
    ]).status !== 0
  ) {
    return block(
      `has commits that ${plan.release.tag} lacks, so it cannot fast-forward. Update it by hand.`,
    );
  }
  if (git("status", "--porcelain").stdout.trim() !== "") {
    return block("has uncommitted changes. Commit or discard them, then run the plan again.");
  }
  if (git("symbolic-ref", "--quiet", "HEAD").status !== 0) {
    return block("has a detached HEAD. Check out its branch, then run the plan again.");
  }
  if (git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}").status !== 0) {
    return block("has no upstream branch for git pull. Set one, then run the plan again.");
  }
  plan.steps.push({
    harness: "cursor-plugin",
    gap: `${directory} is behind ${plan.release.tag}`,
    commands: [["git", "-C", directory, "pull", "--ff-only"]],
  });
}

function inspectCopyHarness(harness, plan) {
  const stat = lstatIfPresent(harness.directory);
  if (
    !stat ||
    !(stat.isDirectory() || statSync(harness.directory, { throwIfNoEntry: false })?.isDirectory())
  )
    return;
  const replacements = [];
  let holdsCollection = false;
  for (const skill of plan.release.skills) {
    const target = join(harness.directory, skill.name);
    const present = lstatIfPresent(target);
    if (!present) continue;
    holdsCollection = true;
    if (!present.isDirectory()) {
      plan.left.push(`${target}: a symlink or file stands where a collection skill goes`);
    } else if (!existsSync(join(target, "SKILL.md"))) {
      plan.left.push(`${target}: has no SKILL.md, so it is not a skill copy`);
    } else if (copyDiffers(target, skill.directory, harness.entries)) {
      replacements.push(skill.name);
    }
  }
  for (const name of plan.release.retired) {
    if (!lstatIfPresent(join(harness.directory, name))) continue;
    holdsCollection = true;
    plan.left.push(
      `${join(harness.directory, name)}: retired from the collection; delete it if unwanted`,
    );
  }
  if (holdsCollection) plan.found.push(harness.name);
  if (replacements.length === 0) return;
  plan.steps.push({
    harness: harness.name,
    gap: `${replacements.length} of ${plan.release.skills.length} collection copies in ${harness.directory} differ from ${plan.release.tag}`,
    replace: { directory: harness.directory, entries: harness.entries, names: replacements },
    lines: [`replace each; the old copy moves to the backup directory: ${replacements.join(", ")}`],
  });
}

function buildPlan(context, parent) {
  const tag = latestTag(context.source);
  const plan = newPlan(cloneRelease(context.source, tag, parent));
  inspectClaude(context, plan);
  inspectCodex(context, plan);
  inspectCursorPlugin(context, plan);
  for (const harness of context.copyHarnesses) inspectCopyHarness(harness, plan);
  const identity = JSON.stringify(
    plan.steps.map((step) => [step.harness, step.gap, stepLines(step)]),
  );
  plan.id = createHash("sha1").update(`${tag}\n${identity}`).digest("hex");
  return plan;
}

// ---------------------------------------------------------------------------
// Output

function commandText(command) {
  return command
    .map((word) => (/^[\w@%+=:,./-]+$/.test(word) ? word : `'${word.replaceAll("'", `'\\''`)}'`))
    .join(" ");
}

// What the plan shows and the id covers for a step: its exact commands, or its copy summary.
function stepLines(step) {
  return step.lines ?? step.commands.map(commandText);
}

function renderPlan(context, plan) {
  const lines = [
    "Updating bostonaholic skills",
    `  Latest release: ${plan.release.tag} (${context.source})`,
    `  Installs found: ${plan.found.length === 0 ? "none" : plan.found.join(", ")}`,
  ];
  if (plan.steps.length === 0 && plan.blockers.length === 0) lines.push("Nothing to do.");
  if (plan.steps.length > 0) {
    lines.push(
      `  Backups of replaced copies go under ${join(context.backupsDirectory, "<UTC timestamp>")}`,
    );
    lines.push("Steps, in order:");
    plan.steps.forEach((step, index) => {
      lines.push(`  ${index + 1}. [${step.harness}] ${step.gap}`);
      for (const line of stepLines(step)) lines.push(`     $ ${line}`);
    });
  }
  if (plan.blockers.length > 0) {
    lines.push("Blocked; nothing runs until each is resolved:");
    for (const blocker of plan.blockers) lines.push(`  - ${blocker}`);
  }
  for (const reason of plan.left) lines.push(`left: ${reason}`);
  lines.push(`Plan id: ${plan.id}`);
  process.stdout.write(`${lines.join("\n")}\n`);
}

// ---------------------------------------------------------------------------
// Apply

function moveDirectory(source, destination) {
  mkdirSync(join(destination, ".."), { recursive: true });
  try {
    renameSync(source, destination);
  } catch (error) {
    if (error.code !== "EXDEV") throw error;
    cpSync(source, destination, { recursive: true, verbatimSymlinks: true });
    rmSync(source, { recursive: true, force: true });
  }
}

function utcTimestamp() {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");
}

// Replaces one copy. The release copy is staged beside the old one and the old one moves to the
// backup first, so no step leaves a skill directory half written.
function replaceCopy(plan, step, name, backupRoot) {
  const { directory, entries } = step.replace;
  const target = join(directory, name);
  const skill = plan.release.skills.find((candidate) => candidate.name === name);
  if (!copyDiffers(target, skill.directory, entries)) return `already current: ${target}`;
  const staged = join(directory, `.${name}.updating-${process.pid}`);
  rmSync(staged, { recursive: true, force: true });
  try {
    mkdirSync(staged);
    for (const entry of entries ?? readdirSync(skill.directory)) {
      if (existsSync(join(skill.directory, entry))) {
        cpSync(join(skill.directory, entry), join(staged, entry), {
          recursive: true,
          verbatimSymlinks: true,
        });
      }
    }
    const backup = join(backupRoot, step.harness, name);
    moveDirectory(target, backup);
    try {
      renameSync(staged, target);
    } catch (error) {
      moveDirectory(backup, target);
      throw error;
    }
    return `replaced ${target} (old copy: ${backup})`;
  } finally {
    rmSync(staged, { recursive: true, force: true });
  }
}

function runStep(context, plan, step, backupRoot) {
  if (context.dryRun) {
    for (const line of stepLines(step)) process.stdout.write(`  [dry run] ${line}\n`);
    return;
  }
  if (step.replace) {
    for (const name of step.replace.names)
      process.stdout.write(`  ${replaceCopy(plan, step, name, backupRoot)}\n`);
    return;
  }
  for (const command of step.commands) {
    process.stdout.write(`  $ ${commandText(command)}\n`);
    const result = spawnSync(command[0], command.slice(1), { stdio: "inherit" });
    if (result.error) throw new UpdateError(`cannot run ${command[0]}: ${result.error.message}`);
    if (result.status !== 0) throw new UpdateError(`${command[0]} exited ${result.status}`);
  }
}

function applyPlan(context, plan, confirmedId) {
  if (confirmedId !== plan.id) {
    process.stderr.write(
      `${SCRIPT}: the plan changed since it was confirmed (now ${plan.id}); nothing ran\n`,
    );
    process.stderr.write(`see ${DOC_PATH}\n`);
    return EXIT.changed;
  }
  if (plan.blockers.length > 0) {
    process.stderr.write(`${SCRIPT}: blocked; nothing ran:\n`);
    for (const blocker of plan.blockers) process.stderr.write(`  - ${blocker}\n`);
    process.stderr.write(`see ${DOC_PATH}\n`);
    return EXIT.blocked;
  }
  if (plan.steps.length === 0) {
    process.stdout.write("Nothing to do.\n");
    return EXIT.ok;
  }
  const backupRoot = join(context.backupsDirectory, utcTimestamp());
  const total = plan.steps.length;
  for (const [index, step] of plan.steps.entries()) {
    process.stdout.write(`[${index + 1}/${total}] [${step.harness}] ${step.gap}\n`);
    try {
      runStep(context, plan, step, backupRoot);
    } catch (error) {
      const notRun = plan.steps
        .slice(index + 1)
        .map((later) => `  not run: [${later.harness}] ${later.gap}\n`);
      process.stderr.write(
        `${SCRIPT}: step ${index + 1} of ${total} failed: [${step.harness}] ${error.message}\n`,
      );
      process.stderr.write(notRun.join(""));
      if (existsSync(backupRoot)) process.stderr.write(`  backups so far: ${backupRoot}\n`);
      process.stderr.write(`see ${DOC_PATH}\n`);
      return EXIT.failure;
    }
  }
  if (existsSync(backupRoot)) process.stdout.write(`Backups: ${backupRoot}\n`);
  process.stdout.write("Done.\n");
  return EXIT.ok;
}

// ---------------------------------------------------------------------------

function parseArguments(argv) {
  if (argv.length === 1 && argv[0] === "plan") return { command: "plan" };
  if (argv.length === 2 && argv[0] === "apply" && /^[0-9a-f]{40}$/.test(argv[1])) {
    return { command: "apply", planId: argv[1] };
  }
  return undefined;
}

function main(argv) {
  const parsed = parseArguments(argv);
  if (!parsed) {
    process.stderr.write(USAGE);
    process.stderr.write(`see ${DOC_PATH}\n`);
    return EXIT.usage;
  }
  const parent = mkdtempSync(join(tmpdir(), "updating-bostonaholic-skills-"));
  try {
    const context = environment();
    const plan = buildPlan(context, parent);
    if (parsed.command === "apply") return applyPlan(context, plan, parsed.planId);
    renderPlan(context, plan);
    return plan.blockers.length > 0 ? EXIT.blocked : EXIT.ok;
  } catch (error) {
    if (!(error instanceof UpdateError)) throw error;
    process.stderr.write(`${SCRIPT}: ${error.message}\n`);
    process.stderr.write(`see ${DOC_PATH}\n`);
    return EXIT.failure;
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
