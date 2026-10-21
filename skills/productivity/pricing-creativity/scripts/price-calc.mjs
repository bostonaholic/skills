#!/usr/bin/env node

/**
 * Apply the fixed ratios from Pricing Creativity to a deal's numbers.
 *
 *     node "<skill-dir>/scripts/price-calc.mjs" ceiling <price>
 *     node "<skill-dir>/scripts/price-calc.mjs" mloe <annual-agi-target>
 *     node "<skill-dir>/scripts/price-calc.mjs" y-benchmarks [--profit <n>] [--value <n>] [--savings <n>]
 *     node "<skill-dir>/scripts/price-calc.mjs" anchor-rate <anchor-sold> <deals>
 *     node "<skill-dir>/scripts/price-calc.mjs" round <price>
 *
 * Arguments are plain non-negative decimals in dollars (`50000`, `1250.5`):
 * no `$`, commas, `k`, or exponents. `anchor-rate` takes whole counts, with
 * `deals` at least 1 and `anchor-sold` at most `deals`. `y-benchmarks` takes
 * one or more of its flags, each once:
 *
 *   --profit   first-year new profit the outcome is worth
 *   --value    total value the work creates
 *   --savings  first-year savings the outcome is worth
 *
 * Stdout is one JSON object and a newline. Every object carries `rule` (the
 * rule's name), `rule_of_thumb` (true when the book says "about" or gives the
 * ratio as one benchmark among several: a starting anchor to scale to the
 * firm and client, not an exact answer), and `source` (the chapter file under
 * `references/chapters/`). Dollar figures are rounded to cents.
 *
 *   ceiling       {rule, rule_of_thumb, source, ratio, price, cost_ceiling}
 *   mloe          {rule, rule_of_thumb, source, ratio, agi_target, mloe}
 *   y-benchmarks  {rule, rule_of_thumb, source, benchmarks: [{name, origin,
 *                  base, ratio, base_amount, y}]}, in flag order
 *                  profit, value, savings, for the flags given
 *   anchor-rate   {rule, rule_of_thumb, source, threshold, anchor_sold, deals,
 *                  rate, raise_prices}
 *   round         {rule, rule_of_thumb, source, price, rounded}
 *
 * Exit codes:
 *
 *   0  the figure was printed
 *   1  invalid input: an argument is not a non-negative decimal, a count is
 *      not a whole number, `deals` is 0, or `anchor-sold` exceeds `deals`.
 *      Stderr names the argument
 *   2  usage fault: unknown subcommand, wrong argument count, or an unknown,
 *      repeated, or valueless flag. Nothing was computed
 */

import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

// ch03: the value chain derives a cost ceiling of "about 60%" of the price
// before designing the solution, leaving the rest as margin.
const COST_CEILING_RATIO = 0.6;

// ch05: the minimum level of engagement is "about 10% of the annual AGI
// target" (a $1M firm sets about $100k), which caps the firm near ten clients.
const MLOE_RATIO = 0.1;

// ch09: benchmarks for $Y, the top of the pricing range. A third of the first
// year's new profit is the strong form of anchoring against guaranteed value;
// Alan Weiss starts at 20% of the value created (a 5:1 return); large
// consultancies charge about half of first-year savings. Order is fixed so
// output is stable.
const Y_BENCHMARKS = [
  {
    flag: "--profit",
    name: "guaranteed-value-third",
    origin: "Enns",
    base: "first-year profit",
    ratio: 1 / 3,
  },
  { flag: "--value", name: "weiss-five-to-one", origin: "Alan Weiss", base: "value", ratio: 0.2 },
  {
    flag: "--savings",
    name: "half-of-savings",
    origin: "large consultancies",
    base: "first-year savings",
    ratio: 0.5,
  },
];

// ch07: an anchor chosen "20% of the time or more" means the anchor and the
// middle option are both priced too low, so every price goes up.
const ANCHOR_SELL_RATE_THRESHOLD = 0.2;

// ch04: a price for strategic work "ends in three zeros".
const STRATEGIC_PRICE_UNIT = 1000;

const DECIMAL = /^\d+(\.\d+)?$/;
const WHOLE = /^\d+$/;

const USAGE = [
  "usage: price-calc.mjs ceiling <price>",
  "       price-calc.mjs mloe <annual-agi-target>",
  "       price-calc.mjs y-benchmarks [--profit <n>] [--value <n>] [--savings <n>]",
  "       price-calc.mjs anchor-rate <anchor-sold> <deals>",
  "       price-calc.mjs round <price>",
].join("\n");

export class InvalidInput extends Error {}
export class UsageError extends Error {}

const cents = (n) => Math.round(n * 100) / 100;

