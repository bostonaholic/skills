import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

test("shipit does no versioning of its own", () => {
  const shipit = readdirSync("skills/shipit/references")
    .map((name) => readFileSync(`skills/shipit/references/${name}`, "utf8"))
    .concat(readFileSync("skills/shipit/SKILL.md", "utf8"))
    .join("\n");

  assert.doesNotMatch(shipit, /version-bump|\.claude\/|\.claude-plugin|next-version|check-version-consistency/);
});
