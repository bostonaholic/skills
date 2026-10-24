// Exercises scripts/lint-skills.mjs against temporary fixture repositories: a compliant skill
// passes, and each mechanical rule from docs/skill-authoring.md reports its own ID, in skills and
// in agents/*.md subagents. Two real-tree tests also fail when the IDs the script reports differ
// from the docs/skill-authoring.md rows marked **lint**, or when an EVALS_PENDING entry names a
// skill that now has its trigger, guard, and core cases or is not an active skill.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
// A namespace import, so a missing export fails its test's assertion instead of the whole file.
import * as lint from "../scripts/lint-skills.mjs";

const LINT = resolve("scripts/lint-skills.mjs");
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
const SKILL = "skills/engineering/reviewing-widgets";
const DESCRIPTION = "Reviews widgets for defects. Use when the user asks to review a widget.";
const LINKS =
  "Read [the guide](references/guide.md) before reviewing. Follow [the rule](shared/rule.md).\n";
const LONG_GUIDE = `# Guide\n\n## Contents\n\n- Steps\n\n## Steps\n\n${"Step.\n".repeat(100)}`;

function skillFile({ name = "reviewing-widgets", description = DESCRIPTION, body = LINKS } = {}) {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n# Reviewing widgets\n\n${body}`;
}

const OPENAI_YAML =
  'interface:\n  display_name: "Reviewing Widgets"\n  short_description: "Review widgets for defects"\n';

function compliant(overrides = {}) {
  return {
    [`${SKILL}/SKILL.md`]: skillFile(),
    [`${SKILL}/references/guide.md`]: LONG_GUIDE,
    [`${SKILL}/shared/rule.md`]: "# Rule\n\nKeep it short.\n",
    [`${SKILL}/agents/openai.yaml`]: OPENAI_YAML,
    "evals/engineering/reviewing-widgets/reviewing-widgets-trigger/prompt.md":
      "Review this widget.\n",
    "evals/engineering/reviewing-widgets/reviewing-widgets-guard/prompt.md":
      "Explain this widget.\n",
    "evals/engineering/reviewing-widgets/reviewing-widgets-core/prompt.md": "Find the defect.\n",
    ...overrides,
  };
}

