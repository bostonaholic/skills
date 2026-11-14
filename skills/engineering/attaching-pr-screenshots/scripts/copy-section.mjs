#!/usr/bin/env node

/**
 * Copy the verified Screenshots section from an earlier run into one more PR,
 * spliced into that PR's own body and written once.
 *
 *     node "<skill-dir>/scripts/copy-section.mjs" <pr-number-or-url> <result-file>
 *
 *     import { landedPairs } from "<skill-dir>/scripts/copy-section.mjs";
 *
 *   <pr-number-or-url>  the target PR, resolved by `resolve-pr.sh` into a
 *                       fresh run directory, so every `gh` call binds the
 *                       target's own host
 *   <result-file>       the `result.json` an earlier run wrote; its
 *                       `section` is what gets copied
 *
 * Nothing is uploaded. The target body is read, spliced with `splice.mjs`,
 * read again, and written once with `gh pr edit --body-file`, then read back
 * on the target's host and checked as `write-result.mjs` checks a write. A
 * failed read-back is named on stdout and never reverted or retried.
 *
 * Requires `bash` and `gh` on PATH, `gh` authenticated for the target's host.
 *
 * Stdout on exit 0: `written`, then `unverified <assertion>` when the
 * read-back did not pass. Exit codes:
 *
 *   0  the target body was written
 *   1  refused: stderr says `refused: <reason>`. The result carries no
 *      section, `resolve-pr.sh` refused the target (its stderr comes
 *      first), the splice refused, or
 *      another writer changed the body between the read and the write. The
 *      target body is byte-identical
 *   2  fault: wrong usage, an unreadable or malformed result file, or a
 *      failed `gh` call, whose stderr comes first. A fault at the edit may
 *      or may not have changed the body
 */

import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { splice } from "./splice.mjs";
import { verifySection } from "./write-result.mjs";

// The skill file that explains each outcome.
const DOC_PATH = fileURLToPath(new URL("../references/copy-mode.md", import.meta.url));
const RESOLVE_PR = fileURLToPath(new URL("./resolve-pr.sh", import.meta.url));

// A rendered 65,536-character body stays far under this.
const READ_BUFFER = 16 * 1024 * 1024;

/**
 * The result's landed assets as `write-result.mjs`'s paired entries. An asset
 * whose URL the section renders as a `![screenshot-NN](…)` image is an image;
 * any other landed asset rendered as its bare URL, which is a video.
 */
export function landedPairs(assets, section) {
  return assets
    .filter((asset) => typeof asset?.url === "string")
    .map((asset) => ({
      entry: { caption: asset.caption, path: asset.path },
      status: "landed",
      url: asset.url,
      reason: null,
      kind: section.includes(`](${asset.url})`) ? "image" : "video",
    }));
}

// CLI entry point: runs only on direct execution, never on import.
// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const stop = (code, message) => {
    process.stderr.write(`${message}\nsee ${DOC_PATH}\n`);
    process.exit(code);
  };
  const refuse = (reason) => stop(1, `refused: ${reason}`);
  const fault = (message) => stop(2, `copy-section.mjs: ${message}`);
  const forward = (stderr) => {
    if (stderr) process.stderr.write(stderr.endsWith("\n") ? stderr : `${stderr}\n`);
  };
  const gh = (args) =>
    spawnSync("gh", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: READ_BUFFER,
    });

  if (process.argv.length !== 4) {
    fault("usage: copy-section.mjs <pr-number-or-url> <result-file>");
  }
  const [target, resultFile] = process.argv.slice(2);

  let result;
  try {
    result = JSON.parse(readFileSync(resultFile, "utf8"));
  } catch (error) {
    fault(`cannot read the result file ${resultFile}: ${error.message}`);
  }
  const section = result?.section;
  if (typeof section !== "string" || section.trim() === "") {
    refuse("the result carries no section to copy");
  }
  if (!Array.isArray(result.assets)) fault("the result file has no assets list");
  const paired = landedPairs(result.assets, section);

  const runDir = mkdtempSync(join(tmpdir(), "copy-section-"));
  const resolved = spawnSync(RESOLVE_PR, [target, runDir], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (resolved.error) fault(`resolve-pr.sh could not start: ${resolved.error.message}`);
  if (resolved.status !== 0) {
    forward(resolved.stderr);
    if (resolved.status === 1) refuse(`resolve-pr.sh refused the target ${target}`);
    fault(`resolve-pr.sh exited ${resolved.status} on the target ${target}`);
  }
  const value = (name) => readFileSync(join(runDir, name), "utf8").trim();
  const number = value("number");
  const repoSpec = value("repo-spec");

  // A bare read binds "" on a rate limit, "" equals an empty description, and
  // the splice then returns the section as the target's whole body.
  const readBody = (label) => {
    const read = gh(["pr", "view", number, "--repo", repoSpec, "--json", "body"]);
    if (read.error) fault(`gh could not start: ${read.error.message}`);
    if (read.status !== 0) {
      forward(read.stderr);
      fault(`could not ${label} the target body`);
    }
    let body;
    try {
      body = JSON.parse(read.stdout).body;
    } catch {
      fault(`the target body response is not JSON`);
    }
    if (typeof body !== "string") fault("the target body response carried no body field");
    return body.replace(/\r/g, "");
  };

  const before = readBody("read");
  const spliced = splice(before, section, { landed: paired.length });
  if (!spliced.changed) refuse(spliced.reason);

  // The splice was computed from the body read above, so an edit landing in
  // between would be overwritten by a body that never contained it.
  if (readBody("re-read") !== before) {
    refuse("another writer changed the target body after it was read; it is untouched");
  }

  const newBody = join(runDir, "new-body.md");
  writeFileSync(newBody, spliced.body);
  const edit = gh(["pr", "edit", number, "--repo", repoSpec, "--body-file", newBody]);
  if (edit.error) fault(`gh could not start: ${edit.error.message}`);
  if (edit.status !== 0) {
    forward(edit.stderr);
    fault(`gh pr edit failed (exit ${edit.status})`);
  }
  process.stdout.write("written\n");

  const host = value("pr-host");
  const owner = value("owner");
  const repo = value("repo");
  const api = (args, input) =>
    spawnSync("gh", ["api", "--hostname", host, ...args], {
      encoding: "utf8",
      input,
      maxBuffer: READ_BUFFER,
    });
  let assertion;
  try {
    const pull = api([
      `repos/${owner}/${repo}/pulls/${number}`,
      "-H",
      "Accept: application/vnd.github.full+json",
    ]);
    if (pull.status !== 0) throw new Error("read failed");
    const json = JSON.parse(pull.stdout);
    let html = typeof json.body_html === "string" ? json.body_html : "";
    if (html === "") {
      // Render the stored body, never `spliced.body`: an edit that did not persist must fail.
      const text = typeof json.body === "string" ? json.body : "";
      const rendered = api(
        ["--method", "POST", "markdown", "--input", "-"],
        JSON.stringify({ text, mode: "gfm", context: `${owner}/${repo}` }),
      );
      if (rendered.status !== 0) throw new Error("render failed");
      html = rendered.stdout;
    }
    assertion = verifySection(html, paired, host, process.env.PR_SCREENSHOTS_ASSET_HOST);
  } catch {
    assertion = "the body could not be read back";
  }
  if (assertion) process.stdout.write(`unverified ${assertion}\n`);
}
