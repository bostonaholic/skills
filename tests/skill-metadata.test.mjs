// Fails when a tracked skill breaks the metadata that hosts read: the SKILL.md frontmatter `name`
// and `description`, the user-invoked pairing between `disable-model-invocation: true` and
// `policy.allow_implicit_invocation: false` in agents/openai.yaml, and the double-quoted
// openai.yaml prompts. Skills are enumerated with `git ls-files`, so untracked directories never count.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function trackedSkills() {
  return execFileSync("git", ["ls-files", "-z", "--", "skills/*/SKILL.md"], { encoding: "utf8" })
    .split("\0")
    .filter((path) => /^skills\/[^/]+\/SKILL\.md$/.test(path))
    .map((path) => path.split("/")[1])
    .sort();
}

function frontmatter(name) {
  const match = readFileSync(`skills/${name}/SKILL.md`, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  return match ? match[1] : "";
}

function frontmatterValue(name, key) {
  const match = frontmatter(name).match(new RegExp(`^${key}:[ \\t]*(.*)$`, "m"));
  if (!match) return undefined;
  const value = match[1].trim();
  if (value.startsWith("'") && value.endsWith("'") && value.length > 1) return value.slice(1, -1).replaceAll("''", "'");
  if (value.startsWith('"') && value.endsWith('"') && value.length > 1) return JSON.parse(value);
  return value;
}

function openaiYaml(name) {
  const path = `skills/${name}/agents/openai.yaml`;
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

test("every tracked skill's name equals its directory and is lowercase words joined by single hyphens", () => {
  const skills = trackedSkills();
  assert.ok(skills.length > 0, "found no tracked skills/*/SKILL.md");
  const wrong = skills
    .filter((dir) => frontmatterValue(dir, "name") !== dir || !NAME.test(dir))
    .map((dir) => `skills/${dir}/SKILL.md: name ${JSON.stringify(frontmatterValue(dir, "name"))}`);
  assert.deepEqual(wrong, []);
});

test("every tracked skill has a non-empty description", () => {
  const skills = trackedSkills();
  assert.ok(skills.length > 0, "found no tracked skills/*/SKILL.md");
  const empty = skills.filter((dir) => !frontmatterValue(dir, "description")).map((dir) => `skills/${dir}/SKILL.md`);
  assert.deepEqual(empty, []);
});

test("disable-model-invocation: true appears exactly when openai.yaml sets policy.allow_implicit_invocation: false", () => {
  const skills = trackedSkills();
  assert.ok(skills.length > 0, "found no tracked skills/*/SKILL.md");
  const unpaired = skills
    .map((dir) => ({
      dir,
      userInvoked: /^disable-model-invocation:[ \t]*true[ \t]*$/m.test(frontmatter(dir)),
      implicitOff: /^policy:[ \t]*$/m.test(openaiYaml(dir) ?? "") && /^[ \t]+allow_implicit_invocation:[ \t]*false[ \t]*$/m.test(openaiYaml(dir) ?? ""),
    }))
    .filter(({ userInvoked, implicitOff }) => userInvoked !== implicitOff)
    .map(({ dir, userInvoked }) =>
      userInvoked
        ? `skills/${dir}: disable-model-invocation: true without policy.allow_implicit_invocation: false`
        : `skills/${dir}: policy.allow_implicit_invocation: false without disable-model-invocation: true`,
    );
  assert.deepEqual(unpaired, []);
});

test("every agents/openai.yaml double-quotes short_description and default_prompt", () => {
  const skills = trackedSkills();
  assert.ok(skills.length > 0, "found no tracked skills/*/SKILL.md");
  const unquoted = skills
    .filter((dir) => openaiYaml(dir) !== null)
    .filter((dir) => !/^\s*short_description:\s*".+"\s*$/m.test(openaiYaml(dir)) || !/^\s*default_prompt:\s*".+"\s*$/m.test(openaiYaml(dir)))
    .map((dir) => `skills/${dir}/agents/openai.yaml`);
  assert.deepEqual(unquoted, []);
});
