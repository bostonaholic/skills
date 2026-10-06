---
name: reviewing-design-docs
description: 'Use for reviewing technical designs with fresh context.'
effort: high
argument-hint: "[<design-doc-path>]"
---

Before review dispatch, resolve the absolute path of the [design reviewer brief](references/design-reviewer.md) in this skill directory and supply it with the resource paths below.
Pass the applicable resource paths and require reads before work.
If a required resource is missing, stop and report its resolved path; never use checkout fallback or recursive loading.

# Engineering Design Doc Review
Before dispatch, resolve [independent review](shared/independent-review.md), [verified results](shared/verified-results.md), [focused work](shared/focused-work.md). Pass their absolute installed paths with the retained brief. The receiver reads them before work.
Before each consuming step, read its linked shared rules from this installed skill directory; if a required read fails, stop that step with the exact path. Never use checkout fallback or recursive loading.

Adversarially review a design document with fresh context.

Write the prose this skill governs at a seventh-grade reading level, in
STE-flavored mode. Before you finalize it, read the
[writing standards](shared/writing.md) and apply its `## Self-lint` checklist.

## Input

`$ARGUMENTS` is the path to one design document. When it is empty, names a directory, or names no readable file, fire `AskUserQuestion` with a `Setup` header asking for the file path. Never guess.

## Execution

1. Use the document resolved in `## Input`.
2. **Dispatch the review.** Read the [design reviewer brief](references/design-reviewer.md) `## Review brief`. On Claude Code, call the `Agent` tool with `subagent_type: Explore` and `model: opus`. On a host without `Explore`, spawn the host's general-purpose subagent with the brief as its role instructions, grant it read and search tools only, and state that restriction in its prompt. Substitute the document's absolute path for `$ARGUMENTS`. Pass the absolute path of this skill's directory as the base of the brief's links, and the absolute paths of `references/design-template.md`, `shared/findings.md`, `shared/code-standards.md`, `shared/decisions.md`, `shared/writing.md`, and the three principles. Do not define or reference a project agent. If the host cannot spawn a subagent, report the dispatch failure and stop.
3. **Present the verdict in full.** Relay the subagent's report verbatim —
   the subagent's output is not shown to the user directly.
   When the reviewer ran as a restricted general-purpose subagent, add one line after the report: the read-only guarantee rests on the prompt, not the host.
4. **Do not auto-revise.** On REQUEST CHANGES, surface the findings and let the user decide how to revise the design.

## Rules

- This skill is **read-only, structurally for writes** on Claude Code: the `Explore` subagent holds no Write/Edit tools, so it cannot change the design document. Residual tools (a `Bash` grant included, when the host's `Explore` type carries one) are governed by the brief's read-only instruction, and that residual is accepted. On other hosts the read-only rule rests on the tool grant and the prompt, and the report says so. The skill itself writes no artifacts.

Print the verdict and the count of issue / suggestion / nitpick findings.
