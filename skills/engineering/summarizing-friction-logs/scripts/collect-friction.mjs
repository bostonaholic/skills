#!/usr/bin/env node

/**
 * Collect every frog friction entry in a workspace and render the dashboard's
 * header, table, and footer. Read-only: the only frog command it runs is
 * `frog list`.
 *
 *     node "<skill-dir>/scripts/collect-friction.mjs" [--workspace <dir>] [--no-frog]
 *
 *   --workspace <dir>  the directory holding the repositories. Without it, the
 *                      parent of the current repository's main clone (the
 *                      first path `git worktree list` prints).
 *   --no-frog          read `friction.md` frontmatter even when frog is on PATH.
 *
 * Logs: `<workspace>/<repo>/.agents/friction-log` (scope `<repo>`) and
 * `<workspace>/.agents/friction-log` (scope `global`). Worktrees under
 * `.claude/worktrees/` share their primary clone's log and are never scanned.
 * Each scope is read with `frog list --cwd <scope-dir> --format json`, or,
 * without frog, from each `<log>/<id>/friction.md` frontmatter (`title`,
 * `severity`, optional `target`); the frontmatter has no state, so State
 * renders `unknown`.
 *
 * Stdout, on exit 0, one JSON object:
 *
 *   {
 *     "workspace": "<--workspace as given, else the absolute dir from git>",
 *     "header": "<Markdown line>",
 *     "table": "<Markdown table>",
 *     "footer": "<Markdown bullet list, or empty>",
 *     "gist_slots": [{ "scope": "<scope>", "id": "<id>", "path": "<workspace>/.../friction.md" }]
 *   }
 *
 * `gist_slots` holds every rendered entry, grouped by scope (repos by name,
 * `global` last), table order within a scope.
 *
 * Exit codes:
 *   0  dashboard printed; unreadable scopes, if any, are named in the footer
 *   1  usage error, no workspace (outside a repository without --workspace),
 *      workspace not a directory, or no friction log under the workspace
 *   2  every friction log found could not be read (each named on stderr)
 */

import { spawnSync } from "node:child_process";
import { accessSync, constants, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const NAME = "collect-friction.mjs";
const USAGE = `usage: ${NAME} [--workspace <dir>] [--no-frog]`;
const LOG_SUBPATH = join(".agents", "friction-log");
const GLOBAL = "global";
const SEVERITIES = ["blocker", "major", "minor"];
const GLYPHS = { blocker: "🔴", major: "🟠", minor: "🟡" };
// frog ids start with a YYYYMMDDHHMMSS timestamp; Logged and "newest" come from it.
const ID_PATTERN = /^(\d{4})(\d{2})(\d{2})\d{6}/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// The author's rule: a scope over 15 entries would bury the others, so render
// only its 10 most pressing and count the rest.
const BOUND_ABOVE = 15;
const BOUND_KEEP = 10;

export function parseArgs(argv) {
  const options = { workspace: null, frog: true };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--no-frog") options.frog = false;
    else if (arg === "--workspace" && argv[i + 1] !== undefined) options.workspace = argv[++i];
    else return null;
  }
  return options;
}

function isDirectory(path) {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}

function resolveWorkspace(given) {
  if (given !== null) {
    if (!isDirectory(given)) return { error: `workspace is not a directory: ${given}` };
    return { workspace: given };
  }
  const run = spawnSync("git", ["worktree", "list", "--porcelain"], { encoding: "utf8" });
  const first = run.status === 0 ? run.stdout.split("\n")[0] : "";
  if (!first.startsWith("worktree ")) {
    return { error: "not in a git repository; pass --workspace <dir>" };
  }
  return { workspace: dirname(first.slice("worktree ".length)) };
}

function discoverScopes(workspace) {
  const scopes = [];
  for (const child of readdirSync(workspace).sort()) {
    if (isDirectory(join(workspace, child, LOG_SUBPATH))) {
      scopes.push({ name: child, dir: join(workspace, child) });
    }
  }
  if (isDirectory(join(workspace, LOG_SUBPATH))) scopes.push({ name: GLOBAL, dir: workspace });
  return scopes;
}

