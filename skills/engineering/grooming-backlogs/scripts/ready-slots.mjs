#!/usr/bin/env node

/**
 * Count the cards in the Ready column of a cached board and the slots left
 * under its work-in-progress limit.
 *
 *     node "<skill-dir>/scripts/ready-slots.mjs" <run-dir> --ready <column> --wip <n>
 *
 *     import { readySlots } from "<skill-dir>/scripts/ready-slots.mjs";
 *
 * Reads `<run-dir>/board.json`, as `scripts/load-board.sh` writes it. Every
 * item whose `status` equals `<column>` occupies a slot, issue or not.
 *
 * Stdout, one JSON object:
 *
 *   {"column": "Ready", "wip": 5, "count": 3, "free": 2, "breach": false,
 *    "cards": [9, 14, 21]}
 *
 * `cards` lists the issue and pull request numbers in the column, ascending;
 * a draft has no number and is counted but not listed. `free` is never below
 * zero. `breach` is true when the column already holds more than `wip`.
 *
 * Exit codes:
 *
 *   0  printed
 *   1  board.json is missing or malformed
 *   2  usage fault
 */

import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const SCRIPT = "ready-slots.mjs";
const USAGE = `${SCRIPT}: usage: ${SCRIPT} <run-dir> --ready <column> --wip <n>\n`;

/** The Ready column's occupancy on `board`, a parsed board.json. */
export function readySlots(board, column, wip) {
  const inColumn = board.items.filter((item) => item.status === column);
  const cards = inColumn
    .map((item) => item.content?.number)
    .filter((number) => Number.isInteger(number))
    .sort((a, b) => a - b);
  const count = inColumn.length;
  return { column, wip, count, free: Math.max(0, wip - count), breach: count > wip, cards };
}

/** Read and parse a run-cache JSON file, or throw an Error naming it. */
export function readJson(runDir, name) {
  const path = join(runDir, name);
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new Error(`cannot read ${path}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${path} is not JSON`);
  }
}

/** Parse "--ready <column> --wip <n>" or return null. */
function parseArgs(argv) {
  if (argv.length !== 5) return null;
  const [runDir, readyFlag, column, wipFlag, wipText] = argv;
  if (readyFlag !== "--ready" || wipFlag !== "--wip" || !column) return null;
  if (!/^\d+$/.test(wipText)) return null;
  return { runDir, column, wip: Number(wipText) };
}

function main(argv) {
  const args = parseArgs(argv);
  if (!args) {
    process.stderr.write(USAGE);
    return 2;
  }
  let board;
  try {
    board = readJson(args.runDir, "board.json");
  } catch (error) {
    process.stderr.write(`${SCRIPT}: ${error.message}\n`);
    return 1;
  }
  if (!Array.isArray(board?.items)) {
    process.stderr.write(`${SCRIPT}: board.json has no items array\n`);
    return 1;
  }
  process.stdout.write(`${JSON.stringify(readySlots(board, args.column, args.wip))}\n`);
  return 0;
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
