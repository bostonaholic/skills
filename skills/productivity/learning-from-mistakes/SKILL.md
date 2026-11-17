---
name: learning-from-mistakes
description: Codifies the latest correction or mistake in the conversation as a fix in the skill or plugin whose workflow went wrong, or else as a short imperative rule in the project or global CLAUDE.md or AGENTS.md, and, for a project lesson, proposes the highest check that makes the mistake impossible, after the user approves. Use when the user says "learn from this mistake", or when the user asks to learn from a mistake, remember a lesson for next time, add a rule to CLAUDE.md, make a mistake impossible, or not repeat a behavior. Not for a whole session; use reflecting.
---

# Learn From Mistake

Turn the most recent mistake or correction in the conversation into a durable
fix the agent reads next time, so the lesson persists across sessions. If no
correction is clear, ask which one to codify.

- **Owning workflow first**: when the mistake happened while following a
  skill, plugin, or other packaged workflow, or because one did not load,
  read that workflow's source before choosing a target. The fix goes there:
  the missing step, the wrong default, or the trigger that should have
  matched. An installed or cached copy is not the source; edit the checkout
  its manifest or README names, or, when none is reachable, show the change
  against the installed path and ask where its source lives. An instructions
  file gets the lesson only when no workflow owns it, never as a duplicate of
  the workflow fix.
- **The rule**: one or two imperative sentences ("Do X", "Never Y"), specific
  enough to change behavior. A platitude ("be careful with tests") fails.
- **Target file**, for a lesson no workflow owns: choose the scope, `project`
  for a lesson about this codebase, its conventions or tooling, or `global`
  for one that applies across projects, then run
  `scripts/resolve-instructions-file.sh <claude|codex> <project|global>` with
  `claude` in Claude Code and `codex` in Codex. Exit 0 prints the file to edit.
  On exit 2 (no repository) or 69 (no git), ask where to write. In another
  host, or on exit 3, ask which file it reads. On exit 4, report the loop.
  Exit 1 is a usage error: fix the arguments and rerun.
- **Enforcement**: nothing fails when an agent skips a rule. For a project
  lesson about the repository's code or tooling, also propose the highest
  level that stops the mistake: architecture (one owner, one supported way,
  delete the old way), then types, then a lint or CI check whose error names
  what to use instead, then a test. If the pattern is already common, fail only
  when a change adds more. Prove the check fails on the real mistake. End the
  rule with `Enforced by <check>.`; with no check, say why each level fails.
- **Overlap**: if the rule exists and a check already catches the mistake,
  stop and name its file and section. If it exists with nothing enforcing it,
  the mistake is a repeat: propose the check instead of a second rule. If a
  related rule exists, refine it instead of adding a duplicate.
- **Approval**: show the rule (or the old and new text of a refined rule or
  workflow step), the file path, and the section: an existing section that
  fits, or else, in an instructions file, a new `## Learned Rules` section.
  Never propose any other new heading. Show any proposed check as its files
  and the command that proves it fails. Write nothing until the user
  approves.
