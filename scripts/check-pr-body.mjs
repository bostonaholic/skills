#!/usr/bin/env node
// Checks that a pull request body carries the pre-merge section of the pull request template, as
// AGENTS.md rule 13 requires.
//   PR_BODY="<body>" node scripts/check-pr-body.mjs
// Input: the PR_BODY environment variable (unset counts as empty) and TEMPLATE at the working
// directory. The body must hold the exact HEADING line and, before the next `## ` heading, a task
// item in any box state whose text starts with the template's first item under HEADING, up to its
// first colon.
// Output: nothing on success; on failure, stderr lines that start with "PR body: rule 13".
// Exit 0 when the body passes, 1 when it lacks the section or item, when the template is
// unreadable or has no task item under HEADING, or on any argument.
import { readFileSync, realpathSync } from "node:fs";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";

// The template owns the pre-merge text, so the check derives the item it expects from it.
const TEMPLATE = ".github/pull_request_template.md";
// Matched exactly, case included, because the template writes it this way.
const HEADING = "## Pre-merge";
const TASK_ITEM = /^- \[[ xX]\] (.*)$/;

// The lines after HEADING, up to the next `## ` heading; undefined without HEADING.
function preMergeSection(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.indexOf(HEADING);
  if (start === -1) return undefined;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  return end === -1 ? rest : rest.slice(0, end);
}

// The text a body's item must start with: the template's first item under HEADING, up to its
// first colon. Undefined when the template has no such item.
function templatePrefix(template) {
  const item = preMergeSection(template)
    ?.map((line) => line.match(TASK_ITEM)?.[1])
    .find((text) => text !== undefined);
  return item?.split(":")[0];
}

// Returns the rule 13 problem with `body`, or undefined when it carries the section and item.
function bodyProblem(body, prefix) {
  const section = preMergeSection(body);
  if (!section) return `has no "${HEADING}" heading`;
  if (!section.some((line) => line.match(TASK_ITEM)?.[1].startsWith(prefix)))
    return `"${HEADING}" has no "- [ ] ${prefix}" item`;
  return undefined;
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  if (process.argv.length !== 2) {
    console.error(`usage: node scripts/${basename(process.argv[1])} (reads PR_BODY)`);
    process.exit(1);
  }
  let template;
  try {
    template = readFileSync(TEMPLATE, "utf8");
  } catch {
    console.error(`PR body: rule 13 cannot read ${TEMPLATE}`);
    process.exit(1);
  }
  const prefix = templatePrefix(template);
  if (prefix === undefined) {
    console.error(`PR body: rule 13 ${TEMPLATE} has no task item under "${HEADING}"`);
    process.exit(1);
  }
  const problem = bodyProblem(process.env.PR_BODY ?? "", prefix);
  if (problem) {
    console.error(`PR body: rule 13 ${problem}\nCopy the section from ${TEMPLATE}.`);
    process.exit(1);
  }
}
