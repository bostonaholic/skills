#!/usr/bin/env node

/**
 * Compute the mechanical rows of the board-mode gap inventory from the run
 * cache, with the Ready column's free slots.
 *
 *     node "<skill-dir>/scripts/gap-inventory.mjs" <run-dir> --ready <column> \
 *       --wip <n> --login <login> --in-flight <state> [--in-flight <state>...] \
 *       [--priority-field <key>] [--estimate-field <key>] [--today YYYY-MM-DD]
 *
 *     import { gapInventory } from "<skill-dir>/scripts/gap-inventory.mjs";
 *
 * Reads `board.json`, `issues.json`, and `milestones.json` from `<run-dir>`,
 * as `scripts/load-board.sh` writes them. The board must hold items from one
 * repository. Issue rows cover the open issues that are on the board.
 *
 *   --ready, --wip      the Ready column and its work-in-progress limit
 *   --login             the authenticated login, for hard rule 6
 *   --in-flight         an in-flight Status option; repeat for each
 *   --priority-field    the board.json item key holding priority (default
 *                       `priority`)
 *   --estimate-field    the board.json item key holding the estimate
 *                       (default `estimate`)
 *   --today             the date milestones are past due against (default
 *                       today, UTC)
 *
 * Stdout, one JSON object:
 *
 *   {"repo": "o/r", "today": "YYYY-MM-DD", "links": "loaded"|"unavailable",
 *    "ready": <ready-slots.mjs object>,
 *    "rows": [{"gap": "<name>", "count": <n>, "issues": [<n>...]}, ...]}
 *
 * Rows, always in this order (milestone rows carry `milestones` instead of
 * `issues`):
 *
 *   no-milestone                    open board issues with no milestone
 *   no-priority                     open board issues whose item has no priority
 *   milestone-past-due              open milestones due before --today
 *   milestone-complete              open milestones with closed issues and none open
 *   milestone-undescribed           open milestones with a blank description
 *   milestone-empty                 open milestones with no issues at all
 *   no-estimate                     also `covered`, `total`, and
 *                                   `rollups_meaningful` (false when under a third
 *                                   of the open board issues carry an estimate)
 *   in-flight-assigned-to-others    in-flight items with an assignee other than
 *                                   --login (hard rule 6)
 *
 * With `links` loaded, these follow (absent when `links` is unavailable):
 *
 *   ready-or-in-flight-blocked      Ready or in-flight items with an OPEN blockedBy
 *   link-self                       an issue linked to itself
 *   link-cycle                      also `cycles`: each blockedBy cycle, ascending
 *   link-to-closed                  a blockedBy or blocking link to a CLOSED issue
 *   blocker-off-repo                an OPEN blocker in another repository
 *   blocker-off-board               an OPEN blocker in this repository, off the board
 *
 * Issue and milestone numbers are ascending and unique within a row. Deleted
 * link targets vanish from gh's link nodes, so no row can name them.
 *
 * Exit codes:
 *
 *   0  printed
 *   1  a run-cache file is missing or malformed, or the board spans more
 *      than one repository
 *   2  usage fault
 */

import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { readJson, readySlots } from "./ready-slots.mjs";

const SCRIPT = "gap-inventory.mjs";
const USAGE =
  `${SCRIPT}: usage: ${SCRIPT} <run-dir> --ready <column> --wip <n> --login <login> ` +
  "--in-flight <state> [--in-flight <state>...] [--priority-field <key>] " +
  "[--estimate-field <key>] [--today YYYY-MM-DD]\n";
const LINK_URL = /\/([^/]+)\/([^/]+)\/issues\/(\d+)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const ascending = (numbers) => [...new Set(numbers)].sort((a, b) => a - b);
const issueRow = (gap, numbers) => {
  const issues = ascending(numbers);
  return { gap, count: issues.length, issues };
};
const milestoneRow = (gap, list) => {
  const milestones = ascending(list.map((m) => m.number));
  return { gap, count: milestones.length, milestones };
};
const blank = (value) => value === undefined || value === null || value === "";
const sameRepo = (a, b) => a.toLowerCase() === b.toLowerCase();

