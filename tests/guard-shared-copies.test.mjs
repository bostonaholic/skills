// Fails when the PreToolUse hook in .claude/hooks/guard-shared-copies.mjs allows an edit of a
// generated or frozen shared/ copy, blocks an edit elsewhere, or exits other than 2 when it blocks.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { blockReason } from "../.claude/hooks/guard-shared-copies.mjs";

const HOOK = resolve(".claude/hooks/guard-shared-copies.mjs");
const ROOT = "/repo";

test("blocks active and archived shared/ copies, by absolute or relative path", () => {
  for (const path of [
    "/repo/skills/engineering/widget/shared/rule.md",
    "skills/productivity/widget/shared/scripts/run.mjs",
    "/repo/skills/incubating/widget/shared/rule.md",
    "/repo/skills/deprecated/old/shared/rule.md",
  ])
    assert.ok(blockReason(path, ROOT), path);
});

test("allows the root shared/ sources, skill files outside shared/, and other repositories", () => {
  for (const path of [
    "/repo/shared/rule.md",
    "/repo/skills/engineering/widget/SKILL.md",
    "/repo/skills/engineering/widget/references/shared/note.md",
    "/elsewhere/skills/engineering/widget/shared/rule.md",
    undefined,
  ])
    assert.equal(blockReason(path, ROOT), undefined, String(path));
});

test("the hook exits 2 on a blocked path and 0 otherwise", () => {
  const run = (file_path) =>
    spawnSync(process.execPath, [HOOK], {
      input: JSON.stringify({ tool_name: "Edit", tool_input: { file_path } }),
      env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
      encoding: "utf8",
    }).status;
  assert.equal(run("/repo/skills/engineering/widget/shared/rule.md"), 2);
  assert.equal(run("/repo/shared/rule.md"), 0);
});
