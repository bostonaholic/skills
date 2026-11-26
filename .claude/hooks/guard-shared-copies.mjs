#!/usr/bin/env node
// Claude Code PreToolUse hook: blocks Edit, Write, and NotebookEdit on a skill's shared/ copies,
// which npm run sync-shared generates from the root shared/ directory, and on the frozen copies of
// archived skills.
//   stdin: the hook's JSON input; exit 2 with the reason on stderr blocks the call, exit 0 allows.
import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const COPY = /^skills\/([^/]+)\/[^/]+\/shared\//;

// Returns the reason to block an edit of `filePath`, or undefined to allow it.
export function blockReason(filePath, projectDir) {
  if (typeof filePath !== "string" || !filePath) return undefined;
  const path = relative(
    projectDir,
    isAbsolute(filePath) ? filePath : resolve(projectDir, filePath),
  );
  const match = path.split("\\").join("/").match(COPY);
  if (!match) return undefined;
  if (match[1] === "deprecated")
    return `${path} is a frozen copy in an archived skill. Leave it unchanged.`;
  const canonical = path.replace(COPY, "shared/");
  return `${path} is generated. Edit ${canonical}, then run npm run sync-shared.`;
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const projectDir = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
  const reason = blockReason(
    input.tool_input?.file_path ?? input.tool_input?.notebook_path,
    projectDir,
  );
  if (reason) {
    console.error(reason);
    process.exit(2);
  }
}
