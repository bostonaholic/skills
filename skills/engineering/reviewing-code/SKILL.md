---
name: reviewing-code
description: 'Reviews a code diff (PR, branch, commit range, or working tree) in a fresh-context read-only subagent and returns Conventional Comments findings with an APPROVE, REQUEST CHANGES, or COMMENT verdict. Use when asked to review code, a diff, or a PR. Not for design docs; use reviewing-design-docs.'
effort: high
argument-hint: "[<diff target>]"
---

# Code Review

Read each linked file from this skill's directory when the step that uses it begins. If a read fails, stop that step and report the exact path.

## Input

`$ARGUMENTS` names the diff: a PR number or URL, a branch, a commit range,
or a path. With no argument, the target is the working tree's diff against
the base branch. Resolve it once into a concrete target (the base and head
refs, or the paths) and pass that target to the reviewer. Never ask the user
to restate it.

## Steps

This session holds conversation history, so it is not a valid reviewer
([independent review rules](shared/independent-review.md)). Never review
inline. Step 2 is delegated under the
[step delegation rules](shared/step-delegation.md), with the dispatch
contract below; steps 1, 3, and 4 stay in this session.

1. **Load the brief.** Read the [code reviewer brief](references/code-reviewer.md),
   including its [report format](references/code-reviewer.md#report-format).
2. **Dispatch.** Run the reviewer in a fresh-context subagent that holds no
   file-editing tool. On Claude Code, call the `Agent` tool with
   `subagent_type: Explore` and `model: opus`. On a host without `Explore`,
   spawn the host's general-purpose subagent with the brief as its role
   instructions. Grant it read and search tools and a shell, and state in
   its prompt that the shell runs only the project's test command and
   read-only commands (`git diff`, `git log`, `git show`, `git blame`),
   never a command that changes tracked files, the index, refs, or remote
   state. When the host cannot give it a
   shell, grant read and search only and say so in its prompt. If the host
   cannot spawn a subagent, stop and report it.

   Pass the resolved target, the absolute path of this skill's directory,
   and the absolute paths of the brief and of each file it links. The
   reviewer reads these before work; this session does not:
   [code standards](shared/code-standards.md),
   [finding format](shared/findings.md),
   [focused work rules](shared/focused-work.md),
   [testing rules](shared/testing.md),
   [verified results rules](shared/verified-results.md), and
   [writing standards](shared/writing.md), plus the independent review rules
   above.

3. **Validate the verdict.** The report's first line must be a
   `**Verdict: ...**` line whose word token is exactly one of `APPROVE`,
   `REQUEST CHANGES`, or `COMMENT`, as in `**Verdict: ✅ APPROVE**`. Match
   the word, not the emoji. When it is missing or holds another token,
   dispatch one new reviewer with the same inputs and name the failed
   contract. When the second report also fails, print it, name the failure,
   and stop. Never repair a verdict yourself.
4. **Relay.** Print the report in full, as the report format requires, and
   name any heading deviation on its own line. When the reviewer ran as a
   restricted general-purpose subagent, add one line after the report: the
   read-only guarantee rests on the prompt, not the host.