/** The repository and number a link node points at, from its url. */
function linkTarget(node) {
  const match = LINK_URL.exec(node.url ?? "");
  return match ? { repo: `${match[1]}/${match[2]}`, number: Number(match[3]) } : null;
}

/** The strongly connected components of size two or more in `edges` (Tarjan). */
function cycles(nodes, edges) {
  let index = 0;
  const order = new Map();
  const low = new Map();
  const stack = [];
  const onStack = new Set();
  const found = [];
  const visit = (node) => {
    order.set(node, index);
    low.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);
    for (const next of edges.get(node) ?? []) {
      if (!order.has(next)) {
        visit(next);
        low.set(node, Math.min(low.get(node), low.get(next)));
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node), order.get(next)));
      }
    }
    if (low.get(node) === order.get(node)) {
      const component = [];
      let member;
      do {
        member = stack.pop();
        onStack.delete(member);
        component.push(member);
      } while (member !== node);
      if (component.length > 1) found.push(ascending(component));
    }
  };
  for (const node of ascending(nodes)) if (!order.has(node)) visit(node);
  return found.sort((a, b) => a[0] - b[0]);
}

/** The link rows, built from each issue's blockedBy, blocking, parent, and subIssues. */
function linkRows({ repo, openOnBoard, boardNumbers, readyOrInFlight }) {
  const blockedEdges = new Map();
  const addEdge = (from, to) => {
    if (!blockedEdges.has(from)) blockedEdges.set(from, new Set());
    blockedEdges.get(from).add(to);
  };
  const loaded = new Set(openOnBoard.map((issue) => issue.number));
  const blocked = [];
  const self = [];
  const toClosed = [];
  const offRepo = [];
  const offBoard = [];

  for (const issue of openOnBoard) {
    const own = (node) => {
      const target = linkTarget(node);
      return target && sameRepo(target.repo, repo) ? target.number : null;
    };
    const blockers = issue.blockedBy?.nodes ?? [];
    const blocking = issue.blocking?.nodes ?? [];
    const family = [issue.parent, ...(issue.subIssues?.nodes ?? [])].filter(Boolean);

    for (const node of [...blockers, ...blocking, ...family]) {
      if (own(node) === issue.number) self.push(issue.number);
    }
    for (const node of [...blockers, ...blocking]) {
      if (node.state === "CLOSED") toClosed.push(issue.number);
    }
    for (const node of blockers) {
      const target = own(node);
      if (target !== null && loaded.has(target)) addEdge(issue.number, target);
      if (node.state !== "OPEN") continue;
      if (readyOrInFlight.has(issue.number)) blocked.push(issue.number);
      const where = linkTarget(node);
      if (where && !sameRepo(where.repo, repo)) offRepo.push(issue.number);
      else if (target !== null && !boardNumbers.has(target)) offBoard.push(issue.number);
    }
    for (const node of blocking) {
      const target = own(node);
      if (target !== null && loaded.has(target)) addEdge(target, issue.number);
    }
  }
  const found = cycles(loaded, blockedEdges);
  return [
    issueRow("ready-or-in-flight-blocked", blocked),
    issueRow("link-self", self),
    { ...issueRow("link-cycle", found.flat()), cycles: found },
    issueRow("link-to-closed", toClosed),
    issueRow("blocker-off-repo", offRepo),
    issueRow("blocker-off-board", offBoard),
  ];
}

