// Fails when scripts/build-site.mjs copies a static file reached through a symlink, which would
// publish a file from outside the repository. Each case runs the real CLI in a temporary
// repository built with `git init` plus `git add`, never a commit.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const BUILD_SITE = resolve("scripts/build-site.mjs");
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
const SKILL = "---\nname: widget\ndescription: Use for fixture checks.\n---\n\n# widget\n";

// Builds <tmp>/repo (staged, uncommitted) with one skill, writes `outsideFiles` under <tmp>/outside,
// and creates each `links` entry: a repo path symlinked to a path under <tmp>/outside. Returns the
// build's result and output directory.
function buildFixture(t, { files, outsideFiles, links }) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "site-static-")));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const repo = join(base, "repo");
  const outside = join(base, "outside");
  for (const [root, entries] of [
    [repo, { "skills/engineering/widget/SKILL.md": SKILL, ...files }],
    [outside, outsideFiles],
  ]) {
    for (const [path, text] of Object.entries(entries)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
  }
  for (const [path, target] of Object.entries(links)) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    symlinkSync(join(outside, target), join(repo, path));
  }
  for (const args of [
    ["init", "-q"],
    ["add", "-A"],
  ]) {
    const run = spawnSync("git", args, { cwd: repo, env: GIT_ENV, encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
  }
  const out = join(base, "site");
  const run = spawnSync(process.execPath, [BUILD_SITE, out], {
    cwd: repo,
    env: GIT_ENV,
    encoding: "utf8",
  });
  return { run, out };
}

test("build-site exits 1 naming a symlinked static file and publishes nothing", (t) => {
  const { run, out } = buildFixture(t, {
    files: { "docs/CNAME": "example.invalid\n", "docs/copy-code.js": "" },
    outsideFiles: { "outside.css": "body { color: red; }\n" },
    links: { "docs/style.css": "outside.css" },
  });
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stderr, /docs\/style\.css\b.*symlink/);
  assert.equal(existsSync(join(out, "style.css")), false, "copied the symlinked file");
});

test("build-site exits 1 naming a static file under a symlinked docs/ and publishes nothing", (t) => {
  const { run, out } = buildFixture(t, {
    files: {},
    outsideFiles: {
      "docs/CNAME": "example.invalid\n",
      "docs/copy-code.js": "",
      "docs/style.css": "body { color: red; }\n",
    },
    links: { docs: "docs" },
  });
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stderr, /docs\/style\.css\b.*resolves outside/);
  assert.equal(existsSync(out), false, "wrote the site");
});