function runLint(t, files, ...args) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "lint-skills-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  for (const gitArgs of [
    ["init", "-q"],
    ["add", "-A"],
  ]) {
    const run = spawnSync("git", gitArgs, { cwd: root, env: GIT_ENV, encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
  }
  const run = spawnSync(process.execPath, [LINT, ...args], {
    cwd: root,
    env: GIT_ENV,
    encoding: "utf8",
  });
  return { status: run.status, output: run.stdout + run.stderr };
}

function assertReports(t, files, id, pattern) {
  const run = runLint(t, files);
  assert.equal(run.status, 1, run.output);
  assert.match(run.output, new RegExp(`: ${id} .*${pattern.source}`), run.output);
}

function assertReportsLine(t, files, line) {
  const run = runLint(t, files);
  assert.equal(run.status, 1, run.output);
  assert.ok(run.output.split("\n").includes(line), `want the line\n${line}\nin:\n${run.output}`);
}

function assertReportsMatch(t, files, pattern) {
  const run = runLint(t, files);
  assert.equal(run.status, 1, run.output);
  assert.match(run.output, pattern, run.output);
}

function gitFiles(...pathspecs) {
  return execFileSync("git", ["ls-files", "-z", "--", ...pathspecs], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

test("a compliant skill passes with no output", (t) => {
  const run = runLint(t, compliant());
  assert.deepEqual(run, { status: 0, output: "" });
});

test("archived skills under skills/deprecated are skipped", (t) => {
  const run = runLint(
    t,
    compliant({
      "skills/deprecated/old/SKILL.md": skillFile({
        name: "Old_Skill",
        description: "Use for old things.",
      }),
    }),
  );
  assert.deepEqual(run, { status: 0, output: "" });
});

test("A1 reports a name with invalid characters or a reserved word", (t) => {
  assertReports(
    t,
    compliant({ [`${SKILL}/SKILL.md`]: skillFile({ name: "Reviewing_Widgets" }) }),
    "A1",
    /name "Reviewing_Widgets" must be lowercase/,
  );
  assertReports(
    t,
    compliant({ [`${SKILL}/SKILL.md`]: skillFile({ name: "using-claude" }) }),
    "A1",
    /reserved word/,
  );
});

test("A2 reports a name that does not start with a gerund", (t) => {
  assertReports(
    t,
    compliant({ [`${SKILL}/SKILL.md`]: skillFile({ name: "review-widgets" }) }),
    "A2",
    /must start with a gerund/,
  );
});

test("A3 reports an overlong description and one containing an XML tag", (t) => {
  const long = `${DESCRIPTION} ${"word ".repeat(220)}`;
  assertReports(
    t,
    compliant({ [`${SKILL}/SKILL.md`]: skillFile({ description: long }) }),
    "A3",
    /description is \d+ characters; the limit is 1024/,
  );
  assertReports(
    t,
    compliant({
      [`${SKILL}/SKILL.md`]: skillFile({ description: `${DESCRIPTION} Emits <report>.` }),
    }),
    "A3",
    /XML tag/,
  );
});

test("A4 reports a description that opens without a third-person verb or addresses you", (t) => {
  assertReports(
    t,
    compliant({ [`${SKILL}/SKILL.md`]: skillFile({ description: "Use when reviewing widgets." }) }),
    "A4",
    /opens with "Use"/,
  );
  assertReports(
    t,
    compliant({
      [`${SKILL}/SKILL.md`]: skillFile({
        description: "This skill reviews widgets. Use when asked.",
      }),
    }),
    "A4",
    /opens with "This"/,
  );
  assertReports(
    t,
    compliant({
      [`${SKILL}/SKILL.md`]: skillFile({ description: "Reviews your widgets. Use when asked." }),
    }),
    "A4",
    /addresses I or you/,
  );
});

test("A4 does not read a hyphenated name such as oh-my-zsh as first person", (t) => {
  const description = "Configures oh-my-zsh plugins. Use when editing zsh configuration.";
  const run = runLint(t, compliant({ [`${SKILL}/SKILL.md`]: skillFile({ description }) }));
  assert.deepEqual(run, { status: 0, output: "" });
});

test("A5 reports a description without a Use when clause", (t) => {
  assertReports(
    t,
    compliant({
      [`${SKILL}/SKILL.md`]: skillFile({ description: "Reviews widgets for defects." }),
    }),
    "A5",
    /"Use when \.\.\." clause/,
  );
});

test("C1 reports a SKILL.md body over 100 lines and accepts one of 100", (t) => {
  // The fixture header adds four lines (blank, heading, blank, links) before the items.
  const items = (count) => `${LINKS}${"- Item.\n".repeat(count)}`;
  assertReports(
    t,
    compliant({ [`${SKILL}/SKILL.md`]: skillFile({ body: items(97) }) }),
    "C1",
    /body is 101 lines; keep it to 100/,
  );
  const run = runLint(t, compliant({ [`${SKILL}/SKILL.md`]: skillFile({ body: items(96) }) }));
  assert.deepEqual(run, { status: 0, output: "" });
});

test("C6 reports a prose paragraph over 50 words and ignores lists, tables, and fences", (t) => {
  const words = (count) => `${"word ".repeat(count).trim()}\n`;
  assertReports(
    t,
    compliant({ [`${SKILL}/SKILL.md`]: skillFile({ body: `${LINKS}\n${words(51)}` }) }),
    "C6",
    /body line \d+: 51-word paragraph/,
  );
  const body = `${LINKS}\n${words(50)}\n- ${words(80)}\n| ${words(80)}\n\n\`\`\`text\n${words(80)}\`\`\`\n`;
  const run = runLint(t, compliant({ [`${SKILL}/SKILL.md`]: skillFile({ body }) }));
  assert.deepEqual(run, { status: 0, output: "" });
});

test("B3 reports harness substitutions, unknown frontmatter keys, and stray files", (t) => {
  for (const [text, name] of [
    ["`$ARGUMENTS` names the diff.", "\\$ARGUMENTS"],
    ["Read `$1` first.", "\\$N"],
    ["Run `${CLAUDE_SKILL_DIR}/scripts/x.sh`.", "\\$\\{CLAUDE_\\*\\}"],
    ["Status: !`git status`", "!`command`"],
  ]) {
    const body = `${LINKS}${text}\n`;
    assertReports(
      t,
      compliant({ [`${SKILL}/SKILL.md`]: skillFile({ body }) }),
      "B3",
      new RegExp(`${name} is a harness substitution`),
    );
  }
  const hooked = skillFile().replace("---\n\n", "hooks:\n  PreToolUse: []\n---\n\n");
  assertReports(
    t,
    compliant({ [`${SKILL}/SKILL.md`]: hooked }),
    "B3",
    /frontmatter key "hooks" is harness-specific/,
  );
  assertReports(
    t,
    compliant({ [`${SKILL}/hooks/hooks.json`]: "{}\n" }),
    "B3",
    /hooks\/hooks\.json is outside SKILL\.md/,
  );
});

test("B3 accepts invocation metadata other harnesses ignore", (t) => {
  const meta = skillFile().replace(
    "---\n\n",
    "argument-hint: <path>\neffort: low\ndisable-model-invocation: true\nmetadata:\n  owner: me\n---\n\n",
  );
  const run = runLint(
    t,
    compliant({
      [`${SKILL}/SKILL.md`]: meta,
      [`${SKILL}/agents/openai.yaml`]: "policy:\n  allow_implicit_invocation: false\n",
    }),
  );
  assert.deepEqual(run, { status: 0, output: "" });
});

test("C3 reports a bundled file that SKILL.md names only in a code span", (t) => {
  const body = "Read `references/guide.md` first. Follow [the rule](shared/rule.md).\n";
  assertReports(
    t,
    compliant({ [`${SKILL}/SKILL.md`]: skillFile({ body }) }),
    "C3",
    /references\/guide\.md is not linked from SKILL\.md/,
  );
});

test("C3 accepts links written with ./ and an anchor", (t) => {
  const body = "Read [steps](./references/guide.md#steps). Follow [the rule](shared/rule.md).\n";
  const run = runLint(t, compliant({ [`${SKILL}/SKILL.md`]: skillFile({ body }) }));
  assert.deepEqual(run, { status: 0, output: "" });
});

test("C4 reports a file over 100 lines whose first section is not Contents", (t) => {
  const guide = `# Guide\n\n## Steps\n\n${"Step.\n".repeat(100)}`;
  assertReports(
    t,
    compliant({ [`${SKILL}/references/guide.md`]: guide }),
    "C4",
    /open with a "## Contents" section/,
  );
});

test("C5 reports a backslash path", (t) => {
  const body = `${LINKS}See [the guide](references\\guide.md).\n`;
  assertReports(
    t,
    compliant({ [`${SKILL}/SKILL.md`]: skillFile({ body }) }),
    "C5",
    /use forward slashes in "references\\guide\.md"/,
  );
});

test("an argument exits 1 with a usage line", (t) => {
  const run = runLint(t, compliant(), "--fix");
  assert.equal(run.status, 1);
  assert.match(run.output, /^usage: node scripts\/lint-skills\.mjs/);
});

// ---------------------------------------------------------------------------------------------
// B5: a skill that calls another links shared/skill-calls.md

test("B5 reports a skill call that SKILL.md does not pair with a shared/skill-calls.md link", async (t) => {
  await t.test("a call in SKILL.md", (t) => {
    const body = `${LINKS}Then call the Skill tool with \`explaining-widgets\`.\n`;
    assertReportsMatch(
      t,
      compliant({ [`${SKILL}/SKILL.md`]: skillFile({ body }) }),
      /^skills\/engineering\/reviewing-widgets\/SKILL\.md: B5 \S*SKILL\.md calls explaining-widgets with the Skill tool; link \[skill call rules\]\(shared\/skill-calls\.md\) from SKILL\.md$/m,
    );
  });

  await t.test("a call that breaks across two lines in references/", (t) => {
    const guide = `${LONG_GUIDE}When done, call the\nSkill tool with \`explaining-widgets\`.\n`;
    assertReportsMatch(
      t,
      compliant({ [`${SKILL}/references/guide.md`]: guide }),
      /^skills\/engineering\/reviewing-widgets\/SKILL\.md: B5 \S*references\/guide\.md calls explaining-widgets with the Skill tool; link \[skill call rules\]\(shared\/skill-calls\.md\) from SKILL\.md$/m,
    );
  });

  await t.test("a call inside a shared/ copy", (t) => {
    const body = `${LINKS}Read [the handoff](shared/handoff.md).\n`;
    assertReportsMatch(
      t,
      compliant({
        [`${SKILL}/SKILL.md`]: skillFile({ body }),
        [`${SKILL}/shared/handoff.md`]:
          "# Handoff\n\nCall the Skill tool with `explaining-widgets`.\n",
      }),
      /^skills\/engineering\/reviewing-widgets\/SKILL\.md: B5 \S*shared\/handoff\.md calls explaining-widgets with the Skill tool; link \[skill call rules\]\(shared\/skill-calls\.md\) from SKILL\.md$/m,
    );
  });

  // The first skill's call sits later in its text than the second skill's call, so a global
  // regex reused with .test() starts the second search past the second call and misses it.
  await t.test("two skills that each hold a call both report", (t) => {
    const run = runLint(
      t,
      compliant({
        [`${SKILL}/SKILL.md`]: skillFile({
          body: `${LINKS}Then call the Skill tool with \`explaining-widgets\`.\n`,
        }),
        "skills/productivity/reviewing-gadgets/SKILL.md": skillFile({
          name: "reviewing-gadgets",
          body: "Call the Skill tool with `explaining-gadgets`.\n",
        }),
        "skills/productivity/reviewing-gadgets/agents/openai.yaml": OPENAI_YAML,
        "evals/productivity/reviewing-gadgets/reviewing-gadgets-trigger/prompt.md": "Review it.\n",
        "evals/productivity/reviewing-gadgets/reviewing-gadgets-guard/prompt.md": "Explain it.\n",
        "evals/productivity/reviewing-gadgets/reviewing-gadgets-core/prompt.md": "Fix it.\n",
      }),
    );
    assert.equal(run.status, 1, run.output);
    assert.match(
      run.output,
      /^skills\/engineering\/reviewing-widgets\/SKILL\.md: B5 [^\n]*calls explaining-widgets with the Skill tool/m,
    );
    assert.match(
      run.output,
      /^skills\/productivity\/reviewing-gadgets\/SKILL\.md: B5 [^\n]*calls explaining-gadgets with the Skill tool/m,
    );
  });
});

test("B5 accepts a skill call when SKILL.md links shared/skill-calls.md", (t) => {
  const body = `${LINKS}Then call the Skill tool with \`explaining-widgets\`, as the [skill call rules](shared/skill-calls.md) say.\n`;
  const run = runLint(
    t,
    compliant({
      [`${SKILL}/SKILL.md`]: skillFile({ body }),
      [`${SKILL}/shared/skill-calls.md`]: "# Skill calls\n\nState a fallback.\n",
    }),
  );
  assert.deepEqual(run, { status: 0, output: "" });
});

test("the lint IDs equal the skill-authoring rows marked lint", () => {
  assert.ok(Array.isArray(lint.LINT_IDS), "scripts/lint-skills.mjs exports no LINT_IDS array");
  const marked = readFileSync("docs/skill-authoring.md", "utf8")
    .split("\n")
    .filter((line) => line.includes("**lint**"))
    .map((line) => line.match(/^\|\s*([A-GS][0-9]+)\s*\|/)?.[1])
    .filter(Boolean)
    .sort();
  assert.deepEqual([...lint.LINT_IDS].sort(), marked);
});

// ---------------------------------------------------------------------------------------------
// C7: links and <skill-dir>/ paths name tracked files in the skill. C8: -dir and -root placeholders

test("C7 reports a link or <skill-dir>/ path that names no tracked file in the skill", async (t) => {
  // LONG_GUIDE ends on line 108, so an appended line is line 109.
  await t.test("a sibling link from references/ names the references/ fix", (t) => {
    assertReportsLine(
      t,
      compliant({
        [`${SKILL}/SKILL.md`]: skillFile({
          body: `${LINKS}Read [the notes](references/notes.md).\n`,
        }),
        [`${SKILL}/references/guide.md`]: `${LONG_GUIDE}See [the notes](notes.md).\n`,
        [`${SKILL}/references/notes.md`]: "# Notes\n",
      }),
      'skills/engineering/reviewing-widgets/references/guide.md: C7 line 109: "notes.md" is not a tracked file at skills/engineering/reviewing-widgets/notes.md. Link from the skill directory, as in references/notes.md',
    );
  });

  await t.test("a link in a shared/ copy resolves from shared/", (t) => {
    assertReportsLine(
      t,
      compliant({
        [`${SKILL}/shared/rule.md`]: "# Rule\n\nSee [the guide](references/guide.md).\n",
      }),
      'skills/engineering/reviewing-widgets/shared/rule.md: C7 line 3: "references/guide.md" is not a tracked file at skills/engineering/reviewing-widgets/shared/references/guide.md.',
    );
  });

  // skillFile puts the body's first line on line 8, so the line after LINKS is line 9.
  await t.test("<skill-dir>/scripts/missing.mjs", (t) => {
    assertReportsMatch(
      t,
      compliant({
        [`${SKILL}/SKILL.md`]: skillFile({
          body: `${LINKS}Run \`node <skill-dir>/scripts/missing.mjs\`.\n`,
        }),
      }),
      /^skills\/engineering\/reviewing-widgets\/SKILL\.md: C7 line 9: [^\n]*scripts\/missing\.mjs/m,
    );
  });

  await t.test("<reviewing-widgets-skill-dir>/missing.md", (t) => {
    assertReportsMatch(
      t,
      compliant({
        [`${SKILL}/SKILL.md`]: skillFile({
          body: `${LINKS}Read \`<reviewing-widgets-skill-dir>/missing.md\`.\n`,
        }),
      }),
      /^skills\/engineering\/reviewing-widgets\/SKILL\.md: C7 line 9: [^\n]*missing\.md/m,
    );
  });

  await t.test("a <skill-dir>/scripts/ path with no tracked file under scripts/", (t) => {
    assertReportsMatch(
      t,
      compliant({
        [`${SKILL}/SKILL.md`]: skillFile({
          body: `${LINKS}List \`<skill-dir>/scripts/\` first.\n`,
        }),
      }),
      /^skills\/engineering\/reviewing-widgets\/SKILL\.md: C7 line 9: [^\n]*scripts\//m,
    );
  });
});

test("C7 accepts tracked targets and skips targets it cannot resolve", async (t) => {
  const withScript = (body) =>
    compliant({
      [`${SKILL}/SKILL.md`]: skillFile({ body: `${LINKS}${body}` }),
      [`${SKILL}/scripts/run.sh`]: "#!/bin/sh\n",
    });

  await t.test("a quoted <skill-dir>/ path", (t) => {
    const run = runLint(t, withScript('Run `bash "<skill-dir>/scripts/run.sh"`.\n'));
    assert.deepEqual(run, { status: 0, output: "" });
  });

  await t.test("a <skill-dir>/ path before a comma", (t) => {
    const run = runLint(t, withScript("Run <skill-dir>/scripts/run.sh, then read its output.\n"));
    assert.deepEqual(run, { status: 0, output: "" });
  });

  await t.test("a <skill-dir>/ path before a trailing period", (t) => {
    const run = runLint(t, withScript("Then run <skill-dir>/scripts/run.sh.\n"));
    assert.deepEqual(run, { status: 0, output: "" });
  });

  await t.test("<skill-dir>/scripts/<name> reads as scripts/", (t) => {
    const run = runLint(t, withScript("Run `node <skill-dir>/scripts/<name>`.\n"));
    assert.deepEqual(run, { status: 0, output: "" });
  });

  await t.test("<skill-dir>/ alone names the skill directory", (t) => {
    const run = runLint(t, withScript("Work inside `<skill-dir>/`.\n"));
    assert.deepEqual(run, { status: 0, output: "" });
  });

  await t.test("https: and mailto: targets", (t) => {
    const run = runLint(
      t,
      withScript(
        "See [the spec](https://example.com/missing.md) or [mail us](mailto:widgets@example.com).\n",
      ),
    );
    assert.deepEqual(run, { status: 0, output: "" });
  });

  await t.test("a bare #anchor", (t) => {
    const run = runLint(t, withScript("Go [back to the top](#reviewing-widgets).\n"));
    assert.deepEqual(run, { status: 0, output: "" });
  });

  await t.test("a target with a leading <", (t) => {
    const run = runLint(t, withScript("See [the raw file](<missing.md>).\n"));
    assert.deepEqual(run, { status: 0, output: "" });
  });

  await t.test("an extensionless target", (t) => {
    const run = runLint(t, withScript("See [the folder](missing).\n"));
    assert.deepEqual(run, { status: 0, output: "" });
  });

  await t.test("a backslash target gets only its C5 line", (t) => {
    const run = runLint(t, withScript("See [the guide](references\\missing.md).\n"));
    assert.equal(run.status, 1, run.output);
    assert.match(run.output, /: C5 line 9: use forward slashes in "references\\missing\.md"/);
    assert.doesNotMatch(run.output, /: C7 /);
  });

  await t.test("<reviewing-code-skill-dir>/x.md gets only its C8 line", (t) => {
    const run = runLint(t, withScript("Read `<reviewing-code-skill-dir>/x.md`.\n"));
    assert.equal(run.status, 1, run.output);
    assert.match(run.output, /: C8 line 9: /);
    assert.doesNotMatch(run.output, /: C7 /);
  });
});

test("C8 reports a -dir or -root placeholder that does not name the skill's own directory", async (t) => {
  await t.test("<app-root> fails", (t) => {
    assertReportsMatch(
      t,
      compliant({
        [`${SKILL}/SKILL.md`]: skillFile({ body: `${LINKS}Run \`cd <app-root>\`.\n` }),
      }),
      /^skills\/engineering\/reviewing-widgets\/SKILL\.md: C8 line 9: placeholder "<?app-root>?" ends in -dir or -root but does not name this skill's directory; rename it, as in <out>$/m,
    );
  });

  await t.test("<out-dir> fails", (t) => {
    assertReportsMatch(
      t,
      compliant({
        [`${SKILL}/SKILL.md`]: skillFile({ body: `${LINKS}Write to \`<out-dir>\`.\n` }),
      }),
      /^skills\/engineering\/reviewing-widgets\/SKILL\.md: C8 line 9: placeholder "<?out-dir>?" ends in -dir or -root/m,
    );
  });

  await t.test("<reviewing-code-skill-dir> fails outside reviewing-code", (t) => {
    assertReportsMatch(
      t,
      compliant({
        [`${SKILL}/SKILL.md`]: skillFile({
          body: `${LINKS}List \`<reviewing-code-skill-dir>\`.\n`,
        }),
      }),
      /^skills\/engineering\/reviewing-widgets\/SKILL\.md: C8 line 9: placeholder "<?reviewing-code-skill-dir>?" ends in -dir or -root/m,
    );
  });

  await t.test("<skill-dir> passes", (t) => {
    const body = `${LINKS}List \`<skill-dir>\`.\n`;
    const run = runLint(t, compliant({ [`${SKILL}/SKILL.md`]: skillFile({ body }) }));
    assert.deepEqual(run, { status: 0, output: "" });
  });

  await t.test("<reviewing-widgets-skill-dir> passes in reviewing-widgets", (t) => {
    const body = `${LINKS}List \`<reviewing-widgets-skill-dir>\`.\n`;
    const run = runLint(t, compliant({ [`${SKILL}/SKILL.md`]: skillFile({ body }) }));
    assert.deepEqual(run, { status: 0, output: "" });
  });
});

// ---------------------------------------------------------------------------------------------
// G1: each skill has its trigger, guard, and core eval cases

test("G1 reports a skill missing its trigger, guard, or core case", (t) => {
  const files = compliant();
  delete files["evals/engineering/reviewing-widgets/reviewing-widgets-core/prompt.md"];
  const run = runLint(t, files);
  assert.equal(run.status, 1, run.output);
  assert.match(
    run.output,
    /^skills\/engineering\/reviewing-widgets\/SKILL\.md: G1 evals\/engineering\/reviewing-widgets\/ lacks reviewing-widgets-core\b/m,
  );
  assert.doesNotMatch(run.output, /reviewing-widgets-(trigger|guard)/);
});

test("G1 skips a skill named in EVALS_PENDING", (t) => {
  assert.ok(
    lint.EVALS_PENDING && typeof lint.EVALS_PENDING === "object",
    "scripts/lint-skills.mjs exports no EVALS_PENDING map",
  );
  const name = Object.keys(lint.EVALS_PENDING)[0];
  if (!name) return t.skip("EVALS_PENDING is empty");
  const dir = `skills/engineering/${name}`;
  const run = runLint(t, {
    [`${dir}/SKILL.md`]: skillFile({ name }),
    [`${dir}/references/guide.md`]: LONG_GUIDE,
    [`${dir}/shared/rule.md`]: "# Rule\n\nKeep it short.\n",
    [`${dir}/agents/openai.yaml`]: OPENAI_YAML,
  });
  assert.deepEqual(run, { status: 0, output: "" });
});

test("every EVALS_PENDING entry names an active skill that still lacks a case", () => {
  assert.ok(
    lint.EVALS_PENDING && typeof lint.EVALS_PENDING === "object",
    "scripts/lint-skills.mjs exports no EVALS_PENDING map",
  );
  assert.equal(
    typeof lint.missingEvalCases,
    "function",
    "scripts/lint-skills.mjs exports no missingEvalCases function",
  );
  const skills = gitFiles("skills/*/*/SKILL.md").filter((path) =>
    /^skills\/(engineering|productivity)\/[^/]+\/SKILL\.md$/.test(path),
  );
  const prompts = new Set(
    gitFiles("evals").filter((path) =>
      /^evals\/(engineering|productivity)\/[^/]+\/[^/]+\/prompt\.md$/.test(path),
    ),
  );
  const problems = Object.keys(lint.EVALS_PENDING).flatMap((name) => {
    const skillPath = skills.find((path) => path.split("/")[2] === name);
    if (!skillPath)
      return [
        `EVALS_PENDING in scripts/lint-skills.mjs: ${name} is not an active skill. Delete its entry.`,
      ];
    if (lint.missingEvalCases(skillPath, prompts).length === 0)
      return [
        `EVALS_PENDING in scripts/lint-skills.mjs: ${name} now has its trigger, guard, and core cases. Delete its entry.`,
      ];
    return [];
  });
  assert.deepEqual(problems, []);
});

// ---------------------------------------------------------------------------------------------
// A7: agents/openai.yaml exists and agrees with SKILL.md on invocation

function withInvocation(value) {
  return skillFile().replace("---\n\n", `disable-model-invocation: ${value}\n---\n\n`);
}

test("A7 reports a missing openai.yaml, a disagreeing invocation pair, and a value other than true or false", async (t) => {
  await t.test("no agents/openai.yaml", (t) => {
    const files = compliant();
    delete files[`${SKILL}/agents/openai.yaml`];
    assertReportsLine(
      t,
      files,
      "skills/engineering/reviewing-widgets/SKILL.md: A7 no agents/openai.yaml; add one",
    );
  });

  await t.test("disable-model-invocation: true with no policy block", (t) => {
    assertReportsLine(
      t,
      compliant({ [`${SKILL}/SKILL.md`]: withInvocation("true") }),
      "skills/engineering/reviewing-widgets/SKILL.md: A7 disable-model-invocation is true, so agents/openai.yaml must set policy.allow_implicit_invocation: false",
    );
  });

  await t.test("disable-model-invocation: true with allow_implicit_invocation: true", (t) => {
    assertReportsLine(
      t,
      compliant({
        [`${SKILL}/SKILL.md`]: withInvocation("true"),
        [`${SKILL}/agents/openai.yaml`]: `${OPENAI_YAML}policy:\n  allow_implicit_invocation: true\n`,
      }),
      "skills/engineering/reviewing-widgets/SKILL.md: A7 disable-model-invocation is true, so agents/openai.yaml must set policy.allow_implicit_invocation: false",
    );
  });

  await t.test("allow_implicit_invocation: false on a model-invoked skill", (t) => {
    assertReportsMatch(
      t,
      compliant({
        [`${SKILL}/agents/openai.yaml`]: `${OPENAI_YAML}policy:\n  allow_implicit_invocation: false\n`,
      }),
      /^skills\/engineering\/reviewing-widgets\/SKILL\.md: A7 [^\n]*allow_implicit_invocation/m,
    );
  });

  await t.test('"true # note" is quoted', (t) => {
    assertReportsLine(
      t,
      compliant({
        [`${SKILL}/SKILL.md`]: withInvocation("true # note"),
        [`${SKILL}/agents/openai.yaml`]: `${OPENAI_YAML}policy:\n  allow_implicit_invocation: false\n`,
      }),
      'skills/engineering/reviewing-widgets/SKILL.md: A7 disable-model-invocation is "true # note"; write true or false',
    );
  });

  await t.test('"yes" is quoted', (t) => {
    assertReportsLine(
      t,
      compliant({
        [`${SKILL}/agents/openai.yaml`]: `${OPENAI_YAML}policy:\n  allow_implicit_invocation: yes\n`,
      }),
      'skills/engineering/reviewing-widgets/SKILL.md: A7 allow_implicit_invocation is "yes"; write true or false',
    );
  });
});

test("A7 accepts a matching pair and reads disable-model-invocation: false as model-invoked", async (t) => {
  await t.test("disable-model-invocation: true with allow_implicit_invocation: false", (t) => {
    const run = runLint(
      t,
      compliant({
        [`${SKILL}/SKILL.md`]: withInvocation("true"),
        [`${SKILL}/agents/openai.yaml`]: `${OPENAI_YAML}policy:\n  allow_implicit_invocation: false\n`,
      }),
    );
    assert.deepEqual(run, { status: 0, output: "" });
  });

  await t.test("disable-model-invocation: false with no policy block", (t) => {
    const run = runLint(t, compliant({ [`${SKILL}/SKILL.md`]: withInvocation("false") }));
    assert.deepEqual(run, { status: 0, output: "" });
  });
});

// ---------------------------------------------------------------------------------------------
// Subagents: A3 to A5 on descriptions, S1 model alias, S2 readonly beside tools, S3 role noun

const AGENT_DESCRIPTION =
  "Reviews a diff for defects. Use when the main agent wants a second opinion on a change.";

function agentFile({
  name = "reviewer",
  description = AGENT_DESCRIPTION,
  fields = "tools: Read, Grep\nreadonly: true\nmodel: sonnet\n",
} = {}) {
  return `---\nname: ${name}\ndescription: ${description}\n${fields}---\n\n# Reviewer\n\nReview the diff.\n`;
}

test("S1, S2, and S3 report a dated model, a readonly mismatch, and a gerund name in agents/*.md", async (t) => {
  await t.test("a dated model", (t) => {
    assertReportsLine(
      t,
      compliant({
        "agents/reviewer.md": agentFile({
          fields: "tools: Read, Grep\nreadonly: true\nmodel: claude-sonnet-4-5-20250929\n",
        }),
      }),
      'agents/reviewer.md: S1 model "claude-sonnet-4-5-20250929" must be a tier alias: opus, sonnet, or haiku',
    );
  });

  await t.test("read-only tools with no readonly", (t) => {
    assertReportsLine(
      t,
      compliant({
        "agents/reviewer.md": agentFile({ fields: "tools: Read, Grep\nmodel: sonnet\n" }),
      }),
      "agents/reviewer.md: S2 tools holds no write tool, so set readonly: true",
    );
  });

  await t.test("readonly: true with Edit in tools", (t) => {
    assertReportsMatch(
      t,
      compliant({
        "agents/reviewer.md": agentFile({
          fields: "tools: Read, Edit\nreadonly: true\nmodel: sonnet\n",
        }),
      }),
      /^agents\/reviewer\.md: S2 [^\n]*Edit/m,
    );
  });

  await t.test("a block-list tools with no write tool and no readonly", (t) => {
    assertReportsLine(
      t,
      compliant({
        "agents/reviewer.md": agentFile({
          fields: "tools:\n  - Read\n  - Grep\nmodel: sonnet\n",
        }),
      }),
      "agents/reviewer.md: S2 tools holds no write tool, so set readonly: true",
    );
  });

  await t.test("a gerund name", (t) => {
    assertReportsLine(
      t,
      compliant({ "agents/reviewer.md": agentFile({ name: "reviewing-agent" }) }),
      'agents/reviewer.md: S3 name "reviewing-agent" reads as a gerund; name a subagent with a role noun, as in "oracle"',
    );
  });

  await t.test("no frontmatter", (t) => {
    const run = runLint(t, compliant({ "agents/reviewer.md": "# Reviewer\n\nReview the diff.\n" }));
    assert.equal(run.status, 1, run.output);
    assert.ok(run.output.split("\n").includes("agents/reviewer.md: A3 no frontmatter"), run.output);
    assert.ok(run.output.split("\n").includes("agents/reviewer.md: S1 no model"), run.output);
  });
});

test("A3, A4, and A5 apply to subagent descriptions", async (t) => {
  await t.test('a description that opens with "You"', (t) => {
    assertReportsMatch(
      t,
      compliant({
        "agents/reviewer.md": agentFile({
          description: "You review diffs. Use when the main agent wants a second opinion.",
        }),
      }),
      /^agents\/reviewer\.md: A4 [^\n]*opens with "You"$/m,
    );
  });

  await t.test("a description with no Use when clause", (t) => {
    assertReportsMatch(
      t,
      compliant({
        "agents/reviewer.md": agentFile({ description: "Reviews a diff for defects." }),
      }),
      /^agents\/reviewer\.md: A5 [^\n]*"Use when \.\.\." clause$/m,
    );
  });
});

test("a subagent with an alias model, read-only tools, readonly: true, and a role-noun name passes", (t) => {
  const run = runLint(t, compliant({ "agents/reviewer.md": agentFile() }));
  assert.deepEqual(run, { status: 0, output: "" });
});
