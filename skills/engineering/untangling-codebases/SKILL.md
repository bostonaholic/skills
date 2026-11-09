---
name: untangling-codebases
description: 'Refactors a whole codebase in one pass so each change lands in one place: catalogs hidden links, needless links, surplus code, and special cases, redesigns to remove their shared causes, and repeats until nothing worth fixing is left. Use when the user says "untangle this codebase", or when asked to refactor a whole codebase so changes land in one place. Never infer from a bug fix or feature request. Not for one new requirement; use redesigning-from-first-principles.'
argument-hint: "[<area or concern to focus on>]"
---

# Untangle a Codebase

Refactor the whole codebase, or the area the user names, and finish. Treat
it as a goal, not a list of suggestions. Behavior stays the same.

The aim is code where an agent reads little per change, a change lands in
one place, and a break shows up instead of hiding.

The test for every finding: should these pieces change together? Pieces
that must change together but look apart are a hidden link. Pieces that look
together but need not change together are a needless link.

1. **Ask about the extras.** Offer two optional passes and wait for the
   answer, then do only the chosen ones:
   - **Comments:** delete comments that restate the code.
   - **Tests:** delete tests that cannot catch a real bug, and rewrite tests
     coupled to internals to test behavior.
2. **List every problem before changing anything.** Read the code and git
   history (files that change in the same commits are linked). Record each
   problem with `path:line`:
   - **Hidden links:** copied logic or constants, state read from globals or
     files written elsewhere, one feature split across folders by layer,
     call-order rules nothing enforces.
   - **Needless links:** callers that reach into internals, stable code
     importing volatile code, general functions with parameters for one
     workflow, shallow modules whose interface is as big as their body.
   - **Surplus:** pass-through wrappers, config or extension points with one
     use, dead code.
   - **Special cases:** a branch for one value, a parameter for one caller,
     a swallowed exception, a retry or sleep, a skipped test. Read each as a
     requirement the design is missing.
3. **Redesign from the causes.** Group problems that share a cause and find
   the one change that removes the group. Never patch special cases one at a
   time. Write a decision log: each fix, then the problems it removes, as in
   [the example](references/decision-log-example.md).
4. **Fix everything on the list.** Apply the fixes in the log, then delete
   the special cases the redesign made unnecessary. Run the project's checks
   after each fix and keep them passing. For Comments, also delete comments
   that worked around a problem the redesign removed; keep comments about
   facts outside the code. Do Tests last.
5. **Check and repeat.** Start subagents with fresh context, never a fork of
   this conversation, each looking for one kind of problem from step 2 in the
   changed code. Fix what they find and check again. Stop when a new pass
   finds nothing worth fixing.

Done when few special cases remain, a typical change touches one place,
imports point from volatile code to stable code, and the full test suite
passes with behavior unchanged.

## Tips

- Map before reading: script a dependency graph from imports, and have
  fresh-context subagents summarize large areas.
- Start where one fix removes the most problems.
- Read a skeleton first: signatures and types without bodies show the
  shape faster than the full code.

## Report

Reply with the decision log, what each pass found, the checks you ran with
their results, and any problem you left with why.
