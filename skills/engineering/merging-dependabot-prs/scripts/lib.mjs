// Shared helpers for analyze.mjs, render-plan.mjs, and act.mjs. Not a CLI.
//
// Pure functions (parsePairs, classifyLevel, maxLevel, ciFromBuckets, matchAdvisories,
// decide, decideRebaseOnly) take plain data and touch nothing. runGh and the read*
// functions call `gh` synchronously and return parsed data or throw a GhError.
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

// gh reports a bot PR author as `app/<slug>`, and a bot commit author as `<slug>[bot]`.
export const DEPENDABOT_AUTHOR = "app/dependabot";
export const DEPENDABOT_COMMITTER = "dependabot[bot]";
export const PR_NUMBER_PATTERN = /^[0-9]+$/;
// Full 40-hex commit SHA, the only head form `--match-head-commit` should get.
export const HEAD_SHA_PATTERN = /^[0-9a-f]{40}$/;
// Validated under the skill's external-data rules before any value reaches a command.
const TAG_PATTERN = /^[A-Za-z0-9._+/-]+$/;
const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const PACKAGE_PATTERN = /^[A-Za-z0-9@/._-]+$/;
// A PR body carries up to 65,536 characters of release notes; 16 MiB leaves room for
// multi-byte text and gh's JSON escaping. spawnSync's 1 MiB default fails on a few bodies.
const GH_OUTPUT_LIMIT_BYTES = 16 * 1024 * 1024;
export const LEVELS = ["patch", "minor", "major", "unknown"];
// Dependabot branch directory (`dependabot/<dir>/...`) to the alert API's ecosystem name.
// A directory missing here leaves security `unknown` rather than matching by name alone.
const ECOSYSTEMS = {
  bundler: "rubygems",
  cargo: "rust",
  composer: "composer",
  github_actions: "actions",
  gomod: "go",
  gradle: "maven",
  maven: "maven",
  mix: "erlang",
  npm_and_yarn: "npm",
  nuget: "nuget",
  pip: "pip",
  pub: "pub",
  swift: "swift",
};

export class GhError extends Error {
  constructor(message, { missing = false, stderr = "" } = {}) {
    super(message);
    this.missing = missing;
    this.stderr = stderr;
  }
}

