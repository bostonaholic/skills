#!/usr/bin/env node

/**
 * Resolve a period token to inclusive START and END dates.
 *
 *     node "<skill-dir>/scripts/resolve-timeframe.mjs" PERIOD [--today YYYY-MM-DD]
 *
 * PERIOD is one of:
 *
 *   this-week, last-week         weeks start on Monday
 *   this-month, last-month
 *   this-quarter, last-quarter   quarters start in January, April, July, October
 *   YYYY-MM                      one calendar month, such as 2026-09
 *   YYYY-Qn                      one calendar quarter, such as 2026-Q3
 *   since:YYYY-MM-DD             that date through today
 *   YYYY-MM-DD..YYYY-MM-DD       an explicit range, kept as given
 *
 * A period that includes today ends today. --today pins today's date; without
 * it, today is the local date on this machine.
 *
 * Output: one line, `START END`, both YYYY-MM-DD.
 *
 * Exit codes:
 *
 *   0   resolved
 *   64  usage error: a missing or unknown PERIOD, a malformed or impossible
 *       date, a period that starts after today, or START after END. The
 *       reason is on stderr
 *
 * Written in Node rather than shell because GNU and BSD `date` disagree on
 * every flag this calendar arithmetic needs; Date.UTC behaves the same on both.
 */

import { realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT = "resolve-timeframe.mjs";
// The skill file that explains each exit code.
const DOC_PATH = fileURLToPath(new URL("../SKILL.md", import.meta.url));
const EXIT_USAGE = 64;
const DAY_MS = 86_400_000;

class UsageError extends Error {}

/** Parse YYYY-MM-DD into a UTC Date, rejecting dates like 2026-02-30. */
function parseDate(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text ?? "");
  if (!match) throw new UsageError(`not a YYYY-MM-DD date: ${text}`);
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (formatDate(date) !== text) throw new UsageError(`not a YYYY-MM-DD date: ${text}`);
  return date;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

// Date.UTC normalizes month -1 and 12 into the neighboring year.
function monthStart(year, month) {
  return new Date(Date.UTC(year, month, 1));
}

// Day 0 of the next month is the last day of this one.
function monthEnd(year, month) {
  return new Date(Date.UTC(year, month + 1, 0));
}

function mondayOf(date) {
  // getUTCDay is 0 for Sunday, so Sunday is 6 days after Monday.
  return addDays(date, -((date.getUTCDay() + 6) % 7));
}

function minDate(a, b) {
  return a < b ? a : b;
}

/** Resolve PERIOD against `today` (a UTC Date) to `{ start, end }` YYYY-MM-DD strings. */
function resolvePeriod(period, today) {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const quarterMonth = month - (month % 3);
  let start;
  let end;
  let clamp = true;

  let match;
  if (period === "this-week") {
    start = mondayOf(today);
    end = today;
  } else if (period === "last-week") {
    start = addDays(mondayOf(today), -7);
    end = addDays(start, 6);
  } else if (period === "this-month") {
    start = monthStart(year, month);
    end = today;
  } else if (period === "last-month") {
    start = monthStart(year, month - 1);
    end = monthEnd(year, month - 1);
  } else if (period === "this-quarter") {
    start = monthStart(year, quarterMonth);
    end = today;
  } else if (period === "last-quarter") {
    start = monthStart(year, quarterMonth - 3);
    end = monthEnd(year, quarterMonth - 1);
  } else if ((match = /^(\d{4})-(\d{2})$/.exec(period))) {
    const [y, m] = [Number(match[1]), Number(match[2])];
    if (m < 1 || m > 12) throw new UsageError(`not a YYYY-MM month: ${period}`);
    start = monthStart(y, m - 1);
    end = monthEnd(y, m - 1);
  } else if ((match = /^(\d{4})-Q([1-4])$/.exec(period))) {
    const [y, q] = [Number(match[1]), Number(match[2])];
    start = monthStart(y, (q - 1) * 3);
    end = monthEnd(y, (q - 1) * 3 + 2);
  } else if (period.startsWith("since:")) {
    start = parseDate(period.slice("since:".length));
    end = today;
  } else if (period.includes("..")) {
    const [from, to, ...rest] = period.split("..");
    if (rest.length > 0) throw new UsageError(`not a START..END range: ${period}`);
    start = parseDate(from);
    end = parseDate(to);
    clamp = false;
  } else {
    throw new UsageError(`unknown period: ${period}`);
  }

  if (clamp) {
    if (start > today) {
      throw new UsageError(`period ${period} starts after today ${formatDate(today)}`);
    }
    end = minDate(end, today);
  }
  if (start > end) {
    throw new UsageError(`START ${formatDate(start)} is after END ${formatDate(end)}`);
  }
  return { start: formatDate(start), end: formatDate(end) };
}

function localToday() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function main(argv) {
  const usage = `usage: ${SCRIPT} PERIOD [--today YYYY-MM-DD]`;
  try {
    let today = localToday();
    const args = [...argv];
    const flag = args.indexOf("--today");
    if (flag !== -1) {
      if (args.length < flag + 2) throw new UsageError("--today needs a YYYY-MM-DD date");
      today = parseDate(args[flag + 1]);
      args.splice(flag, 2);
    }
    if (args.length !== 1) throw new UsageError(usage);
    const { start, end } = resolvePeriod(args[0], today);
    process.stdout.write(`${start} ${end}\n`);
    return 0;
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(
      error.message.startsWith("usage:")
        ? `${SCRIPT}: ${error.message}\n`
        : `${SCRIPT}: ${error.message}\n${SCRIPT}: ${usage}\n`,
    );
    process.stderr.write(`see ${DOC_PATH}\n`);
    return EXIT_USAGE;
  }
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
