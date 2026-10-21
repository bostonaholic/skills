#!/usr/bin/env node
// Re-checks one approved Dependabot PR, then merges it or asks Dependabot to rebase it.
//
// Usage: act.mjs <pr-number> <planned-head> merge|rebase
//   <planned-head> is the 40-hex head SHA from the plan (render-plan.mjs `act` lines).
//
// Both actions first require state OPEN, author app/dependabot, and head == <planned-head>.
// merge then acts on the fresh merge state and CI:
//   BEHIND                          comment `@dependabot rebase`
//   CI pending                      skip
//   CLEAN or HAS_HOOKS, CI pass     gh pr merge --squash --match-head-commit <planned-head>,
//                                   then re-read: only MERGED with a merge commit OID counts
//   anything else                   skip, naming merge state and CI
// rebase comments `@dependabot rebase` once the gate passes.
// The only comment body this script ever posts is the literal `@dependabot rebase`. It never
// passes --admin or --auto.
//
// Stdout, exactly one line:
//   merged <oid>
//   rebase-requested <comment-url>
//   skipped <reason>
//   failed <gh message>
//
// Exit codes:
//   0    merged, rebase-requested, or skipped
//   1    failed: a read, the merge, the comment, or the post-merge check (stdout says which)
//   2    usage: wrong arguments, a non-digit PR number, or a head that is not 40 hex chars
//   127  gh not found on PATH
//
// Rerunning is safe after a merge (the gate then skips on state MERGED); rerunning after a
// rebase-requested posts a second comment, so do not rerun that one.
import {
  DEPENDABOT_AUTHOR,
  GhError,
  HEAD_SHA_PATTERN,
  PR_NUMBER_PATTERN,
  firstLine,
  isMain,
  readCi,
  readPr,
  runGh,
} from "./lib.mjs";

const SCRIPT = "act.mjs";
const REBASE_COMMENT = "@dependabot rebase";

function gate(pr, plannedHead) {
  if (pr.state !== "OPEN") return `state is ${pr.state}`;
  if (pr.author !== DEPENDABOT_AUTHOR) return `author is ${pr.author}`;
  if (pr.head !== plannedHead) return "changed since approval; re-run";
  return null;
}

function requestRebase(number) {
  const run = runGh(["pr", "comment", number, "--body", REBASE_COMMENT]);
  if (run.status !== 0) return { line: `failed ${firstLine(run.stderr)}`, code: 1 };
  return { line: `rebase-requested ${firstLine(run.stdout)}`, code: 0 };
}

function merge(number, plannedHead) {
  const run = runGh(["pr", "merge", number, "--squash", "--match-head-commit", plannedHead]);
  if (run.status !== 0) return { line: `failed ${firstLine(run.stderr)}`, code: 1 };
  const check = runGh(["pr", "view", number, "--json", "state,mergeCommit"]);
  if (check.status !== 0) {
    return { line: `failed merge ran but re-read failed: ${firstLine(check.stderr)}`, code: 1 };
  }
  const after = JSON.parse(check.stdout);
  const oid = after.mergeCommit?.oid;
  if (after.state === "MERGED" && oid) return { line: `merged ${oid}`, code: 0 };
  return { line: `failed state is ${after.state} after merge`, code: 1 };
}

function act(number, plannedHead, action) {
  const pr = readPr(number);
  const blocked = gate(pr, plannedHead);
  if (blocked) return { line: `skipped ${blocked}`, code: 0 };
  if (action === "rebase") return requestRebase(number);

  if (pr.mergeState === "BEHIND") return requestRebase(number);
  const ci = readCi(number);
  if (ci === "pending") return { line: "skipped CI pending; re-run", code: 0 };
  if ((pr.mergeState === "CLEAN" || pr.mergeState === "HAS_HOOKS") && ci === "pass") {
    return merge(number, plannedHead);
  }
  return { line: `skipped merge state ${pr.mergeState}, CI ${ci}`, code: 0 };
}

function main(argv) {
  const [number, plannedHead, action] = argv;
  if (
    argv.length !== 3 ||
    !PR_NUMBER_PATTERN.test(number) ||
    !HEAD_SHA_PATTERN.test(plannedHead) ||
    !["merge", "rebase"].includes(action)
  ) {
    process.stderr.write(`${SCRIPT}: usage: ${SCRIPT} <pr-number> <planned-head> merge|rebase\n`);
    return 2;
  }
  try {
    const { line, code } = act(number, plannedHead, action);
    process.stdout.write(`${line}\n`);
    return code;
  } catch (error) {
    if (!(error instanceof GhError) && !(error instanceof SyntaxError)) throw error;
    process.stderr.write(`${SCRIPT}: ${error.message}\n`);
    if (error.missing) return 127;
    process.stdout.write(`failed ${error.message}\n`);
    return 1;
  }
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
