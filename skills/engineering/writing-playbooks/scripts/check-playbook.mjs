#!/usr/bin/env node

/**
 * Checks that every command line in a playbook's shell code blocks appears in
 * the session transcript the playbook was written from, so a playbook holds
 * only commands the session ran.
 *
 *     node "<skill-dir>/scripts/check-playbook.mjs" <playbook.md> <transcript.jsonl>
 *
 * The transcript is the normalized file resolve-transcript.mjs writes: one
 * JSON record per line with a `text` field. A tool call's text carries its
 * input as JSON, so each string value inside that JSON is searched as well,
 * which lets a command with quotes match the command as the agent typed it.
 *
 * A command line is each non-blank line inside a fenced block whose info
 * string is sh, bash, shell, zsh, or console, minus a leading `$ ` prompt.
 * A line that starts with `#` is a comment and is skipped. The line's
 * `<placeholder>` spans are removed, and every remaining fragment of at
 * least MIN_FRAGMENT characters must appear in the transcript, with runs of
 * whitespace collapsed on both sides. A line with no such fragment is
 * unmatched, because nothing in it ties it to the session.
 *
 * Stdout: `checked: <n>` and `unmatched: <n>`, then one `<line>: <text>` line
 * per unmatched command, by playbook line number.
 *
 * Exit codes:
 *
 *   0  every command line matched
 *   1  at least one command line is unmatched; stdout lists each one
 *   2  usage error, or a file that cannot be read or holds no JSON records
 */

import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT = "check-playbook.mjs";
const USAGE = `usage: ${SCRIPT} <playbook.md> <transcript.jsonl>`;

// The skill file that explains each exit code.
const DOC_PATH = fileURLToPath(new URL("../SKILL.md", import.meta.url));

/**
 * Shortest fragment worth matching. Three characters or fewer is a flag such
 * as `-n` or a pipe, which appears in almost any transcript and proves nothing.
 */
const MIN_FRAGMENT = 4;

const SHELL_FENCE = /^\s*(`{3,}|~{3,})\s*(sh|bash|shell|zsh|console)\s*$/;
const PLACEHOLDER = /<[^<>\n]+>/g;
const TOOL_USE = /^\[tool_use [^\]]*\] (\{.*)$/s;

function collapse(text) {
  return text.replace(/\s+/g, " ").trim();
}

/** Every string value inside a JSON value, at any depth. */
function stringValues(value, out) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const item of value) stringValues(item, out);
  else if (value && typeof value === "object")
    for (const item of Object.values(value)) stringValues(item, out);
  return out;
}

/** The searchable text of a normalized transcript: each record's text plus its tool inputs. */
export function haystackOf(jsonlText) {
  const parts = [];
  let records = 0;
  for (const line of jsonlText.split("\n")) {
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (!record || typeof record.text !== "string") continue;
    records += 1;
    parts.push(record.text);
    for (const block of record.text.split("\n")) {
      const call = block.match(TOOL_USE);
      if (!call) continue;
      try {
        stringValues(JSON.parse(call[1]), parts);
      } catch {
        // A tool call whose input is not whole JSON still matched as plain text above.
      }
    }
  }
  return { records, haystack: collapse(parts.join("\n")) };
}

/** Each command line of the playbook's shell blocks, with its 1-based line number. */
export function commandLines(markdown) {
  const commands = [];
  let fence = null;
  for (const [index, raw] of markdown.split("\n").entries()) {
    if (fence) {
      const marker = raw.match(/^\s*(`{3,}|~{3,})\s*$/);
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length) {
        fence = null;
        continue;
      }
      const text = raw.replace(/^\s*\$\s+/, "").trim();
      if (!text || text.startsWith("#")) continue;
      commands.push({ line: index + 1, text });
      continue;
    }
    const open = raw.match(SHELL_FENCE);
    if (open) fence = open[1];
  }
  return commands;
}

/** The fragments of a command line that must appear in the transcript. */
export function fragmentsOf(text) {
  return text
    .split(PLACEHOLDER)
    .map(collapse)
    .filter((fragment) => fragment.length >= MIN_FRAGMENT);
}

export function unmatchedCommands(commands, haystack) {
  return commands.filter(({ text }) => {
    const fragments = fragmentsOf(text);
    return fragments.length === 0 || fragments.some((fragment) => !haystack.includes(fragment));
  });
}

function fail(message) {
  process.stderr.write(`${SCRIPT}: ${message}\n`);
  process.stderr.write(`see ${DOC_PATH}\n`);
  process.exit(2);
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const [playbookPath, transcriptPath, extra] = process.argv.slice(2);
  if (!playbookPath || !transcriptPath || extra !== undefined) fail(USAGE);

  let playbook;
  let transcript;
  try {
    playbook = readFileSync(playbookPath, "utf8");
  } catch (error) {
    fail(`cannot read playbook ${playbookPath}: ${error.message}`);
  }
  try {
    transcript = readFileSync(transcriptPath, "utf8");
  } catch (error) {
    fail(`cannot read transcript ${transcriptPath}: ${error.message}`);
  }

  const { records, haystack } = haystackOf(transcript);
  if (records === 0) fail(`no JSON records with a text field in ${transcriptPath}`);

  const commands = commandLines(playbook);
  const unmatched = unmatchedCommands(commands, haystack);
  process.stdout.write(`checked: ${commands.length}\n`);
  process.stdout.write(`unmatched: ${unmatched.length}\n`);
  for (const { line, text } of unmatched) process.stdout.write(`${line}: ${text}\n`);
  process.exit(unmatched.length === 0 ? 0 : 1);
}