/** Runs gh; returns `{status, stdout, stderr}`. Throws GhError({missing}) when gh is absent. */
export function runGh(args) {
  const run = spawnSync("gh", args, { encoding: "utf8", maxBuffer: GH_OUTPUT_LIMIT_BYTES });
  if (run.error?.code === "ENOENT") throw new GhError("gh not found on PATH", { missing: true });
  if (run.error) throw new GhError(`gh ${args[0]} ${args[1]}: ${run.error.message}`);
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

/**
 * Writes a failed tool's stderr unaltered, ending it with a newline so the caller's own
 * line starts on a line of its own. Writes nothing for empty text.
 */
export function writeToolError(text) {
  if (!text) return;
  process.stderr.write(text.endsWith("\n") ? text : `${text}\n`);
}

function ghJson(args) {
  const run = runGh(args);
  if (run.status !== 0) {
    writeToolError(run.stderr);
    throw new GhError(
      `gh ${args.slice(0, 3).join(" ")} exited ${run.status}: ${firstLine(run.stderr)}`,
      {
        stderr: run.stderr,
      },
    );
  }
  try {
    return JSON.parse(run.stdout);
  } catch {
    throw new GhError(`gh ${args.slice(0, 3).join(" ")} printed output that is not JSON`);
  }
}

export function firstLine(text) {
  return (text ?? "").trim().split("\n")[0] || "no message";
}

/** One PR's state, as the decision table and the act gate read it. */
export function readPr(number) {
  const pr = ghJson([
    "pr",
    "view",
    number,
    "--json",
    "number,title,body,state,isDraft,author,headRefName,headRefOid,mergeStateStatus,commits",
  ]);
  const committers = (pr.commits ?? []).flatMap((commit) =>
    (commit.authors ?? []).map((author) => author.login ?? author.name ?? "unknown"),
  );
  return {
    number: pr.number,
    title: pr.title ?? "",
    body: pr.body ?? "",
    state: pr.state,
    isDraft: pr.isDraft === true,
    author: pr.author?.login ?? "unknown",
    branch: pr.headRefName ?? "",
    head: pr.headRefOid,
    mergeState: pr.mergeStateStatus,
    editedBy: [...new Set(committers.filter((login) => login !== DEPENDABOT_COMMITTER))].sort(),
  };
}

/** CI as pass, fail, pending, or none, from `gh pr checks --json bucket`. */
export function readCi(number) {
  const run = runGh(["pr", "checks", number, "--json", "bucket"]);
  // gh exits 1 on failing checks and 8 on pending ones, even with --json, so trust the JSON.
  try {
    const checks = JSON.parse(run.stdout);
    if (Array.isArray(checks)) return ciFromBuckets(checks.map((check) => check.bucket));
  } catch {
    // Not JSON: fall through to the stderr cases below.
  }
  if (/no checks reported/i.test(run.stderr)) return "none";
  writeToolError(run.stderr);
  throw new GhError(`gh pr checks ${number} exited ${run.status}: ${firstLine(run.stderr)}`, {
    stderr: run.stderr,
  });
}

export function ciFromBuckets(buckets) {
  if (buckets.length === 0) return "none";
  if (buckets.some((bucket) => bucket === "fail" || bucket === "cancel")) return "fail";
  if (buckets.some((bucket) => bucket === "pending")) return "pending";
  if (buckets.every((bucket) => bucket === "pass" || bucket === "skipping")) return "pass";
  return "fail"; // An unknown bucket never counts as passing.
}

/**
 * Every `from <old> to <new>` pair Dependabot writes: the title's `Bump <pkg> from`, and
 * body lines that start with `Bumps [<pkg>](...)` or `Updates \`<pkg>\``. Only line starts
 * count, so upstream commit lists quoted in the release notes add no pairs. Each pair
 * carries the compare-link tag and repo from its own body section, when present and valid.
 */
export function parsePairs(title, body) {
  const pairs = [];
  const add = (pkg, from, to, section) => {
    if (pairs.some((p) => p.pkg === pkg && p.from === from && p.to === to)) return;
    const compare =
      /\/\/[^/\s"'<>]+\/([^/\s"'<>]+\/[^/\s"'<>]+)\/compare\/\S+?\.\.\.([^\s"'<>)]+)/.exec(section);
    const repo = compare?.[1];
    const tag = compare?.[2];
    pairs.push({
      pkg,
      from,
      to,
      level: classifyLevel(from, to),
      grepSafe: PACKAGE_PATTERN.test(pkg),
      upstreamRepo: repo && REPO_PATTERN.test(repo) ? repo : null,
      tag: tag && TAG_PATTERN.test(tag) && !tag.startsWith("-") ? tag : null,
    });
  };

  const lines = body.split(/\r?\n/);
  const starts = [];
  lines.forEach((line, index) => {
    const match =
      /^Bumps \[([^\]]+)\]\([^)]*\) from (\S+) to (\S+?)\.?$/.exec(line) ??
      /^Updates `([^`]+)` from (\S+) to (\S+?)\.?$/.exec(line);
    if (match) starts.push({ index, pkg: match[1], from: match[2], to: match[3] });
  });
  const bodyPairs = starts.map((start, i) => {
    const end = starts[i + 1]?.index ?? lines.length;
    return { ...start, section: lines.slice(start.index, end).join("\n") };
  });

  const titleMatch = /\b[Bb]ump (\S+) from (\S+) to (\S+)/.exec(title);
  if (titleMatch) {
    const [, pkg, from, to] = titleMatch;
    const same = bodyPairs.find((p) => p.pkg === pkg && p.from === from && p.to === to);
    add(pkg, from, to, same?.section ?? body);
  }
  for (const p of bodyPairs) add(p.pkg, p.from, p.to, p.section);
  return pairs;
}

function numericParts(version) {
  const parts = version.replace(/^v/, "").split(".");
  return parts.every((part) => /^[0-9]+$/.test(part)) ? parts.map(Number) : null;
}

/** patch, minor, major, or unknown; a 0.x minor change counts as major. */
export function classifyLevel(from, to) {
  const a = numericParts(from);
  const b = numericParts(to);
  if (!a || !b) return "unknown";
  const [aMajor = 0, aMinor = 0] = a;
  const [bMajor = 0, bMinor = 0] = b;
  if (aMajor !== bMajor) return "major";
  if (aMinor !== bMinor) return aMajor === 0 ? "major" : "minor";
  return "patch";
}

export function maxLevel(pairs) {
  if (pairs.length === 0) return "unknown";
  return pairs.reduce(
    (worst, pair) => (LEVELS.indexOf(pair.level) > LEVELS.indexOf(worst) ? pair.level : worst),
    "patch",
  );
}

/** -1, 0, or 1; null when either version is not all-numeric. */
export function compareVersions(left, right) {
  const a = numericParts(left);
  const b = numericParts(right);
  if (!a || !b) return null;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return Math.sign(diff);
  }
  return 0;
}

export function ecosystemOf(branch) {
  return ECOSYSTEMS[branch.split("/")[1]] ?? null;
}

/**
 * `alerts` is null when the alert read was forbidden or missing. Returns
 * `{security, advisories}`: yes with each matching alert, no, or unknown.
 */
export function matchAdvisories(alerts, ecosystem, pairs) {
  if (alerts === null || ecosystem === null) return { security: "unknown", advisories: [] };
  const advisories = alerts
    .filter((alert) => alert.ecosystem === ecosystem)
    .filter((alert) =>
      pairs.some(
        (pair) =>
          pair.pkg.toLowerCase() === alert.pkg.toLowerCase() &&
          compareVersions(alert.firstPatched, pair.to) !== null &&
          compareVersions(alert.firstPatched, pair.to) <= 0,
      ),
    )
    .map(({ ghsa, severity }) => ({ ghsa, severity }));
  return { security: advisories.length > 0 ? "yes" : "no", advisories };
}

/**
 * Every row of the decision table except the breaking-note row, first match wins.
 * `needsNotes` marks the patch and minor PRs the breaking-note row can still skip.
 */
export function decide({ author, state, isDraft, editedBy, level, ci, mergeState }) {
  const skip = (reason) => ({ decision: "skip", reason, needsNotes: false });
  if (author !== DEPENDABOT_AUTHOR) return skip(`author is ${author}`);
  if (state !== "OPEN") return skip(`state is ${state}`);
  if (isDraft) return skip("draft");
  if (editedBy.length > 0) {
    return skip(
      `edited by ${editedBy.join(", ")}; @dependabot recreate would discard their commits, so post it only if the user asks`,
    );
  }
  if (level === "major" || level === "unknown") {
    return skip(`level ${level}: report the breaking notes and usage`);
  }
  const candidate = (decision, reason) => ({ decision, reason, needsNotes: true });
  if (ci === "fail" || ci === "none") return candidate("skip", `CI ${ci}`);
  if (ci === "pending") return candidate("skip", "CI pending; re-run when CI finishes");
  if (mergeState === "BEHIND" || mergeState === "DIRTY") {
    return candidate("rebase", "comment @dependabot rebase");
  }
  if ((mergeState === "CLEAN" || mergeState === "HAS_HOOKS") && ci === "pass") {
    return candidate("merge", "");
  }
  return candidate("skip", `merge state ${mergeState}`);
}

/** Rebase-only classification: skip, needs-recreate, or rebase. */
export function decideRebaseOnly({ author, state, editedBy }) {
  if (author !== DEPENDABOT_AUTHOR) return { decision: "skip", reason: `author is ${author}` };
  if (state !== "OPEN") return { decision: "skip", reason: `state is ${state}` };
  if (editedBy.length > 0) {
    return {
      decision: "needs-recreate",
      reason: `edited by ${editedBy.join(", ")}; Dependabot ignores @dependabot rebase, and only the user decides to post @dependabot recreate`,
    };
  }
  return { decision: "rebase", reason: "" };
}

/** True when this module is the script node was asked to run, symlinked paths included. */
export function isMain(importMetaUrl) {
  return (
    Boolean(process.argv[1]) && importMetaUrl === pathToFileURL(realpathSync(process.argv[1])).href
  );
}
