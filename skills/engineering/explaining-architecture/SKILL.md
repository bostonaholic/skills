---
name: explaining-architecture
description: Explains how a subsystem, feature flow, or runtime path works (architecture, data flow, file map, gotchas), with an optional critique by fresh-context critics. Read-only. Use when asked how a subsystem or flow works or where logic belongs. Not for why code is shaped as it is; use investigating-design-rationale. Not for explaining a PR or diff; use explaining-code.
effort: medium
argument-hint: "[<subsystem, feature, or question>]"
---

# How — Architectural Explanation

Answer "how does X work?" with the mental model a senior engineer needs to
start working in an unfamiliar subsystem: its architecture, flow, and sharp
edges, not annotated source code.

When the question is about motivation, rejected alternatives, or history rather
than mechanics, call the Skill tool with `investigating-design-rationale`
instead. If that skill is not installed, say so and answer the mechanics only.

This skill is **read-only**: it writes no files, records no artifacts, and
changes no state, in this session and in every subagent it dispatches.

## Input

`$ARGUMENTS` is the question: a subsystem, a feature flow, or a placement
question ("where should this validation live").

- **Given**: parse the target and scope directly from the argument.
- **Empty or vague**: infer the target from conversation context (open files,
  recent edits, what was just discussed). **State your interpretation in one
  line before exploring.** Do not ask first.

## Modes

- **Explain** (default): follow [explain mode](references/explain-mode.md),
  then write the answer in the [output format](references/output-format.md).
- **Critique**: selected when the request asks for problems, issues, or
  improvements. Run Explain in full, then follow
  [critique mode](references/critique-mode.md). Read that file only in
  Critique mode.

Read each linked file from this skill's directory when the step that uses it
begins. If a read fails, stop that step and report the exact path.

## Applied principles

- Before dispatching explorers, read [focused work rules](shared/focused-work.md).
- Before dispatching critics, read
  [independent review rules](shared/independent-review.md).
- Before writing the answer, read
  [verified results rules](shared/verified-results.md).
