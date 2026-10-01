// Fails when a tracked skill holds a reference that does not resolve inside its own directory,
// so the skill would break when copied alone into an agent's skills folder:
// - outside fenced code: [text](path) links, and code spans starting with references/,
//   playbooks/, scripts/, resources/, shared/, or ../<dir>/;
// - a link or code span starting with skills/<seg>/ always fails;
// - everywhere, fences included: a location placeholder <p>/path whose p ends in -dir or -root
//   passes only as <skill-dir>/path or <own-name-skill-dir>/path naming a tracked file of the
//   skill; $V/path and ${V}/path fail when V ends in PLUGIN_ROOT;
// - a path#fragment link into a .md file names a heading of that file;
// - relative imports in .mjs files resolve inside the skill, and no tracked symlink exists.
// One base per file: a file under skills/<name>/shared/ resolves from its own directory, every
// other file from skills/<name>/. Skips URLs, pure #anchors, and paths holding < > { } [ ] * ? $ ….
// Each failure reads `file:line -> path`. Fixtures are `git init` plus `git add`, never a commit.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix, resolve } from "node:path";
import test from "node:test";

const REPO = resolve(".");
const TEMPLATE = /[<>{}[\]*?$…]/;
const CHECKED_SPAN = /^(?:(?:references|playbooks|scripts|resources|shared)\/|\.\.\/[^/\s]+\/)/;
const OTHER_SKILL = /^skills\/[^/\s]+\//;
const URL_SCHEME = /^[a-z][\w+.-]*:/i;
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };

// ---------------------------------------------------------------------------------------------
// The checker. It reads only tracked (or staged) files, so untracked directories never count.

function git(root, ...args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
}

function trackedSkills(root) {
  return git(root, "ls-files", "-z", "--", "skills/*/SKILL.md")
    .split("\0")
    .filter((path) => /^skills\/[^/]+\/SKILL\.md$/.test(path))
    .map((path) => path.split("/")[1])
    .sort();
}

function trackedEntries(root, name) {
  return git(root, "ls-files", "-s", "-z", "--", `skills/${name}`)
    .split("\0")
    .filter(Boolean)
    .map((entry) => {
      const [meta, path] = entry.split("\t");
      return { mode: meta.split(" ")[0], path };
    });
}

function slug(heading) {
  return heading.toLowerCase().replace(/[^a-z0-9 -]/g, "").replace(/ /g, "-");
}

// Splits a Markdown file into lines, marking fenced lines and the code spans that open and close
// on a prose line. A line starting with ``` opens a fence only if the rest holds no backtick.
function markdownLines(text) {
  const lines = [];
  let fence = null;
  let open = null;
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = { number: index + 1, raw, fenced: false, prose: "", spans: [] };
    lines.push(line);
    let marker = raw.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (marker?.[1][0] === "`" && marker[2].includes("`")) marker = null;
    if (fence) {
      line.fenced = true;
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      return;
    }
    if (marker) {
      line.fenced = true;
      fence = marker[1];
      open = null;
      return;
    }
    if (!raw.trim()) {
      open = null;
      return;
    }
    let cursor = 0;
    let wrapped = open !== null;
    for (const run of raw.matchAll(/`+/g)) {
      if (!open) {
        line.prose += raw.slice(cursor, run.index);
        open = run[0].length;
      } else if (run[0].length === open) {
        if (!wrapped) line.spans.push(raw.slice(cursor, run.index));
        open = null;
        wrapped = false;
      } else continue;
      cursor = run.index + run[0].length;
    }
    if (!open) line.prose += raw.slice(cursor);
  });
  return lines;
}

function headingSlugs(root, file) {
  return new Set(
    markdownLines(readFileSync(join(root, file), "utf8"))
      .filter((line) => !line.fenced)
      .map((line) => line.raw.match(/^#{1,6}\s+(.+?)\s*$/))
      .filter(Boolean)
      .map(([, heading]) => slug(heading)),
  );
}

function selfContainmentViolations(root) {
  const violations = [];
  for (const name of trackedSkills(root)) {
    const skillRoot = `skills/${name}`;
    const entries = trackedEntries(root, name);
    const tracked = new Set(entries.map((entry) => entry.path));
    const inside = (target) => target.startsWith(`${skillRoot}/`);
    const exists = (target) => {
      const path = target.replace(/\/$/, "");
      return tracked.has(path) || entries.some((entry) => entry.path.startsWith(`${path}/`));
    };

    for (const { mode, path: file } of entries) {
      if (mode === "120000") {
        violations.push(`${file} -> symlink`);
        continue;
      }
      const base = file.startsWith(`${skillRoot}/shared/`) ? posix.dirname(file) : skillRoot;
      const text = readFileSync(join(root, file), "utf8");
      const fail = (line, reference) => violations.push(`${file}:${line} -> ${reference}`);

      if (file.endsWith(".mjs")) {
        text.split(/\r?\n/).forEach((raw, index) => {
          for (const [, specifier] of raw.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["'](\.{1,2}\/[^"']+)["']/g)) {
            const target = posix.normalize(posix.join(posix.dirname(file), specifier));
            if (!inside(target) || !exists(target)) fail(index + 1, specifier);
          }
        });
      }
      if (!file.endsWith(".md")) continue;

      for (const line of markdownLines(text)) {
        for (const [whole, placeholder, rest] of line.raw.matchAll(/<([\w-]+)>\/([^\s"'`)]*)/g)) {
          if (!/-(?:dir|root)$/.test(placeholder)) continue;
          const own = placeholder === "skill-dir" || placeholder === `${name}-skill-dir`;
          const path = rest.replace(/[.,;:]+$/, "");
          const target = posix.normalize(`${skillRoot}/${path}`);
          if (!own) fail(line.number, whole.replace(/[.,;:]+$/, ""));
          else if (path && !TEMPLATE.test(path) && (!inside(target) || !exists(target))) fail(line.number, whole.replace(/[.,;:]+$/, ""));
        }
        for (const [whole, variable] of line.raw.matchAll(/\$\{?([A-Za-z_]\w*)(?::?[-=+?][^}]*)?\}?\/[^\s"'`)]*/g)) {
          if (variable.endsWith("PLUGIN_ROOT")) fail(line.number, whole);
        }
        if (line.fenced) continue;

        const references = [
          ...line.spans.map((span) => span.trim().split(/\s/)[0]).filter((path) => CHECKED_SPAN.test(path) || OTHER_SKILL.test(path)),
          ...[...line.prose.matchAll(/\]\(([^)\s]+)/g)].map(([, target]) => target),
        ];
        for (const reference of references) {
          if (OTHER_SKILL.test(reference)) {
            fail(line.number, reference);
            continue;
          }
          if (URL_SCHEME.test(reference) || reference.startsWith("#") || TEMPLATE.test(reference)) continue;
          const [path, fragment] = reference.split("#");
          const target = posix.normalize(posix.join(base, path));
          if (!inside(target) || !exists(target)) fail(line.number, reference);
          else if (fragment && target.endsWith(".md") && !headingSlugs(root, target).has(fragment)) fail(line.number, reference);
        }
      }
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------------------------
// Fixtures: a temporary repository holding invented skills, staged and never committed.

