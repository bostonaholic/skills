#!/usr/bin/env node

/**
 * Where an approved edit is allowed to land, and whether a proposed skill
 * name or repo path may be used at all.
 *
 *     node "<skill-dir>/scripts/write-target.mjs" <repo-root> <skill-name>
 *     node "<skill-dir>/scripts/write-target.mjs" <repo-root> --path <repo-relative-path>
 *
 * Output (skill name): `edit root:`, `edit target:`, `edit target exists:`,
 * `create target:`, `create target exists:`, then one `shadowed copy:` line per
 * copy of the same skill under the other skills root.
 * Output (--path): `target:` and `target exists:`.
 * Exit codes: 0 when the target is allowed; 1 on a usage error or a refusal,
 * printed on stderr as `usage: ...` or `refusing: ...`.
 *
 * Every input here comes from transcript text, so it is untrusted. The three
 * checks below are `f(input) -> output`, which is why they are code rather
 * than prose in the skill body: a name pattern and a containment rule stated
 * as advice are neither deterministic nor testable. Imports nothing from
 * resolve-transcript.mjs — one job each.
 */

import { existsSync, readdirSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Every skill directory on disk matches this shape, so it is the pattern to
 * hold a proposed name to. Deliberately narrower than a general filename
 * allowlist, which admits `.hidden` and `foo.bar`: a leading dot hides the
 * directory from the host's own skill discovery, and a dot inside the name
 * has no precedent to follow.
 */
const SKILL_NAME = /^[a-z][a-z0-9-]*$/;

export function isValidSkillName(name) {
  return typeof name === "string" && SKILL_NAME.test(name);
}

/**
 * A repo-relative file path a retro prompt may target, such as
 * `CODING_STANDARDS.md` or `docs/standards/naming.md`. Plain segments of
 * letters, digits, `.`, `_`, and `-` only: no absolute path, no `..` or `.`
 * segment, no empty segment, and no leading `-` that a command could read as
 * an option. Containment is checked separately, after symlinks resolve.
 */
const REPO_PATH_SEGMENT = /^[A-Za-z0-9._-]+$/;

export function isValidRepoPath(path) {
  if (typeof path !== "string" || path === "" || path.startsWith("-")) return false;
  return path
    .split("/")
    .every((segment) => REPO_PATH_SEGMENT.test(segment) && segment !== "." && segment !== "..");
}

/**
 * The real path of `candidatePath`, resolving the deepest ancestor that
 * exists and re-appending the components that do not. A create target's final
 * component never exists yet, so resolving only existing paths would let the
 * case that matters through unchecked.
 */
function realPathOfDeepestExisting(candidatePath) {
  let current = resolve(candidatePath);
  const missing = [];
  for (;;) {
    if (existsSync(current)) return join(realpathSync(current), ...[...missing].reverse());
    const parent = dirname(current);
    if (parent === current) return resolve(candidatePath);
    missing.push(basename(current));
    current = parent;
  }
}

/**
 * True only when the resolved real path stays inside `repoRoot`. Resolution is
 * what makes this a real check: a symlinked directory inside the repo can
 * point anywhere, so a prefix test on the unresolved path would authorize a
 * write outside the repository the user approved.
 */
export function isInsideRepo(query) {
  const { candidatePath, repoRoot } = query ?? {};
  if (typeof candidatePath !== "string" || typeof repoRoot !== "string") return false;
  if (!existsSync(repoRoot)) return false;
  const root = realpathSync(resolve(repoRoot));
  const target = realPathOfDeepestExisting(candidatePath);
  return target === root || target.startsWith(root + sep);
}

/** True when the repo carries `.claude-plugin/plugin.json` or `plugin.json`. */
export function hasPluginMarker(repoRoot) {
  if (typeof repoRoot !== "string") return false;
  return (
    existsSync(join(repoRoot, ".claude-plugin", "plugin.json")) ||
    existsSync(join(repoRoot, "plugin.json"))
  );
}

/**
 * The skills root the running host actually loads, which is the copy an edit
 * has to reach to change anything. A repo carrying a plugin marker is a plugin
 * root, and its host reads `<repo>/skills/`; every other repo is a project, and
 * its host reads `<repo>/.claude/skills/`. The probe is injected so the
 * tie-break itself stays pure.
 *
 * This decides where an EDIT lands. Creation is not symmetrical: a new skill
 * only ever goes to `<repo>/.claude/skills/<name>/SKILL.md`, because adding a
 * file to a distributed plugin's own `skills/` directory is a release decision.
 */
export function preferredEditRoot(query) {
  const repoRoot = query?.repoRoot ?? "";
  return query?.hasPluginMarker ? join(repoRoot, "skills") : join(repoRoot, ".claude", "skills");
}

/**
 * Where an existing skill named `name` lives under `editRoot`: directly at
 * `<editRoot>/<name>/SKILL.md`, or one category level down at
 * `<editRoot>/<category>/<name>/SKILL.md`. A name found in more than one place
 * is ambiguous, and the caller must refuse rather than guess which copy the
 * user meant. A name found nowhere resolves to the flat path, which does not
 * exist. Containment is the caller's check; this only locates.
 */
export function resolveEditTarget(query) {
  const { editRoot, name } = query ?? {};
  const flat = join(editRoot, name, "SKILL.md");
  const categories = existsSync(editRoot)
    ? readdirSync(editRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
        .map((entry) => entry.name)
        .sort()
    : [];
  const matches = [
    flat,
    ...categories.map((category) => join(editRoot, category, name, "SKILL.md")),
  ].filter((candidate) => existsSync(candidate));
  if (matches.length > 1) return { status: "ambiguous", matches };
  if (matches.length === 1) return { status: "found", target: matches[0] };
  return { status: "missing", target: flat };
}

/**
 * Copies of skill `name` under the skills root that is not the edit root:
 * `<repo>/.claude/skills/` when the edit root is `<repo>/skills/`, and the
 * reverse. An edit lands only at the edit target, so these copies are
 * shadowed: the caller lists them and leaves them untouched.
 */
export function shadowedCopies(query) {
  const { repoRoot, editRoot, name } = query ?? {};
  const pluginRoot = join(repoRoot, "skills");
  const otherRoot = editRoot === pluginRoot ? join(repoRoot, ".claude", "skills") : pluginRoot;
  const other = resolveEditTarget({ editRoot: otherRoot, name });
  if (other.status === "ambiguous") return other.matches;
  return other.status === "found" ? [other.target] : [];
}

// CLI entry point — runs only when executed directly, never on import, so a
// test import has no side effects.
// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const repoRoot = process.argv[2] ?? "";
  const name = process.argv[3] ?? "";

  if (!repoRoot || !name || (name === "--path" && !process.argv[4])) {
    process.stderr.write(
      "usage: write-target.mjs <repo-root> <skill-name | --path <repo-relative-path>>\n",
    );
    process.exit(1);
  }

  if (name === "--path") {
    const path = process.argv[4];
    if (!isValidRepoPath(path)) {
      process.stderr.write(`refusing: '${path}' is not a plain repo-relative path\n`);
      process.exit(1);
    }
    const target = join(repoRoot, path);
    if (!isInsideRepo({ candidatePath: target, repoRoot })) {
      process.stderr.write("refusing: target resolves outside the repository\n");
      process.exit(1);
    }
    process.stdout.write(`target: ${target}\n`);
    process.stdout.write(`target exists: ${existsSync(target)}\n`);
    process.exit(0);
  }

  if (!isValidSkillName(name)) {
    process.stderr.write(`refusing: '${name}' is not a valid skill name\n`);
    process.exit(1);
  }

  const editRoot = preferredEditRoot({ repoRoot, hasPluginMarker: hasPluginMarker(repoRoot) });
  const resolved = resolveEditTarget({ editRoot, name });
  if (resolved.status === "ambiguous") {
    process.stderr.write(
      `refusing: '${name}' names more than one skill: ${resolved.matches.join(", ")}\n`,
    );
    process.exit(1);
  }
  const editTarget = resolved.target;
  const createTarget = join(repoRoot, ".claude", "skills", name, "SKILL.md");

  for (const [label, target] of [
    ["edit target", editTarget],
    ["create target", createTarget],
  ]) {
    if (!isInsideRepo({ candidatePath: target, repoRoot })) {
      process.stderr.write(`refusing: ${label} resolves outside the repository\n`);
      process.exit(1);
    }
  }

  process.stdout.write(`edit root: ${editRoot}\n`);
  process.stdout.write(`edit target: ${editTarget}\n`);
  process.stdout.write(`edit target exists: ${existsSync(editTarget)}\n`);
  process.stdout.write(`create target: ${createTarget}\n`);
  process.stdout.write(`create target exists: ${existsSync(createTarget)}\n`);
  if (resolved.status === "found") {
    for (const copy of shadowedCopies({ repoRoot, editRoot, name })) {
      process.stdout.write(`shadowed copy: ${copy}\n`);
    }
  }
}
