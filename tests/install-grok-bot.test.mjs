// Fails when scripts/install-grok-bot.sh stops copying every active skill's SKILL.md, references/,
// scripts/, and shared/ into <dest>/<name>/, copies agents/ or an archived skill, leaves a stale
// file behind on a rerun, or when its strategy set names a skill that is not active. The fixture
// cases run the real script in a temporary checkout; the repository cases run it on this one.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const REPO = resolve(".");
const SCRIPT = resolve("scripts/install-grok-bot.sh");

function run(checkout, ...args) {
  assert.ok(existsSync(SCRIPT), `missing ${SCRIPT}`);
  const result = spawnSync("sh", [join(checkout, "scripts/install-grok-bot.sh"), ...args], {
    encoding: "utf8",
    env: { ...process.env, HOME: join(checkout, "home") },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function scratch(t) {
  const root = mkdtempSync(join(tmpdir(), "install-grok-bot-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function fixtureCheckout(t) {
  const root = scratch(t);
  const files = {
    "skills/engineering/widget/SKILL.md": "---\nname: widget\n---\n\nWidget.\n",
    "skills/engineering/widget/agents/openai.yaml": "interface:\n  display_name: Widget\n",
    "skills/engineering/widget/references/detail.md": "Detail.\n",
    "skills/engineering/widget/scripts/run.mjs": "console.log('run');\n",
    "skills/engineering/widget/shared/rule.md": "Rule.\n",
    "skills/productivity/gadget/SKILL.md": "---\nname: gadget\n---\n\nGadget.\n",
    "skills/productivity/gadget/agents/openai.yaml": "interface:\n  display_name: Gadget\n",
    "skills/deprecated/old/SKILL.md.disabled": "---\nname: old\n---\n\nOld.\n",
  };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  mkdirSync(join(root, "scripts"));
  writeFileSync(join(root, "scripts/install-grok-bot.sh"), readFileSync(SCRIPT));
  return root;
}

function trackedActiveSkills() {
  return execFileSync("git", ["-C", REPO, "ls-files", "-z", "--", "skills/*/*/SKILL.md"], {
    encoding: "utf8",
  })
    .split("\0")
    .filter((path) => /^skills\/(engineering|productivity)\/[^/]+\/SKILL\.md$/.test(path))
    .map((path) => path.split("/")[2])
    .sort();
}

function strategySkills() {
  const block = readFileSync(SCRIPT, "utf8").match(/STRATEGY_SKILLS="\n([\s\S]*?)"\n/);
  assert.ok(block, "scripts/install-grok-bot.sh has no STRATEGY_SKILLS block");
  return block[1].split("\n").filter(Boolean);
}

// ---------------------------------------------------------------------------------------------
// Fixture checkouts

test("installs every active skill's SKILL.md, references/, scripts/, and shared/ and nothing else", (t) => {
  const checkout = fixtureCheckout(t);
  const dest = join(checkout, "workflows");
  const result = run(checkout, "--dest", dest);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readdirSync(dest).sort(), ["gadget", "widget"]);
  assert.deepEqual(readdirSync(join(dest, "widget")).sort(), [
    "SKILL.md",
    "references",
    "scripts",
    "shared",
  ]);
  assert.equal(readFileSync(join(dest, "widget/references/detail.md"), "utf8"), "Detail.\n");
  assert.equal(readFileSync(join(dest, "widget/scripts/run.mjs"), "utf8"), "console.log('run');\n");
  assert.equal(readFileSync(join(dest, "widget/shared/rule.md"), "utf8"), "Rule.\n");
  assert.deepEqual(readdirSync(join(dest, "gadget")), ["SKILL.md"]);
  assert.equal(existsSync(join(dest, "old")), false, "copied an archived skill");
  assert.match(result.stdout, /^installed widget\ninstalled gadget\n2 skills installed to /);
});

test("defaults to $HOME/agent-data/workflows", (t) => {
  const checkout = fixtureCheckout(t);
  const result = run(checkout);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(join(checkout, "home/agent-data/workflows/widget/SKILL.md")));
  assert.ok(existsSync(join(checkout, "home/agent-data/workflows/gadget/SKILL.md")));
});

test("a rerun replaces each installed copy, dropping files the checkout no longer has", (t) => {
  const checkout = fixtureCheckout(t);
  const dest = join(checkout, "workflows");
  assert.equal(run(checkout, "--dest", dest).status, 0);
  writeFileSync(join(dest, "widget/references/stale.md"), "Stale.\n");
  writeFileSync(join(dest, "widget/SKILL.md"), "edited on the bot\n");
  writeFileSync(
    join(checkout, "skills/engineering/widget/SKILL.md"),
    "---\nname: widget\n---\n\nWidget v2.\n",
  );
  rmSync(join(checkout, "skills/engineering/widget/scripts"), { recursive: true });
  const result = run(checkout, "--dest", dest);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    readFileSync(join(dest, "widget/SKILL.md"), "utf8"),
    "---\nname: widget\n---\n\nWidget v2.\n",
  );
  assert.equal(existsSync(join(dest, "widget/references/stale.md")), false, "stale file survived");
  assert.equal(existsSync(join(dest, "widget/scripts")), false, "removed scripts/ survived");
  assert.deepEqual(readdirSync(dest).sort(), ["gadget", "widget"]);
});

test("--set strategy exits 1 naming a listed skill the checkout lacks", (t) => {
  const checkout = fixtureCheckout(t);
  const result = run(checkout, "--set", "strategy", "--dest", join(checkout, "workflows"));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /skill being-extremely-fucking-brief is not an active skill/);
  assert.equal(existsSync(join(checkout, "workflows/widget")), false);
});

test("exits 1 when the checkout has no active skills", (t) => {
  const checkout = scratch(t);
  mkdirSync(join(checkout, "scripts"));
  writeFileSync(join(checkout, "scripts/install-grok-bot.sh"), readFileSync(SCRIPT));
  const result = run(checkout, "--dest", join(checkout, "workflows"));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /found no active skills/);
});

test("exits 2 with a usage line on a bad set, a missing value, or an unknown flag", (t) => {
  const checkout = fixtureCheckout(t);
  for (const args of [["--set", "everything"], ["--dest"], ["--bogus"]]) {
    const result = run(checkout, ...args);
    assert.equal(result.status, 2, args.join(" "));
    assert.match(result.stderr, /^usage: sh scripts\/install-grok-bot\.sh /);
  }
});

// ---------------------------------------------------------------------------------------------
// The repository

test("the whole set installs every tracked active skill from this checkout", (t) => {
  const dest = join(scratch(t), "workflows");
  const result = run(REPO, "--dest", dest);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readdirSync(dest).sort(), trackedActiveSkills());
});

test("the strategy set names only active skills and installs exactly those", (t) => {
  const listed = strategySkills();
  assert.ok(listed.length > 0, "the strategy set is empty");
  const active = new Set(trackedActiveSkills());
  for (const name of listed) assert.ok(active.has(name), `${name} is not an active skill`);
  const dest = join(scratch(t), "workflows");
  const result = run(REPO, "--set", "strategy", "--dest", dest);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readdirSync(dest).sort(), [...listed].sort());
});