function frogOnPath() {
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;
    try {
      accessSync(join(dir, "frog"), constants.X_OK);
      return true;
    } catch {
      // not in this PATH entry
    }
  }
  return false;
}

function validateEntry(entry, where) {
  if (typeof entry?.id !== "string" || !ID_PATTERN.test(entry.id)) {
    throw new Error(`${where}: id must start with a YYYYMMDDHHMMSS timestamp`);
  }
  if (typeof entry.title !== "string" || entry.title.trim() === "") {
    throw new Error(`${where}: missing title`);
  }
  if (!SEVERITIES.includes(entry.severity)) {
    throw new Error(`${where}: severity must be one of ${SEVERITIES.join(", ")}`);
  }
  return {
    id: entry.id,
    title: entry.title.trim(),
    severity: entry.severity,
    state: typeof entry.state === "string" && entry.state ? entry.state : "unknown",
    target: typeof entry.target === "string" && entry.target ? entry.target : null,
  };
}

function readWithFrog(scope) {
  const run = spawnSync("frog", ["list", "--cwd", scope.dir, "--format", "json"], {
    encoding: "utf8",
  });
  if (run.error) throw new Error(`frog list failed: ${run.error.message}`);
  if (run.status !== 0) {
    throw new Error(`frog list exited ${run.status}: ${run.stderr.trim().split("\n")[0] ?? ""}`);
  }
  let entries;
  try {
    entries = JSON.parse(run.stdout);
  } catch {
    throw new Error("frog list printed invalid JSON");
  }
  if (!Array.isArray(entries)) throw new Error("frog list did not print a JSON array");
  return entries.map((entry, index) => validateEntry(entry, `frog list entry ${index}`));
}

export function parseFrontmatter(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== "---") return null;
  const end = lines.indexOf("---", 1);
  if (end === -1) return null;
  const fields = {};
  for (const line of lines.slice(1, end)) {
    const match = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!match) continue;
    fields[match[1]] = match[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return fields;
}

function readWithoutFrog(scope) {
  const log = join(scope.dir, LOG_SUBPATH);
  const entries = [];
  for (const id of readdirSync(log).sort()) {
    if (!isDirectory(join(log, id))) continue;
    const path = join(log, id, "friction.md");
    let text;
    try {
      text = readFileSync(path, "utf8");
    } catch {
      throw new Error(`cannot read ${path}`);
    }
    const fields = parseFrontmatter(text);
    if (fields === null) throw new Error(`${path}: no frontmatter`);
    entries.push(validateEntry({ ...fields, id, state: undefined }, path));
  }
  return entries;
}

function newestFirst(a, b) {
  return b.id.slice(0, 14).localeCompare(a.id.slice(0, 14)) || a.id.localeCompare(b.id);
}

function bySeverityThenNewest(a, b) {
  return SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || newestFirst(a, b);
}

function countWord(count, singular, pluralWord) {
  return `${count} ${count === 1 ? singular : pluralWord}`;
}

function severityCounts(entries) {
  return SEVERITIES.map((severity) => ({
    severity,
    count: entries.filter((entry) => entry.severity === severity).length,
  }));
}

function logged(id) {
  const [, , month, day] = ID_PATTERN.exec(id);
  return `${MONTHS[Number(month) - 1]} ${Number(day)}`;
}

function cell(text) {
  return text.replace(/\|/g, "\\|");
}

/**
 * Render the dashboard from read scopes. Pure: `scopes` is
 * [{ name, dir, entries }] for readable scopes, `unreadable` is
 * [{ name, reason }], `usedFrog` says where entries came from.
 */
