#!/usr/bin/env node

/**
 * The attachment-origin test: the one place that decides whether a URL is an
 * asset GitHub's attach pipeline serves. `upload.sh` harvests with it and
 * `write-result.mjs` verifies the rendered body with it, so the two can never
 * disagree.
 *
 *     node "<skill-dir>/scripts/asset-url.mjs" <pr-host> <candidates.txt
 *
 *     import { isAttachmentUrl } from "<skill-dir>/scripts/asset-url.mjs";
 *     isAttachmentUrl(url, prHost, process.env.PR_SCREENSHOTS_ASSET_HOST);
 *
 * Reads one candidate URL per line on stdin and prints, in input order, each
 * one that passes, one per line. `PR_SCREENSHOTS_ASSET_HOST`, when set, names
 * one more allowed host (an Enterprise asset host the default rule misses).
 *
 * Exit codes:
 *
 *   0  the filter ran; zero lines out means no candidate passed
 *   2  usage fault: no <pr-host>, or one that is not a bare host name
 *
 * Why the rule is this narrow: a party with write access can append their own
 * URL during the attach window, and whatever passes here is embedded in a
 * public body and copied into any PR a caller writes. So only the attachment
 * origin qualifies: an allowlisted host, the path anchored at the host
 * boundary.
 */

import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

// The skill file that explains each exit code.
const DOC_PATH = fileURLToPath(new URL("../SKILL.md", import.meta.url));

/** A host is whole labels only: anything else carries userinfo, a port, or worse. */
const HOST = /^[A-Za-z0-9.-]+$/;

/** github.com and GitHub Enterprise both serve attachments under this path. */
const ATTACHMENT_PATH = "/user-attachments/assets/";

/**
 * The private-repo proxy rewrite is /<user-id>/<asset-id>-<uuid>.<ext>?jwt=…,
 * so on the proxy host a path is one or two segments naming an image or video file.
 * Lowercase only, matching the extensions the host emits.
 */
const PROXY_IMAGE = /^[^/]+(?:\/[^/]+)?\.(?:png|jpg|jpeg|gif|webp|avif|mp4|mov|webm)$/;

/**
 * The proxy host for `prHost`. Never a wildcard: `*.githubusercontent.com` is
 * not one host, and raw.githubusercontent.com serves any public repository.
 */
export function proxyHost(prHost) {
  return prHost === "github.com"
    ? "private-user-images.githubusercontent.com"
    : `private-user-images.${prHost}`;
}

/** True when `url` is an asset on the attachment origin for `prHost`. */
export function isAttachmentUrl(url, prHost, extraHost) {
  if (typeof url !== "string" || !url.startsWith("https://")) return false;
  const rest = url.slice("https://".length);
  const slash = rest.indexOf("/");
  const host = slash < 0 ? rest : rest.slice(0, slash);
  const path = slash < 0 ? "/" : rest.slice(slash);
  if (!HOST.test(host)) return false;
  // Dot segments walk out of the anchor, and an HTTP client normalizes them to
  // content an attacker controls on an allowlisted host. Their encoded forms
  // are refused rather than decoded.
  if (path.endsWith("..") || path.includes("../")) return false;
  if (/%2[eEfF]/.test(url)) return false;
  const proxy = proxyHost(prHost);
  if (!path.startsWith(ATTACHMENT_PATH)) {
    if (host !== proxy) return false;
    const file = path.split("?")[0].slice(1);
    if (!PROXY_IMAGE.test(file)) return false;
  }
  return host === prHost || host === proxy || (Boolean(extraHost) && host === extraHost);
}

// CLI entry point — runs only on direct execution, never on import.
// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const prHost = process.argv[2];
  if (process.argv.length !== 3 || !HOST.test(prHost ?? "")) {
    process.stderr.write("asset-url.mjs: usage: asset-url.mjs <pr-host> <candidates\n");
    process.stderr.write(`see ${DOC_PATH}\n`);
    process.exit(2);
  }
  const extraHost = process.env.PR_SCREENSHOTS_ASSET_HOST;
  const passed = readFileSync(0, "utf8")
    .split("\n")
    .filter((line) => isAttachmentUrl(line, prHost, extraHost));
  process.stdout.write(passed.map((line) => `${line}\n`).join(""));
}
