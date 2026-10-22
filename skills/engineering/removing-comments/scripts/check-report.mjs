#!/usr/bin/env node
// Checks a comment reviewer report against the format in references/reviewer.md and the resolved
// scope, then prints its findings as JSON.
// Usage: check-report.mjs <scope-file> < <report-file>
//   <scope-file> lists the resolved scope, one path per line, as changed-files.sh prints it.
//   stdin is the reviewer's report.
// Every non-blank report line must be one finding form, one SKIP line, or the verdict, which comes
// last. Each finding and SKIP path must be listed in the scope file exactly.
//   exit 0  stdout is one JSON object, keys in this order: verdict; counts {reviewed, remove, keep,
//           encode, skipped}, where reviewed is remove + keep + encode; then removeCommentOnly,
//           removeRootCause, keep, and encode, each a list of {file, line, detail} in report order,
//           encode items also carrying enforcement; then skipped, a list of {file, reason}
//   exit 1  the report is invalid; stdout is empty and stderr has one line per failure,
//           `invalid <contract> <detail>`, contract one of malformed-line, scope-escape,
//           missing-verdict, extra-verdict, verdict-not-last, wrong-verdict
//   exit 2  wrong arguments, or an unreadable or empty scope file; stderr names the problem
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

// The skill file that explains each exit code.
const DOC_PATH = fileURLToPath(new URL("../SKILL.md", import.meta.url));

// Line numbers start at 1, so a finding at line 0 is malformed. The path is lazy so a detail that
// itself cites `file:line [...]` cannot stretch the captured path.
const FORMS = [
  {
    kind: "removeCommentOnly",
    pattern: /^- REMOVE (.+?):([1-9]\d*) \[comment-only\] — (\S.*)$/,
  },
  { kind: "removeRootCause", pattern: /^- REMOVE (.+?):([1-9]\d*) \[root-cause\] — (\S.*)$/ },
  { kind: "keep", pattern: /^- KEEP (.+?):([1-9]\d*) — (\S.*)$/ },
  {
    kind: "encode",
    pattern: /^- ENCODE (.+?):([1-9]\d*) \[(type|runtime|test|lint|CI)\] — (\S.*)$/,
  },
];
const SKIP = /^- SKIP (.+?) — (\S.*)$/;
const VERDICTS = ["APPROVE", "REQUEST CHANGES"];
const USAGE = "check-report.mjs: usage: check-report.mjs <scope-file> < <report-file>";

function nonBlankLines(text) {
  return text
    .split("\n")
    .map((line, index) => ({ number: index + 1, text: line.trimEnd() }))
    .filter((line) => line.text !== "");
}

export function parseScope(text) {
  return new Set(nonBlankLines(text).map((line) => line.text));
}

function parseFinding(text) {
  for (const { kind, pattern } of FORMS) {
    const match = pattern.exec(text);
    if (!match) continue;
    if (kind === "encode") {
      const [, file, line, enforcement, detail] = match;
      return { kind, item: { file, line: Number(line), enforcement, detail } };
    }
    const [, file, line, detail] = match;
    return { kind, item: { file, line: Number(line), detail } };
  }
  const skip = SKIP.exec(text);
  if (skip) return { kind: "skipped", item: { file: skip[1], reason: skip[2] } };
  return null;
}

// Returns { errors: [] , result } on a valid report, or { errors: [...] } naming each failed
// contract. Pure: reads nothing but its arguments.
export function checkReport(scope, reportText) {
  const lists = { removeCommentOnly: [], removeRootCause: [], keep: [], encode: [], skipped: [] };
  const errors = [];
  const verdictLines = [];
  const lines = nonBlankLines(reportText);

  for (const line of lines) {
    if (VERDICTS.includes(line.text)) {
      verdictLines.push(line);
      continue;
    }
    const parsed = parseFinding(line.text);
    if (!parsed) {
      errors.push(`invalid malformed-line ${line.number}`);
      continue;
    }
    if (!scope.has(parsed.item.file)) {
      errors.push(`invalid scope-escape ${line.number} ${parsed.item.file}`);
    }
    lists[parsed.kind].push(parsed.item);
  }

  const remove = lists.removeCommentOnly.length + lists.removeRootCause.length;
  const expected = remove + lists.encode.length > 0 ? "REQUEST CHANGES" : "APPROVE";
  // Placement and agreement are judged only for a lone verdict, and agreement only when every
  // finding parsed, so one fault is not reported again as a second, derived one.
  const malformed = errors.some((error) => error.startsWith("invalid malformed-line"));
  if (verdictLines.length === 0) {
    errors.push("invalid missing-verdict");
  } else if (verdictLines.length > 1) {
    for (const extra of verdictLines.slice(1)) errors.push(`invalid extra-verdict ${extra.number}`);
  } else if (verdictLines[0] !== lines.at(-1)) {
    errors.push(`invalid verdict-not-last ${verdictLines[0].number}`);
  } else if (!malformed && verdictLines[0].text !== expected) {
    errors.push(`invalid wrong-verdict expected ${expected}`);
  }
  if (errors.length > 0) return { errors };

  const counts = {
    reviewed: remove + lists.keep.length + lists.encode.length,
    remove,
    keep: lists.keep.length,
    encode: lists.encode.length,
    skipped: lists.skipped.length,
  };
  return { errors, result: { verdict: expected, counts, ...lists } };
}

function fail(code, text) {
  process.stderr.write(`${text}\nsee ${DOC_PATH}\n`);
  process.exit(code);
}

function main(argv) {
  if (argv.length !== 1) fail(2, USAGE);
  let scope;
  try {
    scope = parseScope(readFileSync(argv[0], "utf8"));
  } catch (error) {
    fail(2, `check-report.mjs: cannot read scope file: ${error.message}`);
  }
  // An empty scope is a no-op the skill handles before any review, so a report against one is a
  // caller error, not a report to accept.
  if (scope.size === 0) fail(2, `check-report.mjs: scope file ${argv[0]} lists no files`);
  const { errors, result } = checkReport(scope, readFileSync(0, "utf8"));
  if (errors.length > 0) fail(1, errors.join("\n"));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2));
}