/** The gap inventory for parsed run-cache files and the board settings. */
export function gapInventory({ board, issues, milestones }, settings) {
  const { ready, wip, login, inFlight, priorityField, estimateField, today } = settings;
  const repos = [...new Set(board.items.map((item) => item.content?.repository).filter(Boolean))];
  if (repos.length !== 1) {
    throw new Error(`board.json spans ${repos.length} repositories, not one`);
  }
  const [repo] = repos;
  const itemByNumber = new Map(
    board.items
      .filter((item) => item.content?.type === "Issue" && item.content.repository === repo)
      .map((item) => [item.content.number, item]),
  );
  const boardNumbers = new Set(itemByNumber.keys());
  const openOnBoard = issues.filter(
    (issue) => issue.state !== "CLOSED" && boardNumbers.has(issue.number),
  );
  const numbersWhere = (test) =>
    openOnBoard.filter((issue) => test(issue, itemByNumber.get(issue.number))).map((i) => i.number);
  const inFlightSet = new Set(inFlight);
  const readyOrInFlight = new Set(
    numbersWhere((_, item) => item.status === ready || inFlightSet.has(item.status)),
  );

  const open = milestones.filter((m) => m.state === "open");
  const estimated = numbersWhere((_, item) => !blank(item[estimateField]));
  const total = openOnBoard.length;
  const missingEstimate = numbersWhere((_, item) => blank(item[estimateField]));

  const rows = [
    issueRow(
      "no-milestone",
      numbersWhere((issue) => !issue.milestone),
    ),
    issueRow(
      "no-priority",
      numbersWhere((_, item) => blank(item[priorityField])),
    ),
    milestoneRow(
      "milestone-past-due",
      open.filter((m) => m.due_on && m.due_on.slice(0, 10) < today),
    ),
    milestoneRow(
      "milestone-complete",
      open.filter((m) => m.open_issues === 0 && m.closed_issues > 0),
    ),
    milestoneRow(
      "milestone-undescribed",
      open.filter((m) => !m.description?.trim()),
    ),
    milestoneRow(
      "milestone-empty",
      open.filter((m) => m.open_issues + m.closed_issues === 0),
    ),
    {
      ...issueRow("no-estimate", missingEstimate),
      covered: estimated.length,
      total,
      // The skill's rule: under a third covered, estimate rollups mean nothing.
      rollups_meaningful: total > 0 && estimated.length * 3 >= total,
    },
    issueRow(
      "in-flight-assigned-to-others",
      numbersWhere(
        (issue, item) =>
          inFlightSet.has(item.status) &&
          (issue.assignees ?? []).some((a) => a.login.toLowerCase() !== login.toLowerCase()),
      ),
    ),
  ];

  const links = issues.every((issue) => "blockedBy" in issue) ? "loaded" : "unavailable";
  if (links === "loaded") {
    rows.push(...linkRows({ repo, openOnBoard, boardNumbers, readyOrInFlight }));
  }
  return { repo, today, links, ready: readySlots(board, ready, wip), rows };
}

/** Parse the CLI arguments, or return null on any fault. */
function parseArgs(argv) {
  const [runDir, ...rest] = argv;
  if (!runDir || runDir.startsWith("--")) return null;
  const settings = {
    inFlight: [],
    priorityField: "priority",
    estimateField: "estimate",
    today: new Date().toISOString().slice(0, 10),
  };
  const single = {
    "--ready": "ready",
    "--wip": "wip",
    "--login": "login",
    "--priority-field": "priorityField",
    "--estimate-field": "estimateField",
    "--today": "today",
  };
  const seen = new Set();
  for (let i = 0; i < rest.length; i += 2) {
    const [flag, value] = [rest[i], rest[i + 1]];
    if (value === undefined || value === "" || value.startsWith("--")) return null;
    if (flag === "--in-flight") settings.inFlight.push(value);
    else if (single[flag] && !seen.has(flag)) {
      seen.add(flag);
      settings[single[flag]] = value;
    } else return null;
  }
  if (!seen.has("--ready") || !seen.has("--wip") || !seen.has("--login")) return null;
  if (settings.inFlight.length === 0 || !/^\d+$/.test(settings.wip)) return null;
  if (!DATE.test(settings.today)) return null;
  settings.wip = Number(settings.wip);
  return { runDir, settings };
}

function main(argv) {
  const args = parseArgs(argv);
  if (!args) {
    process.stderr.write(USAGE);
    return 2;
  }
  let inventory;
  try {
    const board = readJson(args.runDir, "board.json");
    const issues = readJson(args.runDir, "issues.json");
    const milestones = readJson(args.runDir, "milestones.json");
    if (!Array.isArray(board?.items)) throw new Error("board.json has no items array");
    if (!Array.isArray(issues)) throw new Error("issues.json is not an array");
    if (!Array.isArray(milestones)) throw new Error("milestones.json is not an array");
    inventory = gapInventory({ board, issues, milestones }, args.settings);
  } catch (error) {
    process.stderr.write(`${SCRIPT}: ${error.message}\n`);
    return 1;
  }
  process.stdout.write(`${JSON.stringify(inventory)}\n`);
  return 0;
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
