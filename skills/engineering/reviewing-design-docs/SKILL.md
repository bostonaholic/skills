---
name: reviewing-design-docs
description: 'Reviews a technical design document or RFC adversarially in a fresh-context read-only subagent (coverage, decisions, edge cases, consistency, risks, citations, scope) and returns findings with a verdict. Use when asked to review a design doc, RFC, or technical design. Not for code diffs; use reviewing-code.'
effort: high
argument-hint: "[<design-doc-path-or-url>]"
---

# Engineering Design Doc Review

Read each linked file from this skill's directory when the step that uses it begins. If a read fails, stop that step and report the exact path.

## Input

`$ARGUMENTS` is the path to one design document. When it is a URL, or the
user pasted the document into the conversation, fetch it with the host's
document or web tools (or take the pasted text), save it as Markdown in a
scratch file outside the repository, and review that path. When a fetch
fails, report the URL and the error. When the argument is empty, names a
directory, or names no readable file, ask for the file path with
`AskUserQuestion` under a `Setup` header where the host has it; otherwise ask
in chat and wait. Never guess.

## Steps

This session holds the author's conversation, so it is not a valid reviewer
([independent review rules](shared/independent-review.md)). Never review
inline. Step 2 is delegated under the
[step delegation rules](shared/step-delegation.md), with the dispatch
contract below; steps 1, 3, 4, and 5 stay in this session.

1. **Load the brief.** Read the
   [design reviewer brief](references/design-reviewer.md).
2. **Dispatch.** Pass the brief's
   [Review brief](references/design-reviewer.md#review-brief) section as the
   prompt, with the document's absolute path in place of `$ARGUMENTS`. On
   Claude Code, call the `Agent` tool with `subagent_type: Explore` and
   `model: opus`. On a host without `Explore`, spawn the host's
   general-purpose subagent with read and search tools only, and state that
   restriction in its prompt. If the host cannot spawn a subagent, report
   the dispatch failure and stop.

   Pass the absolute path of this skill's directory and of each file the
   reviewer reads before work; this session does not read them:
   [design template](references/design-template.md),
   [finding format](shared/findings.md),
   [code standards](shared/code-standards.md),
   [decision-record rules](shared/decisions.md),
   [writing standards](shared/writing.md),
   [focused work rules](shared/focused-work.md),
   [verified results rules](shared/verified-results.md), and the
   independent review rules above.

3. **Validate the verdict.** The report's first line must be exactly one of
   `**Verdict: APPROVE**`, `**Verdict: REQUEST CHANGES**`, or
   `**Verdict: COMMENT**`. When it is missing or holds another token,
   dispatch one new reviewer with the same inputs and name the failed
   contract. When the second report also fails, print it, name the failure,
   and stop. Never repair a verdict yourself.
4. **Relay.** Print the report verbatim; the user does not see subagent
   output. When the reviewer ran as a restricted general-purpose subagent,
   add one line after the report: the read-only guarantee rests on the
   prompt, not the host.
5. **Do not revise the document.** On REQUEST CHANGES, the user decides how
   to revise it.

The skill writes no files beyond that scratch copy. On Claude Code the `Explore` subagent holds no
Write or Edit tool, so it cannot change the document; the brief forbids any
shell it may hold.
