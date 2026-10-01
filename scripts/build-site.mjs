#!/usr/bin/env node
// Builds the static docs site from the skill catalog: <out>/index.html, <out>/404.html, and
// copies of docs/style.css and docs/CNAME. The pages carry no JavaScript and no external assets.
// A static file that is missing, a symlink, or resolves outside the repository (for example
// through a symlinked docs/) exits 1 before anything is written.
//   node scripts/build-site.mjs <out>
// Acts on the git repository at the working directory.
import { copyFileSync, existsSync, lstatSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  CatalogError,
  EXTRACTION_NOTE,
  INSTALL_INTRO,
  INSTALL_OUTRO,
  INSTALL_ROUTES,
  LEDE,
  NPX_ADD_SKILL,
  loadCatalog,
  skillGroups,
} from "./catalog.mjs";

const TITLE = "bostonaholic/skills";
const REPO_URL = "https://github.com/bostonaholic/skills";
const STATIC_FILES = ["style.css", "CNAME"];

export function escapeHtml(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function inlineHtml(text) {
  return escapeHtml(text).replace(/`([^`]+)`/g, "<code>$1</code>");
}

function page(title, stylesheet, body) {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    `  <title>${escapeHtml(title)}</title>`,
    `  <link rel="stylesheet" href="${stylesheet}">`,
    "</head>",
    "<body>",
    ...body,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

function installHtml() {
  const lines = ['<h2 id="install">Install</h2>', `<p>${inlineHtml(INSTALL_INTRO)}</p>`];
  for (const route of INSTALL_ROUTES) {
    lines.push(`<h3>${escapeHtml(route.heading)}</h3>`);
    for (const block of route.blocks) {
      lines.push(block.commands ? `<pre><code>${escapeHtml(block.commands.join("\n"))}</code></pre>` : `<p>${inlineHtml(block.text)}</p>`);
    }
  }
  lines.push(`<p>${inlineHtml(INSTALL_OUTRO)}</p>`);
  return lines;
}

function sectionHtml(skill) {
  const id = escapeHtml(skill.name);
  const usage = [`/${skill.name}`, skill.argumentHint].filter(Boolean).join(" ");
  const calls = skill.calls.map((name) => `<a href="#${escapeHtml(name)}"><code>${escapeHtml(name)}</code></a>`);
  return [
    `<section id="${id}">`,
    `  <h4><a href="#${id}">${escapeHtml(skill.displayName)}</a> <code>${id}</code></h4>`,
    `  <p>${escapeHtml(skill.summary)}.</p>`,
    `  <p class="muted">${escapeHtml(skill.description)}</p>`,
    `  <p>Usage: <code>${escapeHtml(usage)}</code></p>`,
    ...(calls.length ? [`  <p>Calls: ${calls.join(", ")}.</p>`] : []),
    `  <pre><code>${escapeHtml(NPX_ADD_SKILL.replace("<name>", skill.name))}</code></pre>`,
    `  <p><a href="${REPO_URL}/tree/main/skills/${id}">Source</a></p>`,
    "</section>",
  ];
}

function skillsHtml(catalog) {
  const lines = ['<h2 id="skills">Skills</h2>'];
  for (const group of skillGroups(catalog)) {
    lines.push(`<h3>${escapeHtml(group.heading)}</h3>`, ...group.skills.flatMap(sectionHtml));
  }
  return lines;
}

const FOOTER = `<footer><p>MIT License. Source: <a href="${REPO_URL}">github.com/bostonaholic/skills</a></p></footer>`;

export function renderIndex(catalog) {
  return page(TITLE, "style.css", [
    "<header>",
    `<h1>${escapeHtml(TITLE)}</h1>`,
    `<p>${escapeHtml(LEDE)}</p>`,
    `<p>${escapeHtml(EXTRACTION_NOTE)}</p>`,
    "</header>",
    "<main>",
    ...installHtml(),
    ...skillsHtml(catalog),
    "</main>",
    FOOTER,
  ]);
}

// The 404 page is served at any missing path, so its stylesheet link is absolute.
export function render404() {
  return page(`Page not found - ${TITLE}`, "/style.css", [
    "<header>",
    `<p><a href="/">${escapeHtml(TITLE)}</a></p>`,
    `<p>${escapeHtml(LEDE)}</p>`,
    "</header>",
    "<main>",
    "<h1>Page not found</h1>",
    '<p><a href="/">See every skill</a></p>',
    "</main>",
    FOOTER,
  ]);
}

function build(out) {
  const missing = STATIC_FILES.map((file) => join("docs", file)).filter((path) => !existsSync(path));
  if (missing.length) throw new CatalogError(`missing ${missing.join(", ")}`);
  const linked = STATIC_FILES.map((file) => join("docs", file)).filter((path) => lstatSync(path).isSymbolicLink());
  if (linked.length) throw new CatalogError(`${linked.join(", ")}: is a symlink; refusing to copy it`);
  const root = realpathSync(".");
  const outside = STATIC_FILES.map((file) => join("docs", file)).filter((path) => realpathSync(path) !== join(root, path));
  if (outside.length) throw new CatalogError(`${outside.join(", ")}: resolves outside ${root}; refusing to copy it`);
  const catalog = loadCatalog();
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "index.html"), renderIndex(catalog));
  writeFileSync(join(out, "404.html"), render404());
  for (const file of STATIC_FILES) copyFileSync(join("docs", file), join(out, file));
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  if (process.argv.length !== 3 || !process.argv[2]) {
    console.error("usage: node scripts/build-site.mjs <out>");
    process.exit(1);
  }
  try {
    build(process.argv[2]);
  } catch (error) {
    if (!(error instanceof CatalogError)) throw error;
    console.error(error.message);
    process.exit(1);
  }
}
