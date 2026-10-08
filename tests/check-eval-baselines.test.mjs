// Fails when scripts/check-eval-baselines.mjs lets a skill edit through without new scores on every
// model, or blocks an edit that touches no runtime file.
import assert from "node:assert/strict";
import test from "node:test";
import { MODELS, changedSkills, missingScores } from "../scripts/check-eval-baselines.mjs";

const CASES = [
  { name: "alpha-core", skill: "alpha" },
  { name: "alpha-guard", skill: "alpha" },
  { name: "beta-core", skill: "beta" },
];

function baseline(stamps) {
  return {
    schemaVersion: 1,
    cases: Object.fromEntries(Object.entries(stamps).map(([n, at]) => [n, { recordedAt: at }])),
  };
}

function everyModel(head, base) {
  return Object.fromEntries(MODELS.map((model) => [model, { head, base }]));
}

test("only runtime files of an active skill count as a skill change", () => {
  assert.deepEqual(
    changedSkills([
      "skills/engineering/alpha/SKILL.md",
      "skills/engineering/alpha/references/rules.md",
      "skills/productivity/beta/shared/style.md",
      "skills/engineering/gamma/agents/openai.yaml",
      "skills/deprecated/delta/SKILL.md.disabled",
      "docs/skill-authoring.md",
    ]),
    ["alpha", "beta"],
  );
});

test("passes when every case has a newly recorded score on every model", () => {
  const base = baseline({ "alpha-core": "old", "alpha-guard": "old" });
  const head = baseline({ "alpha-core": "new", "alpha-guard": "new" });
  assert.deepEqual(missingScores(["alpha"], CASES, everyModel(head, base)), []);
});

test("a case new to the baseline counts as recorded", () => {
  const head = baseline({ "alpha-core": "new", "alpha-guard": "new" });
  assert.deepEqual(missingScores(["alpha"], CASES, everyModel(head, null)), []);
});

test("reports an unchanged or missing score on any one model", () => {
  const base = baseline({ "alpha-core": "old", "alpha-guard": "old" });
  const fresh = baseline({ "alpha-core": "new", "alpha-guard": "new" });
  const baselines = everyModel(fresh, base);
  baselines.opus = { head: baseline({ "alpha-core": "old" }), base };
  assert.deepEqual(missingScores(["alpha"], CASES, baselines), [
    "alpha-core: opus score not re-recorded",
    "alpha-guard: no opus score in evals/baselines/",
  ]);
});

test("reports a changed skill with no eval cases", () => {
  assert.deepEqual(missingScores(["gamma"], CASES, everyModel(null, null)), [
    "gamma: no eval cases in evals/",
  ]);
});
