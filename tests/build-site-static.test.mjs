// Fails when scripts/build-site.mjs copies a static file reached through a symlink, which would
// publish a file from outside the repository. The case runs the real CLI in a temporary repository
// built with `git init` plus `git add`, never a commit.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const BUILD_SITE = resolve("scripts/build-site.mjs");
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };

test("build-site exits 1 naming a symlinked static file and publishes nothing", (t) => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "site-static-")));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const repo = join(base, "repo");
  const files = {
    "docs/CNAME": "example.invalid\n",
    "skills/widget/SKILL.md": "---\nname: widget\ndescription: Use for fixture checks.\n---\n\n# widget\n",
  };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), text);
  }
  writeFileSync(join(base, "outside.css"), "body { color: red; }\n");
  symlinkSync(join(base, "outside.css"), join(repo, "docs", "style.css"));
  for (const args of [["init", "-q"], ["add", "-A"]]) {
    const run = spawnSync("git", args, { cwd: repo, env: GIT_ENV, encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
  }

  const out = join(base, "site");
  const run = spawnSync(process.execPath, [BUILD_SITE, out], { cwd: repo, env: GIT_ENV, encoding: "utf8" });
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stderr, /docs\/style\.css\b.*symlink/);
  assert.equal(existsSync(join(out, "style.css")), false, "copied the symlinked file");
});
