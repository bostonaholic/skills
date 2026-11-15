---
name: scripting-the-work
description: Builds a codemod, script, generator, query, or check that does or proves non-trivial work, so a reviewer reruns it instead of trusting hand edits. Use when the user explicitly asks to script the work, write a codemod, or make a change rerunnable. Never infer from a small edit. Not for a skill's own steps; use choosing-determinism.
disable-model-invocation: true
---

# Script the Work

When the work is not trivial, build the tool that does it or proves it
instead of doing it by hand. A reviewer can read and rerun a script; hand
edits can only be checked by redoing them.

Skip the tool only when the task is a few obvious edits visible at a glance.
The bar is triviality, not repetition: a one-off still earns a tool when the
tool is what makes the work checkable.

1. **Do the first unit by hand** to learn the recipe.
2. **Build the smallest tool that does or proves the job**, never a
   framework:
   - a codemod or script for edits
   - a generator for repetitive files
   - a query over dumped data, such as a SQLite table, for analysis
   - a rerunnable check for verification
3. **Prove the tool.** Run it on the hand-done unit and diff the result
   against the hand version. Fix the tool until the diff is empty.
4. **Make it safe to rerun.** A second run over finished units changes
   nothing.
5. **Run it on every unit yourself.** When the tool handles every unit in one
   pass, do not start subagents to hand-apply what it does.
6. **When the work must go to subagents,** write the recipe as a skill they
   all read: the steps, the check each result must pass, and the files they
   must not touch. Keep that skill outside their write scope, so none can
   edit the contract.
7. **Commit the tool** when the work outlives the session.

Applying this skill produces a file. If the diff holds no script, codemod,
generator, check, or subagent skill, the skill was not applied.

## Report

Reply with the tool's path, the command that reruns it, the result of the
hand-versus-tool diff, and the units it changed.
