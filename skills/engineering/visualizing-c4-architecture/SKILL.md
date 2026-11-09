---
name: visualizing-c4-architecture
description: Maps a codebase to the four C4 levels (system context, containers, components, code) and builds an interactive static D3 site, one page per level, that shows dependency cycles between modules and classes. Use when the user says "visualize the architecture", or asks for C4 diagrams or a map of a codebase's structure and dependency cycles. Not for prose walkthroughs; use explaining-architecture.
---

# Visualizing C4 architecture

Model the codebase at every C4 level, then build a static site: a landing page
and one interactive page per level. The site shows what exists and where the
dependency cycles are. Judging them is the reader's job.

## Rules

- **Describe, never prescribe.** The site and the reply state elements,
  dependencies, and cycles as facts. No refactoring advice, severity, smells,
  rankings of what to fix, or "should". When the user asks for refactoring
  advice, say this skill stops at the map and leave the call to them.
- **Evidence for every element and edge.** Each code element is a real file,
  module, or class. Each relationship is an import, call, or configured
  connection you saw in source, build, deploy, or config files. Never infer an
  edge from a name. External systems are remote services the code calls, not
  libraries.
- **Record at the finest level known.** Write each relationship between the
  most specific elements it joins: code to code for an import, code to an
  external system for an API call. The build script rolls every relationship
  up to each coarser level, so never add the rolled-up copies yourself.
- **Complete imports.** A missed import hides a cycle. Prefer the language's
  own import-graph tooling or compiler output when installed; otherwise parse
  every import statement. Count only imports between the repository's own
  modules. Leave tests and generated code out unless the user asks, and say
  which kinds of imports you excluded, such as type-only or dynamic ones.

## Steps

1. Scope: the repository root, or the subtree the user names. Read the
   README, manifests, entrypoints, and deploy files (container, compose,
   infrastructure, CI) before any source.
2. Context: the system, the people or roles who use it, and the external
   systems it calls or is called by, from docs, config, SDK dependencies,
   and outbound calls.
3. Containers: each separately deployed or run unit, such as an app,
   service, worker, CLI, database, or queue the system owns. A store run by
   someone else is an external system. A library repository with one
   deployable is one container.
4. Components: the major groupings inside each container, usually top-level
   packages, namespaces, or feature directories. Every code element belongs to
   exactly one component.
5. Code: one element per module or file; use classes when the language keeps
   one class per file or the user asks. Keep the code level under 2,000
   elements, since the browser layout slows past that: model at file level, or
   build one site per container. Then collect every internal import as a
   relationship.
6. Write `c4-model.json` as
   [the model schema](references/model-schema.md) describes. Put it in `c4/`
   at the repository root unless the user names another directory.
7. Run `node <skill-dir>/scripts/build-c4-site.mjs c4/c4-model.json c4`
   (Node 18 or later; check with `node --version`). On exit 1, fix every
   error stderr names and rerun until exit 0. stdout names `index.html` and
   lists each cycle at the container, component, and code levels.
8. When a browser tool is available, open `c4/index.html` and each level
   page, and read the console. The pages load D3 7.9.0 from cdn.jsdelivr.net,
   so they need a network connection. Fix what fails and rebuild. Without a
   browser tool, say the pages were not opened.
9. Report, adapting the wording:
   - The path to `c4/index.html`, and how to open it.
   - Counts per level: people, external systems, containers, components, code
     elements, and relationships.
   - The cycles stdout listed, per level, as paths of element names. No
     commentary on them.
   - What the model leaves out and why: excluded imports, tests, generated
     code, or parts that could not be traced.
