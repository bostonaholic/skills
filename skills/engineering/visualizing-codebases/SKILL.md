---
name: visualizing-codebases
description: Builds an interactive static D3 site that visualizes a codebase, starting with a C4 view of system context, containers, components, and code, with dependency cycles between modules and classes. Use when the user says "visualize this codebase", or asks for C4 diagrams or a map of a codebase's structure and dependency cycles. Not for prose walkthroughs; use explaining-architecture.
---

# Visualizing codebases

Model the codebase from its source, then build a static site the reader can
click through. The site shows what exists and how it depends on itself. The
build script also grades the architecture A to F from the evidence in the model.

## Views

Each view is a model you write from the code and a script that turns it into
pages. Build the C4 view unless the user names another one listed here.

| View | Shows                                                                    | Read                                                                                                                                                    |
| ---- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C4   | System context, containers, components, and code, with dependency cycles | [C4 view](references/c4-view.md), then [its model schema](references/c4-model-schema.md) and [the architecture grade](references/architecture-grade.md) |

## Rules

- **Grade, never prescribe.** The site and the reply state elements,
  dependencies, cycles, and the architecture grade as facts, with each
  criterion's value and evidence. No refactoring advice, rankings of what to
  fix, or "should". When the user asks for refactoring advice, say this skill
  stops at the map and its grade, and leave the call to them.
- **Grade from evidence.** Unless the user declines the grade, answer every
  grading question in the model with file evidence, judged against the
  codebase's own convention.
  - Report only the letter and criterion values the build script prints, and
    say the grade is a heuristic.
  - The user declines the grade by saying not to grade, such as "no grade",
    "skip the grade", or "map only". A request that does not mention the
    grade is not a decline.
  - When the user declines the grade, leave the `architecture` section out of
    the model, and say the grade was skipped.
- **Evidence for every element and edge.** Each code element is a real file,
  module, or class. Each relationship is an import, call, or configured
  connection you saw in source, build, deploy, or config files. Never infer an
  edge from a name. External systems are remote services the code calls, not
  libraries.
- **Complete imports.** A missed import hides a cycle. Prefer the language's
  own import-graph tooling or compiler output when installed; otherwise parse
  every import statement. Count only imports between the repository's own
  modules. Leave tests and generated code out unless the user asks, and say
  which kinds of imports you excluded, such as type-only or dynamic ones.

## Steps

1. Scope: the repository root, or the subtree the user names. Read the
   README, manifests, entrypoints, and deploy files (container, compose,
   infrastructure, CI) before any source.
2. Write the view's model as its reference says, with the `architecture`
   section unless the user declines the grade. Put it in `visualized/` at the
   repository root unless the user names another directory.
3. Run the view's build script with Node 18 or later (check with
   `node --version`). On exit 1, fix every error stderr names and rerun until
   exit 0.
4. When a browser tool is available, open `visualized/index.html` and every
   page it links, and read the console. The pages load D3 7.9.0 from
   cdn.jsdelivr.net, so they need a network connection. Fix what fails and
   rebuild. Without a browser tool, say the pages were not opened.
5. Report, adapting the wording:
   - The path to `visualized/index.html`, and how to open it.
   - What the view's reference says to report, without commentary on cycles.
     The grade lines the build printed are facts to copy, not commentary.
     Give them, the reason no letter was given, or the skipped sentence that
     `references/c4-view.md` Report gives.
   - What the model leaves out and why: excluded imports, tests, generated
     code, or parts that could not be traced.
