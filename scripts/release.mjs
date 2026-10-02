#!/usr/bin/env node
// Maintainer tooling: prepare at land time, check before merge, publish after merge.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const REPO = "bostonaholic/skills";
const URL = `https://github.com/${REPO}`;
const PLUGIN = ".claude-plugin/plugin.json";
const MANIFESTS = [PLUGIN, ".claude-plugin/marketplace.json"];
const VERSION_FILES = ["package.json", "package-lock.json", PLUGIN];
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const run = (command, args) => execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const git = (...args) => run("git", args);
const fail = (message) => { throw new Error(message); };

export function versionParts(version) {
  if (!SEMVER.test(version ?? "")) fail(`Invalid version: ${version}`);
  const parts = version.split(".").map(Number);
  if (!parts.every(Number.isSafeInteger)) fail(`Version exceeds safe integer range: ${version}`);
  return parts;
}

export function nextVersion(base, level) {
  if (!["patch", "minor", "major"].includes(level)) fail("Choose patch, minor, or major.");
  if (base === null) {
    if (level !== "minor") fail("The initial release uses minor and starts at 0.1.0.");
    return "0.1.0";
  }
  const [major, minor, patch] = versionParts(base);
  if (level === "major" && major === 0) fail("Declaring 1.0.0 requires a separate stability decision; pre-1.0 breaking changes use minor.");
  return level === "major" ? `${major + 1}.0.0` : level === "minor" ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`;
}

function forward(head, base) {
  const a = versionParts(head);
  const b = base === null ? [0, 0, 0] : versionParts(base);
  const index = a.findIndex((part, i) => part !== b[i]);
  return index !== -1 && a[index] > b[index];
}

function section(changelog, heading) {
  const lines = changelog.split("\n");
  const start = lines.findIndex((line) => line === heading);
  if (start === -1) fail(`CHANGELOG.md is missing ${heading}`);
  const end = lines.findIndex((line, i) => i > start && (/^## \[/.test(line) || /^\[[^\]]+\]: /.test(line)));
  return lines.slice(start + 1, end === -1 ? undefined : end).join("\n").trim();
}

export function releaseNotes(changelog, version) {
  versionParts(version);
  const headings = changelog.split("\n").filter((line) => line.startsWith(`## [${version}]`));
  if (headings.length !== 1 || !/^## \[[\d.]+\] - \d{4}-\d{2}-\d{2}$/.test(headings[0])) fail(`Expected one dated changelog section for ${version}.`);
  const notes = section(changelog, headings[0]);
  if (!/^\s*[-*] \S/m.test(notes)) fail(`Release ${version} needs nonempty changelog bullets.`);
  return notes + "\n";
}

export function cutChangelog(changelog, version, base, date) {
  const notes = section(changelog, "## [Unreleased]");
  if (!/^\s*[-*] \S/m.test(notes)) fail("Add user-facing bullets under [Unreleased] before preparing a release.");
  if (changelog.includes(`## [${version}]`)) fail(`Changelog already contains ${version}.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail("Invalid release date.");
  const cut = changelog.replace("## [Unreleased]", `## [Unreleased]\n\n## [${version}] - ${date}`)
    .replace(/^\[Unreleased\]: .*\n?/m, "").trimEnd();
  const link = base === null ? `${URL}/releases/tag/v${version}` : `${URL}/compare/v${base}...v${version}`;
  return `${cut}\n\n[Unreleased]: ${URL}/compare/v${version}...HEAD\n[${version}]: ${link}\n`;
}

export function versionedTitle(title, version) {
  const plain = title.replace(/^v\d+\.\d+\.\d+\s+/, "");
  return version === null ? plain : `v${version} ${plain}`;
}

function readAt(ref, path) {
  if (ref === null) return existsSync(path) ? readFileSync(path, "utf8") : null;
  if (!git("ls-tree", "--name-only", ref, "--", path)) return null;
  return git("show", `${ref}:${path}`);
}

function versionAt(ref) {
  const text = readAt(ref, PLUGIN);
  if (text === null) return null;
  const version = JSON.parse(text).version;
  versionParts(version);
  return version;
}

function runtimeManifest(path, text) {
  if (text === null) return null;
  const manifest = JSON.parse(text);
  delete manifest.description;
  if (path === ".claude-plugin/marketplace.json") {
    for (const plugin of manifest.plugins ?? []) delete plugin.description;
  }
  return JSON.stringify(manifest, (key, value) => key === "version" ? undefined : value);
}

export function runtimeChanged(files, before, after) {
  return files.some((path) => /^skills\/(engineering|productivity)\//.test(path)
    || (MANIFESTS.includes(path) && runtimeManifest(path, before(path)) !== runtimeManifest(path, after(path))));
}

function runtimeBetween(base, head = null) {
  const files = git("diff", "--name-only", "--no-renames", base, ...(head ? [head] : [])).split("\n");
  if (head === null) files.push(...git("ls-files", "--others", "--exclude-standard").split("\n"));
  return runtimeChanged(files, (path) => readAt(base, path), (path) => readAt(head, path));
}

function consistent() {
  const version = versionAt(null);
  for (const path of VERSION_FILES) {
    const value = JSON.parse(readFileSync(path, "utf8"));
    if (value.version !== version) fail(`${path}: version differs from ${PLUGIN}.`);
    if (path === "package-lock.json" && value.packages[""].version !== version) fail("Lockfile root package version differs.");
  }
  return version;
}

function assertRelease(version) {
  const changelog = readFileSync("CHANGELOG.md", "utf8");
  releaseNotes(changelog, version);
  if (section(changelog, "## [Unreleased]")) fail("Release preparation must leave [Unreleased] empty.");
  if (!changelog.includes(`[Unreleased]: ${URL}/compare/v${version}...HEAD`)
    || !changelog.includes(`[${version}]: ${URL}/`)) fail("Changelog release links are missing or stale.");
}

function clean() {
  if (git("status", "--porcelain")) fail("Commit or preserve working-tree changes before this operation.");
}

function baseCommit(base) {
  if (!base) fail("Supply the freshly fetched base ref, for example origin/main.");
  const sha = git("rev-parse", "--verify", `${base}^{commit}`);
  if (spawnSync("git", ["merge-base", "--is-ancestor", sha, "HEAD"]).status !== 0) fail("Behind base: rebase onto the fetched base before versioning or merging.");
  return sha;
}

function sync(check = false) {
  run(process.execPath, ["scripts/sync-shared.mjs", ...(check ? ["--check"] : [])]);
}

export function prepare(level, baseRef) {
  clean();
  const base = baseCommit(baseRef);
  const previous = versionAt(base);
  const current = consistent();
  sync();
  const runtime = runtimeBetween(base);
  if (!runtime) {
    if (current !== previous) fail("A development-only PR must not change the version.");
    return { runtime: false, version: current };
  }
  if (previous === null && current !== "0.1.0") fail("The bootstrap release must start at 0.1.0.");
  const alreadyPrepared = previous === null
    ? readFileSync("CHANGELOG.md", "utf8").includes(`## [${current}] - `)
    : forward(current, previous);
  if (alreadyPrepared) {
    assertRelease(current);
    return { runtime: true, version: current, alreadyPrepared: true };
  }
  if (previous !== null && current !== previous) fail("Version is behind the base; reconcile it before preparing a release.");
  const version = nextVersion(previous, level);
  const changelog = cutChangelog(readFileSync("CHANGELOG.md", "utf8"), version, previous, new Date().toISOString().slice(0, 10));
  for (const path of VERSION_FILES) {
    const value = JSON.parse(readFileSync(path, "utf8"));
    value.version = version;
    if (path === "package-lock.json") value.packages[""].version = version;
    writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
  }
  writeFileSync("CHANGELOG.md", changelog);
  consistent();
  assertRelease(version);
  sync(true);
  return { runtime: true, version };
}

export function check(baseRef) {
  clean();
  const base = baseCommit(baseRef);
  sync(true);
  const version = consistent();
  const previous = versionAt(base);
  const runtime = runtimeBetween(base, "HEAD");
  if (runtime) {
    if (previous === null && version !== "0.1.0") fail("The bootstrap release must start at 0.1.0.");
    if (!forward(version, previous)) fail("Runtime changes require a version at land time before merging; unbumped is expected during review.");
    assertRelease(version);
  } else if (version !== previous) fail("A development-only PR must not change the version.");
  return { runtime, version };
}

export function title(head, base, current) {
  const fork = git("merge-base", head, base);
  const version = versionAt(head);
  if (!forward(version, versionAt(fork))) return "";
  // Bootstrap manifests already contain 0.1.0 while still under review.
  const changelog = readAt(head, "CHANGELOG.md") ?? "";
  if (!changelog.includes(`## [${version}] - `)) return "";
  releaseNotes(changelog, version);
  return versionedTitle(current, version);
}

export function publish() {
  clean();
  sync(true);
  const version = consistent();
  const tag = `v${version}`;
  git("fetch", "origin", "--tags", "--quiet");
  const exists = Boolean(git("tag", "--list", tag));
  if (exists) {
    if (spawnSync("git", ["merge-base", "--is-ancestor", `${tag}^{commit}`, "HEAD"]).status !== 0) fail(`Tag collision: ${tag} is not an ancestor of this commit.`);
    if (runtimeBetween(tag, "HEAD")) fail(`Runtime changed since ${tag} without a new version.`);
    git("tag", "-v", tag);
  } else {
    assertRelease(version);
    if (git("config", "--get", "commit.gpgsign") !== "true") fail("Signing must be configured before release tagging.");
    git("tag", "-s", tag, "-m", `Release ${tag}`);
    git("tag", "-v", tag);
  }
  // An existing tag from a partial run must also be pushed before creating a release.
  git("push", "origin", `refs/tags/${tag}`);
  const releases = run("gh", ["api", `repos/${REPO}/releases`, "--paginate", "--jq", ".[].tag_name"]).split("\n");
  if (releases.includes(tag)) return { version, released: false };
  const notes = releaseNotes(readAt(tag, "CHANGELOG.md"), version);
  const out = mkdtempSync(join(tmpdir(), "skills-release-"));
  try {
    const file = join(out, "notes.md");
    writeFileSync(file, notes);
    run("gh", ["release", "create", tag, "--repo", REPO, "--verify-tag", "--title", tag, "--notes-file", file]);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
  return { version, released: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    const [command, ...args] = process.argv.slice(2);
    let result;
    if (command === "prepare" && args.length === 2) result = prepare(...args);
    else if (command === "check" && args.length === 1) result = check(...args);
    else if (command === "publish" && !args.length) result = publish();
    else if (command === "title" && !args.length) result = title(process.env.HEAD_SHA, process.env.BASE_SHA, process.env.CURRENT_TITLE);
    else fail("usage: release.mjs prepare <patch|minor|major> <base-ref> | check <base-ref> | publish | title");
    console.log(typeof result === "string" ? result : JSON.stringify(result));
  } catch (error) {
    console.error(error.stderr?.toString().trim() || error.message);
    process.exitCode = 1;
  }
}
