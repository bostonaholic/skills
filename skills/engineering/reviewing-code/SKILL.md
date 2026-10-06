---
name: reviewing-code
description: 'Use for reviewing code diffs with fresh context.'
effort: high
argument-hint: "[<diff target>]"
---

# Code Review

## Input

`$ARGUMENTS` names the diff — a PR number or URL, a branch, a commit range,
or a path. With no argument, review the working tree's diff against the base
branch. Resolve it once and pass the resolved target to the reviewer; never
ask the user to restate it.

## When Invoked Directly

The main session holds the conversation history `code-reviewer.md` forbids, so
it is not a valid reviewer. Do not review inline. Run these in order:

1. **Load the format.** Read [code reviewer brief](references/code-reviewer.md) and
   its `## Report Format`.
2. **Dispatch.** Run the reviewer in a fresh-context subagent that holds no
   file-editing tool. On Claude Code, call the `Agent` tool with
   `subagent_type: Explore` and `model: opus`. On a host without `Explore`,
   spawn the host's general-purpose subagent with the brief as its role
   instructions. Grant it read and search tools and a shell, and state in its
   prompt that the shell runs only the project's test command and read-only
   commands (`git diff`, `git log`, `git show`, `git blame`), never a command
   that changes tracked files, the index, refs, or remote state. When the host
   cannot give that subagent a shell, grant read and search only and say so in
   its prompt. Pass the resolved target, the `## Report Format` requirement,
   the absolute path of this skill's directory as the base of the brief's
   links, and the absolute installed paths of the
   [code reviewer brief](references/code-reviewer.md) and of every `shared/`
   file it links (`code-standards.md`, `findings.md`, `focused-work.md`,
   `independent-review.md`, `testing.md`, `verified-results.md`,
   `writing.md`). Instruct it to read them before work. If the host cannot
   spawn a subagent, stop and report it. Never review inline.
3. **Relay.** Print what the reviewer returned. `## Report Format` states
   what a relay owes, and what to do with a report that does not match it.
   When the reviewer ran as a restricted general-purpose subagent, add one
   line after the report: the read-only guarantee rests on the prompt, not
   the host.
