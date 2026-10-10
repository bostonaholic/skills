---
name: explaining-architecture
description: Explains how a subsystem, feature flow, or runtime path works by reading the code, then answering with an overview, the step-by-step flow, a Where Things Live file map, and gotchas, every claim cited to file:line, which an answer from a few inline reads lacks. Optional critique by fresh-context critics. Use when asked how a subsystem or flow works or to walk through one, even one narrow path across a few files, such as how a failure is retried and when it gives up or how an event reaches a consumer, or where logic belongs. Not for why code is shaped as it is; use investigating-design-rationale. Not for explaining a PR or diff; use explaining-code.
effort: medium
argument-hint: "[<subsystem, feature, or question>]"
---

# Explaining architecture

Answer "how does X work?" with the mental model a senior engineer needs to
start working in an unfamiliar subsystem: its architecture, flow, and sharp
edges, not annotated source code.

When the question is about motivation, rejected alternatives, or history
rather than mechanics, call the Skill tool with
`investigating-design-rationale` instead. If that skill is not installed, say
so and answer the mechanics only.

The skill is read-only: it writes no files and changes no state.

## Input

`$ARGUMENTS` is a subsystem, a feature flow, or a placement question ("where
should this validation live"). When it is empty or vague, infer the target
from conversation context and state your interpretation in one line before
exploring. Do not ask first.

## Explain

Read the implementation; never infer behavior from file or function names.
Trace each flow from trigger to effect. Where you cannot trace a link, say so
instead of inventing it. Every claim about code carries `file:line`, and a
flow step names the function that runs it. That includes the opening summary,
constants, derived figures (cite the inputs), and claims that something is
absent or never called (cite where you looked). Only Where Things Live entries
may give a path without a line. Before sending, reread each sentence that says
what the code does; cite it or cut it.

Adapt the answer to the question; use only the sections it needs, each under
its name as a `##` heading, such as `## Where Things Live`:

- **Overview**: what it is, what it does, why it exists, in a paragraph or
  two.
- **Key Concepts**: the abstractions needed to follow the rest.
- **How It Works**: trigger, steps, data movement, decision points, in prose.
  Add a mermaid diagram only when the flow crosses several components.
- **Where Things Live**: the file map someone needs to start, not every file.
- **Gotchas**: surprising behavior, historical residue, sharp edges.

When something is complex, explain why. Leave out how you explored,
background the question did not raise, and restatement.

## Critique

Run only when the request asks for problems, issues, or improvements. Finish
the explanation first, then follow [critique mode](references/critique-mode.md).
