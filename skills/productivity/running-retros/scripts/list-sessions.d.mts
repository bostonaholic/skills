// Type declarations for list-sessions.mjs. The .mjs is the source of truth;
// this stub only describes its exports for `tsc --noEmit`. Consumed by
// TypeScript tooling, never at runtime.

/** The `payload.cwd` a Codex `session_meta` header records, or null. */
export function declaredCwd(headText: string | null | undefined): string | null;

export interface SessionsQuery {
  /** A file-store host: "claude-code" or "codex". */
  host: string;
  /** The host's session store, from `storeRootFor`. */
  storeRoot: string;
  /** The repository's real absolute path. */
  repoRoot: string;
}

/** Transcripts in the store that belong to `repoRoot`, unordered. */
export function sessionsFor(query: SessionsQuery): string[];

export interface NewestFirstQuery {
  host: string;
  files: readonly string[];
  /** The running session's id; its transcript is left out. */
  currentSessionId: string | null;
  /** Modification time in milliseconds, injected so ordering stays pure. */
  mtimeOf: (file: string) => number;
}

/** `files` minus the current session, newest first, ties broken by path. */
export function newestFirst(query: NewestFirstQuery): string[];
