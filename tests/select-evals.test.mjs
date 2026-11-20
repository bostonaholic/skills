// Fails when scripts/select-evals.mjs picks the wrong eval cases for a change: a skill's edit that
// skips its trigger or guard cases, a shared-file edit that skips any skill, or an unrelated edit
// that spends money on evals.
import assert from "node:assert/strict";
import test from "node:test";
import { selectEvalCases } from "../scripts/select-evals.mjs";

const CASES = [
  "alpha-core",
  "alpha-guard",
  "alpha-guard-beta",
  "alpha-guard-calibrate-bad",
  "alpha-trigger",
  "beta-core",
  "beta-guard",
  "beta-trigger",
].map((name) => ({ name, skill: name.split("-")[0] }));

test("selectEvalCases maps changed paths to cases", async (t) => {
  const rows = [
    [
      "a skill file selects that skill's trigger and guard cases",
      ["skills/engineering/alpha/SKILL.md"],
      ["alpha-guard", "alpha-guard-beta", "alpha-guard-calibrate-bad", "alpha-trigger"],
    ],
    [
      "a case file selects that case and the skill's routing cases",
      ["evals/productivity/beta/beta-core/graders/rubric.md"],
      ["beta-core", "beta-guard", "beta-trigger"],
    ],
    [
      "a shared file selects every skill's routing cases",
      ["shared/skill-calls.md"],
      [
        "alpha-guard",
        "alpha-guard-beta",
        "alpha-guard-calibrate-bad",
        "alpha-trigger",
        "beta-guard",
        "beta-trigger",
      ],
    ],
    ["a manifest is shared", [".claude-plugin/plugin.json"], 6],
    ["the eval runner is shared", ["scripts/eval-verdict.mjs"], 6],
    ["the evals workflow is shared", [".github/workflows/evals.yml"], 6],
    ["an unrelated file selects nothing", ["README.md", "tests/catalog.test.mjs"], []],
    ["no change selects nothing", [], []],
  ];
  for (const [label, paths, expected] of rows) {
    await t.test(label, () => {
      const selected = selectEvalCases(paths, CASES);
      if (typeof expected === "number") assert.equal(selected.length, expected);
      else assert.deepEqual(selected, expected);
    });
  }
});
