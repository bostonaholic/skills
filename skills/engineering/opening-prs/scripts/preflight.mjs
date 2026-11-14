#!/usr/bin/env node

/**
 * Decide, before anything is pushed, whether this run opens a new draft PR,
 * refreshes an open one, or refuses.
 *
 *     node "<skill-dir>/scripts/preflight.mjs" [<pr-number-or-url>] [--inputs <path>]
 *
 *     import { closingLineRefusal, decideMode } from "<skill-dir>/scripts/preflight.mjs";
 *
 *   <pr-number-or-url>  refresh that PR; no open-PR lookup runs
 *   --inputs <path>     the caller's inputs file, checked for its
 *                       `## Closing line` heading
 *
 * Run it from the repository, on the branch to push. It never pushes, and it
 * never calls `gh pr create` or `gh pr edit`.
 *
 * Checks, in order: the arguments; the inputs file, when named, reads and
 * holds at most one line exactly `## Closing line` with at most one non-empty
 * line under it; the current branch (a detached HEAD, or a name outside
 * `[A-Za-z0-9._/-]`, refuses); the default
 * branch from `gh repo view`; the `gh stack` layer check, where a non-zero
 * `gh stack view --json` means the branch is in no stack; and, with no PR
 * argument only, `gh pr list --head <branch> --state open --json url`, whose
 * one URL must match the PR argument's URL form.
 *
 * Stdout, on exit 0 only, one KEY=VALUE line each, in this order:
 *
 *   BRANCH  the current branch
 *   MODE    `open` when no open PR heads the branch, else `refresh`
 *   PR      refresh mode only: the PR argument, or the one open PR's URL
 *
 * Requires `git`, and `gh` authenticated for the repository's host.
 *
 * Exit codes:
 *
 *   0  decided
 *   1  refused: stderr says `refused: <reason>`, naming the heading, path,
 *      branch, `stacking-prs`, or the open PR URLs. Nothing was pushed
 *   2  usage or fault: a bad argument, `git` or `gh` missing, or a failed
 *      `git` or `gh` call, whose stderr comes first
 */

import { readFileSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

// The skill file that explains each exit code.
const DOC_PATH = fileURLToPath(new URL("../SKILL.md", import.meta.url));

const USAGE = "usage: preflight.mjs [<pr-number-or-url>] [--inputs <path>]";
const CLOSING_HEADING = "## Closing line";
const PR_ARGUMENT =
  /^(?:\d+|https:\/\/[A-Za-z0-9.-]+\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\/pull\/\d+)$/;
// The skill puts the branch into `git push` and `gh pr list` command text, so
// it holds only these ASCII characters. Git already refuses a leading `-`.
const BRANCH_NAME = /^[A-Za-z0-9._/-]+$/;

/**
 * The reason an inputs file's `## Closing line` heading is unusable, or "".
 * The heading may be absent. When present, it appears once, and the lines up
 * to the next `## ` heading hold at most one non-empty line.
 */
export function closingLineRefusal(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const starts = lines.flatMap((line, index) => (line === CLOSING_HEADING ? [index] : []));
  if (starts.length === 0) return "";
  if (starts.length > 1) return `the inputs file repeats the \`${CLOSING_HEADING}\` heading`;
  const rest = lines.slice(starts[0] + 1);
  const next = rest.findIndex((line) => line.startsWith("## "));
  const body = (next < 0 ? rest : rest.slice(0, next)).filter((line) => line.trim() !== "");
  if (body.length > 1) {
    return `the inputs file's \`${CLOSING_HEADING}\` holds ${body.length} non-empty lines, not one`;
  }
  return "";
}

/**
 * The mode for the open PR URLs that head the branch: `{mode, pr}` for zero or
 * one, or `{refusal}` for two or more, since no rule picks among them.
 */
export function decideMode(urls) {
  if (urls.length === 0) return { mode: "open" };
  if (urls.length === 1) return { mode: "refresh", pr: urls[0] };
  return { refusal: `the branch heads more than one open PR: ${urls.join(" ")}` };
}

/** `{pr, inputs}` from the command line, or `{error}` for a usage fault. */
function parseArgs(argv) {
  let pr;
  let inputs;
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (token === "--inputs") {
      const value = argv[index + 1];
      if (inputs !== undefined || value === undefined || value.startsWith("--")) {
        return { error: USAGE };
      }
      inputs = value;
      index++;
    } else if (token.startsWith("--") || pr !== undefined || !PR_ARGUMENT.test(token)) {
      return { error: USAGE };
    } else {
      pr = token;
    }
  }
  return { pr, inputs };
}