export function renderDashboard({ workspace, scopes, unreadable, usedFrog }) {
  const ordered = [
    ...scopes.filter((scope) => scope.name !== GLOBAL),
    ...scopes.filter((scope) => scope.name === GLOBAL),
  ];
  const bounded = [];
  const rendered = [];
  for (const scope of ordered) {
    const sorted = [...scope.entries].sort(bySeverityThenNewest);
    const shown = sorted.length > BOUND_ABOVE ? sorted.slice(0, BOUND_KEEP) : sorted;
    if (shown.length < sorted.length) {
      bounded.push({ name: scope.name, total: sorted.length, hidden: sorted.slice(shown.length) });
    }
    for (const entry of shown) rendered.push({ ...entry, scope: scope.name, dir: scope.dir });
  }

  const all = ordered.flatMap((scope) => scope.entries);
  const repoEntries = ordered
    .filter((scope) => scope.name !== GLOBAL)
    .flatMap((scope) => scope.entries);
  const reposWithEntries = ordered.filter(
    (scope) => scope.name !== GLOBAL && scope.entries.length > 0,
  ).length;
  const globalCount = all.length - repoEntries.length;
  const breakdown = severityCounts(all)
    .map(({ severity, count }) => `${count} ${severity}`)
    .join(" · ");
  let header =
    `${countWord(repoEntries.length, "entry", "entries")} across ` +
    `${countWord(reposWithEntries, "repo", "repos")} + ${globalCount} global: ${breakdown}`;
  if (bounded.length > 0) {
    header += ` (bounded: ${bounded.map((b) => `${b.name} ${b.total}→${BOUND_KEEP}`).join(", ")})`;
  }

  const rows = [...rendered].sort(
    (a, b) => bySeverityThenNewest(a, b) || a.scope.localeCompare(b.scope),
  );
  const table = [
    "| Sev | Scope | Entry | State | Logged |",
    "| --- | --- | --- | --- | --- |",
    ...rows.map((entry) => {
      const title = entry.target ? `${entry.title} (upstream: ${entry.target})` : entry.title;
      return `| ${GLYPHS[entry.severity]} ${entry.severity} | ${entry.scope} | ${cell(title)} | ${entry.state} | ${logged(entry.id)} |`;
    }),
  ].join("\n");

  const footer = [];
  const empty = ordered.filter((scope) => scope.entries.length === 0).map((scope) => scope.name);
  if (empty.length > 0) footer.push(`- No entries: ${empty.join(", ")}`);
  for (const { name, reason } of unreadable) footer.push(`- Could not read ${name}: ${reason}`);
  for (const { name, total, hidden } of bounded) {
    const counts = severityCounts(hidden)
      .filter(({ count }) => count > 0)
      .map(({ severity, count }) => `${count} ${severity}`)
      .join(", ");
    footer.push(`- ${name}: ${total} entries; + ${hidden.length} more (${counts}) not rendered`);
  }
  if (!usedFrog) {
    footer.push("- frog not used: read friction.md frontmatter, which carries no state");
  }

  return {
    workspace,
    header,
    table,
    footer: footer.join("\n"),
    gist_slots: ordered.flatMap((scope) =>
      rendered
        .filter((entry) => entry.scope === scope.name)
        .map((entry) => ({
          scope: entry.scope,
          id: entry.id,
          path: join(entry.dir, LOG_SUBPATH, entry.id, "friction.md"),
        })),
    ),
  };
}

export function main(argv) {
  const options = parseArgs(argv);
  if (options === null) {
    process.stderr.write(`${NAME}: ${USAGE}\n`);
    return 1;
  }
  const { workspace, error } = resolveWorkspace(options.workspace);
  if (error) {
    process.stderr.write(`${NAME}: ${error}\n`);
    return 1;
  }
  const found = discoverScopes(workspace);
  if (found.length === 0) {
    process.stderr.write(`${NAME}: no ${LOG_SUBPATH} directory under ${workspace}\n`);
    return 1;
  }
  const usedFrog = options.frog && frogOnPath();
  const scopes = [];
  const unreadable = [];
  for (const scope of found) {
    try {
      const entries = usedFrog ? readWithFrog(scope) : readWithoutFrog(scope);
      scopes.push({ ...scope, entries });
    } catch (readError) {
      unreadable.push({ name: scope.name, reason: readError.message });
      process.stderr.write(`${NAME}: cannot read ${scope.name}: ${readError.message}\n`);
    }
  }
  if (scopes.length === 0) {
    process.stderr.write(`${NAME}: no friction log could be read\n`);
    return 2;
  }
  const dashboard = renderDashboard({ workspace, scopes, unreadable, usedFrog });
  process.stdout.write(`${JSON.stringify(dashboard, null, 2)}\n`);
  return 0;
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
