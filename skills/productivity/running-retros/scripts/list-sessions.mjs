#!/usr/bin/env node

/**
 * List this repository's past agent sessions on the running host, newest
 * first, leaving out the session that is running now.
 *
 *     node "<skill-dir>/scripts/list-sessions.mjs" <repo-root> <count>
 *
 * Arguments: <repo-root> is `git rev-parse --show-toplevel`; <count> is the
 * most sessions to print, a positive integer.
 *
 * A session belongs to the repository when Claude Code filed it under the
 * repository's project directory, or when a Codex rollout's recorded working
 * directory is the repository root or lies under it. The running host and the
 * current session come from the host's own environment variables (the same
 * ones resolve-transcript.mjs reads), so a test pins them by setting the
 * environment.
 *
 * Output: `host:`, `store:`, and `found:` (every matching session, before the
 * count cap) lines, then one `session: <absolute path>` line per transcript,
 * newest modification time first, ties broken by path. Feed each path to
 * `resolve-transcript.mjs <run-cache> --file <path>`.
 *
 * Named failures: unsupported-host, ambiguous-host, unsupported-store
 * (OpenCode), no-session-id, no-session-store, no-repo-root.
 *
 * Exit codes: 0 when the store was listed, even with no sessions found; 1 on a
 * usage error or a named failure, whose name is the first stderr line, followed
 * by `tried:` and `note:` lines.
 */

import { existsSync, realpathSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  HOSTS,
  detectHost,
  namesSession,
  projectSlug,
  readHead,
  storeRootFor,
  transcriptsUnder,
} from "./resolve-transcript.mjs";

/** The working directory a Codex rollout records in its `session_meta` header. */
export function declaredCwd(headText) {
  for (const line of String(headText ?? "").split("\n")) {
    if (line.trim() === "") continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      // A truncated final line is expected: the probe cuts at a byte offset.
      continue;
    }
    if (record?.type === "session_meta") {
      return typeof record?.payload?.cwd === "string" ? record.payload.cwd : null;
    }
  }
  return null;
}

/** True when `directory` is `repoRoot` or lies under it. */
function isWithin(directory, repoRoot) {
  const dir = resolve(directory);
  return dir === repoRoot || dir.startsWith(repoRoot + sep);
}

/** Transcripts in `host`'s store at `storeRoot` that belong to `repoRoot`. */
export function sessionsFor({ host, storeRoot, repoRoot }) {
  if (host === "claude-code") {
    // Depth 0 inside the project directory keeps `subagents/` out, as in
    // resolve-transcript.mjs.
    return transcriptsUnder(join(storeRoot, projectSlug(repoRoot)), 0);
  }
  return transcriptsUnder(storeRoot, HOSTS[host].depth).filter((file) => {
    const cwd = declaredCwd(readHead(file));
    return cwd !== null && isWithin(cwd, repoRoot);
  });
}

/**
 * `files` without the current session's transcript, newest modification time
 * first, ties broken by path so the order is stable. `mtimeOf` is injected so
 * the ordering stays pure.
 */
export function newestFirst({ host, files, currentSessionId, mtimeOf }) {
  return files
    .filter((file) => !(currentSessionId && namesSession(host, file, currentSessionId)))
    .map((file) => ({ file, mtime: mtimeOf(file) }))
    .sort((a, b) => b.mtime - a.mtime || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
    .map(({ file }) => file);
}

// CLI entry point: runs only when executed directly, never on import, so a
// test import has no side effects.
// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const repoArg = process.argv[2] ?? "";
  const countArg = process.argv[3] ?? "";
  if (!repoArg || !/^[1-9][0-9]*$/.test(countArg) || process.argv.length > 4) {
    process.stderr.write("usage: list-sessions.mjs <repo-root> <count>\n");
    process.exit(1);
  }

  const fail = (failure, tried, note) => {
    process.stderr.write(`${failure}\n`);
    for (const line of tried) process.stderr.write(`  tried: ${line}\n`);
    process.stderr.write(`  note: ${note}\n`);
    process.exit(1);
  };

  if (!existsSync(repoArg)) {
    fail("no-repo-root", [repoArg], "the repository root does not exist");
  }
  // The real path, because a Codex rollout records the real working directory
  // and Claude Code derives its project directory from it.
  const repoRoot = realpathSync(resolve(repoArg));

  const candidates = detectHost(process.env);
  if (candidates.length === 0) {
    fail(
      "unsupported-host",
      Object.keys(HOSTS),
      "past sessions are listed from Claude Code and Codex stores; no host variable is set",
    );
  }
  if (candidates.length > 1) {
    fail(
      "ambiguous-host",
      candidates.map((candidate) => candidate.host),
      "two agents' session variables are set in one process, so the store to list is unknown",
    );
  }
  const [{ host, sessionId }] = candidates;
  if (HOSTS[host].kind === "sqlite") {
    fail(
      "unsupported-store",
      [storeRootFor(host, process.env)],
      "OpenCode keeps past sessions in SQLite, which this script does not list",
    );
  }

  // Without the host's id for this session it cannot be left out, and listing
  // it would feed the session being retro'd back in as a past one.
  if (!sessionId) {
    fail(
      "no-session-id",
      [host],
      "the host exported no id for this session, so it cannot be excluded from the list",
    );
  }

  const storeRoot = storeRootFor(host, process.env);
  if (!existsSync(storeRoot) || !statSync(storeRoot).isDirectory()) {
    fail("no-session-store", [storeRoot], "the host's session store does not exist");
  }

  const files = newestFirst({
    host,
    files: sessionsFor({ host, storeRoot, repoRoot }),
    currentSessionId: sessionId,
    mtimeOf: (file) => statSync(file).mtimeMs,
  });

  process.stdout.write(`host: ${host}\n`);
  process.stdout.write(`store: ${storeRoot}\n`);
  process.stdout.write(`found: ${files.length}\n`);
  for (const file of files.slice(0, Number(countArg))) {
    process.stdout.write(`session: ${file}\n`);
  }
}