function fixtureRepo(t, files, symlinks = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "self-containment-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  for (const [path, target] of Object.entries(symlinks)) symlinkSync(target, join(root, path));
  for (const args of [["init", "-q"], ["add", "--", "skills"]]) {
    const run = spawnSync("git", args, { cwd: root, env: GIT_ENV, encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
  }
  return root;
}

const GADGET = "---\nname: gadget\ndescription: Use for fixture checks.\n---\n\n# gadget\n";

// ---------------------------------------------------------------------------------------------
// The repository

test("every tracked skill resolves its links, code spans, placeholders, and imports inside its own directory", () => {
  assert.ok(trackedSkills(REPO).length > 0, "found no tracked skills/*/SKILL.md");
  assert.deepEqual(selfContainmentViolations(REPO), []);
});

// ---------------------------------------------------------------------------------------------
// References the checker rejects

test("a link that escapes the skill fails even when its target exists", (t) => {
  const root = fixtureRepo(t, {
    "skills/widget/SKILL.md": "---\nname: widget\ndescription: Use for fixture checks.\n---\n\nRead the [sibling skill](../gadget/SKILL.md).\n",
    "skills/gadget/SKILL.md": GADGET,
  });
  assert.deepEqual(selfContainmentViolations(root), ["skills/widget/SKILL.md:6 -> ../gadget/SKILL.md"]);
});

test("a code span naming another skill's path fails", (t) => {
  const root = fixtureRepo(t, {
    "skills/widget/SKILL.md": "---\nname: widget\ndescription: Use for fixture checks.\n---\n\nPair it with `skills/gadget/SKILL.md` when needed.\n",
    "skills/gadget/SKILL.md": GADGET,
  });
  assert.deepEqual(selfContainmentViolations(root), ["skills/widget/SKILL.md:6 -> skills/gadget/SKILL.md"]);
});

test("a location placeholder for another skill's directory fails even when the path exists in this skill", (t) => {
  const root = fixtureRepo(t, {
    "skills/widget/SKILL.md": "---\nname: widget\ndescription: Use for fixture checks.\n---\n\nRun `node <other-skill-dir>/scripts/run.mjs`.\n",
    "skills/widget/scripts/run.mjs": "export const run = 1;\n",
  });
  assert.deepEqual(selfContainmentViolations(root), ["skills/widget/SKILL.md:6 -> <other-skill-dir>/scripts/run.mjs"]);
});

test("a -root location placeholder inside fenced code fails even when the path exists in this skill", (t) => {
  const root = fixtureRepo(t, {
    "skills/widget/SKILL.md": "---\nname: widget\ndescription: Use for fixture checks.\n---\n\n```sh\ncat <artifact-root>/notes.md\n```\n",
    "skills/widget/notes.md": "# Notes\n",
  });
  assert.deepEqual(selfContainmentViolations(root), ["skills/widget/SKILL.md:7 -> <artifact-root>/notes.md"]);
});

test("a path under a PLUGIN_ROOT variable fails", (t) => {
  const root = fixtureRepo(t, {
    "skills/widget/SKILL.md": "---\nname: widget\ndescription: Use for fixture checks.\n---\n\n```sh\nnode ${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs\n```\n",
  });
  assert.deepEqual(selfContainmentViolations(root), ["skills/widget/SKILL.md:7 -> ${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs"]);
});

test("a references/ file that links from its own directory instead of the skill root fails", (t) => {
  const root = fixtureRepo(t, {
    "skills/widget/SKILL.md": "---\nname: widget\ndescription: Use for fixture checks.\n---\n\nFollow the [guide](references/guide.md).\n",
    "skills/widget/references/guide.md": "# Guide\n\nApply the [rule](../shared/rule.md).\n",
    "skills/widget/shared/rule.md": "# Rule\n",
  });
  assert.deepEqual(selfContainmentViolations(root), ["skills/widget/references/guide.md:3 -> ../shared/rule.md"]);
});

test("a fragment that names no heading of its target fails", (t) => {
  const root = fixtureRepo(t, {
    "skills/widget/SKILL.md":
      "---\nname: widget\ndescription: Use for fixture checks.\n---\n\nSee [present](references/guide.md#present-part) and [missing](references/guide.md#missing-part).\n",
    "skills/widget/references/guide.md": "# Guide\n\n## Present part\n\nText.\n",
  });
  assert.deepEqual(selfContainmentViolations(root), ["skills/widget/SKILL.md:6 -> references/guide.md#missing-part"]);
});

test("a relative import that leaves the skill fails", (t) => {
  const root = fixtureRepo(t, {
    "skills/widget/SKILL.md": "---\nname: widget\ndescription: Use for fixture checks.\n---\n\nRun `scripts/run.mjs`.\n",
    "skills/widget/scripts/run.mjs": 'import { local } from "./local.mjs";\nimport { helper } from "../../gadget/scripts/lib.mjs";\n',
    "skills/widget/scripts/local.mjs": "export const local = 1;\n",
    "skills/gadget/SKILL.md": GADGET,
    "skills/gadget/scripts/lib.mjs": "export const helper = 1;\n",
  });
  assert.deepEqual(selfContainmentViolations(root), ["skills/widget/scripts/run.mjs:2 -> ../../gadget/scripts/lib.mjs"]);
});

test("a tracked symlink inside a skill fails", (t) => {
  const root = fixtureRepo(
    t,
    {
      "skills/widget/SKILL.md": "---\nname: widget\ndescription: Use for fixture checks.\n---\n\nFollow the [guide](references/guide.md).\n",
      "skills/widget/references/guide.md": "# Guide\n",
    },
    { "skills/widget/references/alias.md": "guide.md" },
  );
  assert.deepEqual(selfContainmentViolations(root), ["skills/widget/references/alias.md -> symlink"]);
});

// ---------------------------------------------------------------------------------------------
// References the checker accepts

test("a <skill-dir> placeholder naming a file of the skill passes", (t) => {
  const root = fixtureRepo(t, {
    "skills/widget/SKILL.md": "---\nname: widget\ndescription: Use for fixture checks.\n---\n\nRun `node <skill-dir>/scripts/report.mjs`.\n",
    "skills/widget/scripts/report.mjs": "export const report = 1;\n",
  });
  assert.deepEqual(selfContainmentViolations(root), []);
});

test("a placeholder for the skill's own named directory passes", (t) => {
  const root = fixtureRepo(t, {
    "skills/widget/SKILL.md": "---\nname: widget\ndescription: Use for fixture checks.\n---\n\nRead `<widget-skill-dir>/references/guide.md`.\n",
    "skills/widget/references/guide.md": "# Guide\n",
  });
  assert.deepEqual(selfContainmentViolations(root), []);
});

test("a placeholder for a user location passes", (t) => {
  const root = fixtureRepo(t, {
    "skills/widget/SKILL.md": "---\nname: widget\ndescription: Use for fixture checks.\n---\n\nWrite the report to `<out>/report.md`.\n",
  });
  assert.deepEqual(selfContainmentViolations(root), []);
});

test("a path under an ordinary environment variable passes", (t) => {
  const root = fixtureRepo(t, {
    "skills/widget/SKILL.md": "---\nname: widget\ndescription: Use for fixture checks.\n---\n\n```sh\nls ${XDG_CACHE_HOME:-$HOME/.cache}/widget\n```\n",
  });
  assert.deepEqual(selfContainmentViolations(root), []);
});
