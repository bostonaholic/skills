// Fails when price-calc.mjs applies a ratio other than the book's, drops the rule-of-thumb
// marker, accepts a malformed or negative number, or exits with the wrong code.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptPath = fileURLToPath(
  new URL("../skills/productivity/pricing-creativity/scripts/price-calc.mjs", import.meta.url),
);

function calc(...args) {
  const run = spawnSync(process.execPath, [scriptPath, ...args], { encoding: "utf8" });
  return {
    status: run.status,
    json: run.status === 0 ? JSON.parse(run.stdout) : null,
    stdout: run.stdout,
    stderr: run.stderr,
  };
}

test("ceiling is 60% of the price, marked a rule of thumb", () => {
  const run = calc("ceiling", "50000");
  assert.equal(run.status, 0);
  assert.deepEqual(run.json, {
    rule: "cost-ceiling",
    rule_of_thumb: true,
    source: "ch03-inputs-outputs-or-value.md",
    ratio: 0.6,
    price: 50000,
    cost_ceiling: 30000,
  });
});

test("ceiling rounds to cents", () => {
  assert.equal(calc("ceiling", "1000.01").json.cost_ceiling, 600.01);
});

test("mloe is 10% of the annual AGI target, marked a rule of thumb", () => {
  const run = calc("mloe", "1000000");
  assert.equal(run.status, 0);
  assert.deepEqual(run.json, {
    rule: "minimum-level-of-engagement",
    rule_of_thumb: true,
    source: "ch05-price-the-client-not-the-job.md",
    ratio: 0.1,
    agi_target: 1000000,
    mloe: 100000,
  });
});

test("y-benchmarks applies each book ratio in fixed order, whatever the flag order", () => {
  const run = calc(
    "y-benchmarks",
    "--savings",
    "400000",
    "--profit",
    "3000000",
    "--value",
    "1200000",
  );
  assert.equal(run.status, 0);
  assert.equal(run.json.rule, "y-benchmarks");
  assert.equal(run.json.rule_of_thumb, true);
  assert.equal(run.json.source, "ch09-master-the-value-conversation.md");
  assert.deepEqual(
    run.json.benchmarks.map(({ name, base_amount, y }) => [name, base_amount, y]),
    [
      ["guaranteed-value-third", 3000000, 1000000],
      ["weiss-five-to-one", 1200000, 240000],
      ["half-of-savings", 400000, 200000],
    ],
  );
});

test("y-benchmarks prints only the benchmarks whose base was given", () => {
  const run = calc("y-benchmarks", "--value", "1000");
  assert.equal(run.status, 0);
  assert.deepEqual(run.json.benchmarks, [
    {
      name: "weiss-five-to-one",
      origin: "Alan Weiss",
      base: "value",
      ratio: 0.2,
      base_amount: 1000,
      y: 200,
    },
  ]);
});

test("anchor-rate at exactly 20% says raise every price", () => {
  const run = calc("anchor-rate", "1", "5");
  assert.equal(run.status, 0);
  assert.deepEqual(run.json, {
    rule: "anchor-sell-rate",
    rule_of_thumb: false,
    source: "ch07-anchor-high.md",
    threshold: 0.2,
    anchor_sold: 1,
    deals: 5,
    rate: 0.2,
    raise_prices: true,
  });
});

test("anchor-rate below 20% says hold prices", () => {
  const run = calc("anchor-rate", "1", "6");
  assert.equal(run.json.rate, 0.1667);
  assert.equal(run.json.raise_prices, false);
});

test("round takes a strategic price to the nearest thousand", () => {
  const cases = [
    ["19499.99", 19000],
    ["19500", 20000],
    ["20000", 20000],
    ["0", 0],
  ];
  for (const [price, rounded] of cases) {
    const run = calc("round", price);
    assert.equal(run.status, 0);
    assert.equal(run.json.rule, "price-integrity");
    assert.equal(run.json.rounded, rounded, `round ${price}`);
  }
});

test("invalid numbers exit 1 and name the argument", () => {
  const cases = [
    [["ceiling", "-5"], /price must be a non-negative decimal, got "-5"/],
    [["ceiling", "abc"], /price must be/],
    [["ceiling", "1e5"], /price must be/],
    [["ceiling", "$50,000"], /price must be/],
    [["mloe", "Infinity"], /annual-agi-target must be/],
    [["round", ""], /price must be/],
    [["y-benchmarks", "--profit", "-1"], /--profit must be/],
    [["anchor-rate", "1.5", "4"], /anchor-sold must be a whole number/],
    [["anchor-rate", "1", "x"], /deals must be a whole number/],
    [["anchor-rate", "0", "0"], /deals must be at least 1/],
    [["anchor-rate", "3", "2"], /anchor-sold \(3\) must not exceed deals \(2\)/],
  ];
  for (const [args, message] of cases) {
    const run = calc(...args);
    assert.equal(run.status, 1, args.join(" "));
    assert.equal(run.stdout, "", args.join(" "));
    assert.match(run.stderr, message, args.join(" "));
  }
});

test("usage faults exit 2 with the usage text", () => {
  const cases = [
    [[], /missing subcommand/],
    [["discount", "5"], /unknown subcommand "discount"/],
    [["ceiling"], /ceiling takes 1 argument/],
    [["ceiling", "1", "2"], /ceiling takes 1 argument/],
    [["mloe"], /mloe takes 1 argument/],
    [["round"], /round takes 1 argument/],
    [["anchor-rate", "1"], /anchor-rate takes 2 arguments/],
    [["y-benchmarks"], /needs at least one flag/],
    [["y-benchmarks", "--revenue", "5"], /unknown argument "--revenue"/],
    [["y-benchmarks", "--profit"], /--profit needs a value/],
    [["y-benchmarks", "--profit", "--value", "5"], /--profit needs a value/],
    [["y-benchmarks", "--value", "1", "--value", "2"], /--value given twice/],
  ];
  for (const [args, message] of cases) {
    const run = calc(...args);
    assert.equal(run.status, 2, args.join(" "));
    assert.equal(run.stdout, "", args.join(" "));
    assert.match(run.stderr, /^price-calc\.mjs: usage: price-calc\.mjs /, args.join(" "));
    assert.match(run.stderr, message, args.join(" "));
  }
});
