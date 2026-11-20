# C4 view

The C4 view draws the codebase at the four C4 levels: system context,
containers, components, and code. It builds an overview page and one page per
level, and finds the dependency cycles at the container, component, and code
levels.

## Model

1. Context: the system, the people or roles who use it, and the external
   systems it calls or is called by, from docs, config, SDK dependencies, and
   outbound calls.
2. Containers: each separately deployed or run unit, such as an app, service,
   worker, CLI, database, or queue the system owns. A store run by someone
   else is an external system. A library repository with one deployable is one
   container.
3. Components: the major groupings inside each container, usually top-level
   packages, namespaces, or feature directories. Every code element belongs to
   exactly one component. A file's same-named directory that holds only types
   split out of it, such as its error classes, stays in that file's component,
   so splitting a file never creates a component.
4. Code: one element per module or file; use classes when the language keeps
   one class per file or the user asks. Keep the code level under 2,000
   elements, since the browser layout slows past that: model at file level, or
   build one site per container. Then collect every internal import as a
   relationship.
5. Record each relationship between the most specific elements it joins: code
   to code for an import, code to an external system for an API call. The
   build script rolls every relationship up to each coarser level, so never
   add the rolled-up copies yourself.
6. Write `visualized/c4-model.json` as the
   [C4 model schema](references/c4-model-schema.md) describes. Add the
   `architecture` section that
   [the architecture grade](references/architecture-grade.md) describes,
   unless the user declines the grade.

## Build

Run `node <skill-dir>/scripts/build-c4-site.mjs visualized/c4-model.json visualized`.
stdout names `index.html`, then lists each cycle at the container, component,
and code levels as a path of element ids. Then it prints the grade lines in
the shapes that the architecture grade reference gives.

## Report

- Counts per level: people, external systems, containers, components, code
  elements, and relationships.
- The cycles stdout listed, per level, as paths of element names.
- The grade lines stdout printed, copied as printed, or the reason it gave
  no letter.
- Each question answered no, with its evidence.
- A note that the grade is a heuristic.
- When the user declined the grade, write "The architecture grade was skipped
  because you asked for no grade." in place of the grade lines.