// CLI entry point: runs only on direct execution, never on import.
// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const stop = (code, message) => {
    process.stderr.write(`${message}\nsee ${DOC_PATH}\n`);
    process.exit(code);
  };
  const refuse = (reason) => stop(1, `refused: ${reason}`);
  const fault = (message) => stop(2, `preflight.mjs: ${message}`);

  // Runs `tool` and returns its stdout. A missing tool or a non-zero exit is a
  // fault, with the tool's own stderr forwarded first.
  const run = (tool, args) => {
    const result = spawnSync(tool, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    if (result.error) {
      return fault(
        result.error.code === "ENOENT"
          ? `missing required tool: ${tool}`
          : `${tool} could not start: ${result.error.message}`,
      );
    }
    if (result.status !== 0) {
      if (result.stderr) process.stderr.write(result.stderr.replace(/\n?$/, "\n"));
      return fault(`${tool} ${args.slice(0, 2).join(" ")} failed (exit ${result.status})`);
    }
    return result.stdout;
  };
  const json = (tool, args) => {
    const text = run(tool, args);
    try {
      return JSON.parse(text);
    } catch {
      return fault(`${tool} ${args.slice(0, 2).join(" ")} printed no JSON`);
    }
  };

  const args = parseArgs(process.argv.slice(2));
  if (args.error) fault(args.error);

  if (args.inputs !== undefined) {
    let text;
    try {
      text = readFileSync(args.inputs, "utf8");
    } catch (error) {
      refuse(`cannot read the inputs file ${args.inputs}: ${error.code ?? error.message}`);
    }
    const reason = closingLineRefusal(text);
    if (reason) refuse(reason);
  }

  const branch = run("git", ["branch", "--show-current"]).trim();
  if (branch === "") refuse("HEAD is detached; check out the branch to push");
  if (!BRANCH_NAME.test(branch)) {
    refuse(`branch \`${branch}\` is outside the allowed characters [A-Za-z0-9._/-]; rename it`);
  }

  const defaultBranch = json("gh", ["repo", "view", "--json", "defaultBranchRef"])?.defaultBranchRef
    ?.name;
  if (typeof defaultBranch !== "string") fault("gh repo view printed no default branch");
  if (branch === defaultBranch) refuse(`${branch} is the repository's default branch`);

  // Exit status is the probe: gh stack exits non-zero on a branch in no stack,
  // and when the extension is absent, so its stderr is discarded.
  const stack = spawnSync("gh", ["stack", "view", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (stack.status === 0) {
    let view;
    try {
      view = JSON.parse(stack.stdout);
    } catch {
      fault("gh stack view --json printed no JSON");
    }
    const layers = Array.isArray(view?.branches) ? view.branches.map((layer) => layer?.name) : [];
    if (layers.includes(branch)) {
      refuse(`${branch} is a gh stack layer; open and update its PR with stacking-prs`);
    }
  }

  let decision = { mode: "refresh", pr: args.pr };
  if (args.pr === undefined) {
    const open = json("gh", ["pr", "list", "--head", branch, "--state", "open", "--json", "url"]);
    if (!Array.isArray(open)) fault("gh pr list printed no list");
    decision = decideMode(open.map((row) => row?.url).filter((url) => typeof url === "string"));
    if (decision.refusal) refuse(decision.refusal);
    if (decision.pr !== undefined && !PR_ARGUMENT.test(decision.pr)) {
      refuse(`the open PR URL \`${decision.pr}\` is not a plain pull request URL`);
    }
  }

  const lines = [`BRANCH=${branch}`, `MODE=${decision.mode}`];
  if (decision.mode === "refresh") lines.push(`PR=${decision.pr}`);
  process.stdout.write(`${lines.join("\n")}\n`);
}
