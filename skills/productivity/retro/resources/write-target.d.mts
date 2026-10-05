// Type declarations for write-target.mjs — the .mjs is the source of truth;
// this stub only describes its exports for `tsc --noEmit`. Consumed by
// TypeScript tooling, never at runtime.

/** True only for a name matching `^[a-z][a-z0-9-]*$`. */
export function isValidSkillName(name: unknown): boolean;

/** True only for a plain repo-relative path: no absolute, `..`, `.`, or empty segment. */
export function isValidRepoPath(path: unknown): boolean;

export interface ContainmentQuery {
  /** The write target, whose final component need not exist yet. */
  candidatePath: string;
  /** `git rev-parse --show-toplevel`. */
  repoRoot: string;
}

/** True only when the resolved real path stays inside `repoRoot`. */
export function isInsideRepo(query: ContainmentQuery): boolean;

/** True when the repo carries `.claude-plugin/plugin.json` or `plugin.json`. */
export function hasPluginMarker(repoRoot: string): boolean;

export interface EditRootQuery {
  repoRoot: string;
  /** The plugin-marker probe result, injected so the tie-break stays pure. */
  hasPluginMarker: boolean;
}

/** The root the running host loads: <repo>/skills or <repo>/.claude/skills. */
export function preferredEditRoot(query: EditRootQuery): string;

export interface EditTargetQuery {
  /** The result of `preferredEditRoot`. */
  editRoot: string;
  /** A name already accepted by `isValidSkillName`. */
  name: string;
}

export type EditTargetResult =
  /** Exactly one `<editRoot>/[<category>/]<name>/SKILL.md` exists. */
  | { status: "found"; target: string }
  /** None exists; `target` is the flat `<editRoot>/<name>/SKILL.md`. */
  | { status: "missing"; target: string }
  /** More than one exists; the caller must refuse. */
  | { status: "ambiguous"; matches: string[] };

/** Locates a skill directly under `editRoot` or one category level down. */
export function resolveEditTarget(query: EditTargetQuery): EditTargetResult;