function amount(name, raw) {
  if (typeof raw !== "string" || !DECIMAL.test(raw))
    throw new InvalidInput(`${name} must be a non-negative decimal, got "${raw}"`);
  return Number(raw);
}

function count(name, raw) {
  if (typeof raw !== "string" || !WHOLE.test(raw))
    throw new InvalidInput(`${name} must be a whole number, got "${raw}"`);
  return Number(raw);
}

export function costCeiling(price) {
  return {
    rule: "cost-ceiling",
    rule_of_thumb: true,
    source: "ch03-inputs-outputs-or-value.md",
    ratio: COST_CEILING_RATIO,
    price,
    cost_ceiling: cents(price * COST_CEILING_RATIO),
  };
}

export function mloe(agiTarget) {
  return {
    rule: "minimum-level-of-engagement",
    rule_of_thumb: true,
    source: "ch05-price-the-client-not-the-job.md",
    ratio: MLOE_RATIO,
    agi_target: agiTarget,
    mloe: cents(agiTarget * MLOE_RATIO),
  };
}

/** `bases` maps a flag (`--profit`, `--value`, `--savings`) to its amount. */
export function yBenchmarks(bases) {
  const benchmarks = Y_BENCHMARKS.filter((b) => b.flag in bases).map((b) => ({
    name: b.name,
    origin: b.origin,
    base: b.base,
    ratio: Math.round(b.ratio * 10000) / 10000,
    base_amount: bases[b.flag],
    y: cents(bases[b.flag] * b.ratio),
  }));
  return {
    rule: "y-benchmarks",
    rule_of_thumb: true,
    source: "ch09-master-the-value-conversation.md",
    benchmarks,
  };
}

export function anchorRate(anchorSold, deals) {
  if (deals < 1) throw new InvalidInput("deals must be at least 1");
  if (anchorSold > deals)
    throw new InvalidInput(`anchor-sold (${anchorSold}) must not exceed deals (${deals})`);
  const rate = anchorSold / deals;
  return {
    rule: "anchor-sell-rate",
    rule_of_thumb: false,
    source: "ch07-anchor-high.md",
    threshold: ANCHOR_SELL_RATE_THRESHOLD,
    anchor_sold: anchorSold,
    deals,
    rate: Math.round(rate * 10000) / 10000,
    raise_prices: rate >= ANCHOR_SELL_RATE_THRESHOLD,
  };
}

export function roundPrice(price) {
  return {
    rule: "price-integrity",
    rule_of_thumb: false,
    source: "ch04-the-many-ways-you-deliver-value.md",
    price,
    rounded: Math.round(price / STRATEGIC_PRICE_UNIT) * STRATEGIC_PRICE_UNIT,
  };
}

function parseFlags(args) {
  if (args.length === 0) throw new UsageError("y-benchmarks needs at least one flag");
  const known = new Set(Y_BENCHMARKS.map((b) => b.flag));
  const bases = {};
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];
    if (!known.has(flag)) throw new UsageError(`unknown argument "${flag}"`);
    if (flag in bases) throw new UsageError(`${flag} given twice`);
    if (value === undefined || value.startsWith("--"))
      throw new UsageError(`${flag} needs a value`);
    bases[flag] = amount(flag, value);
  }
  return bases;
}

function arity(subcommand, args, n) {
  if (args.length !== n)
    throw new UsageError(`${subcommand} takes ${n} argument${n === 1 ? "" : "s"}`);
}

/** Pure dispatcher: argv (without node and script) to the result object. */
export function run(argv) {
  const [subcommand, ...args] = argv;
  switch (subcommand) {
    case "ceiling":
      arity(subcommand, args, 1);
      return costCeiling(amount("price", args[0]));
    case "mloe":
      arity(subcommand, args, 1);
      return mloe(amount("annual-agi-target", args[0]));
    case "y-benchmarks":
      return yBenchmarks(parseFlags(args));
    case "anchor-rate":
      arity(subcommand, args, 2);
      return anchorRate(count("anchor-sold", args[0]), count("deals", args[1]));
    case "round":
      arity(subcommand, args, 1);
      return roundPrice(amount("price", args[0]));
    default:
      throw new UsageError(
        subcommand === undefined ? "missing subcommand" : `unknown subcommand "${subcommand}"`,
      );
  }
}

// CLI entry point — runs only on direct execution, never on import.
// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    process.stdout.write(`${JSON.stringify(run(process.argv.slice(2)))}\n`);
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`price-calc.mjs: ${USAGE}\n`);
      process.stderr.write(`price-calc.mjs: ${error.message}\n`);
      process.exit(2);
    }
    if (error instanceof InvalidInput) {
      process.stderr.write(`price-calc.mjs: ${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
}
