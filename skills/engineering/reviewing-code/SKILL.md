---
name: reviewing-code
description: 'Reviews a code diff (PR, branch, commit range, or working tree) in a fresh-context read-only subagent and returns Conventional Comments findings with an APPROVE, REQUEST CHANGES, or COMMENT verdict. Use when asked to review code, a diff, or a PR. Not for design docs; use reviewing-design-docs.'
effort: high
argument-hint: "[<diff target>]"
---

# Code Review

## Target

`$ARGUMENTS` names the diff: a PR number or URL, a branch, a commit range, or
a path. With no argument, the target is the working tree's diff against the
base branch. Resolve it once into concrete base and head refs (or paths) and
hand that to the reviewer. Never ask the user to restate it.

## Reviewer

This session holds the author's conversation, so it cannot review the work
([independent review rules](shared/independent-review.md)). Run the
[code reviewer brief](references/code-reviewer.md) in a fresh-context
subagent that holds no file-editing tool, and give it only the resolved
target and the paths of the brief and the files it links:
[finding format](shared/findings.md),
[testing rules](shared/testing.md), and
[code standards](shared/code-standards.md). If it has a shell, it runs only
the project's test command and read-only git commands. If no such subagent
can run, stop and say so. Never review inline.

External reviewers may reuse findings after later commits. Before reporting a
reused finding as current, ask a fresh read-only verifier to check its
behavioral claim against the resolved head. Supply the claim and cited paths
without the previous verdict or producer explanation. An older permalink alone
does not prove the concern is fixed. Report verification separately; never use
a cached verdict to approve newer commits or rewrite the original verdict.

## Verdict and relay

The report's first line must be a `**Verdict: ...**` line whose word is
exactly `APPROVE`, `REQUEST CHANGES`, or `COMMENT` (match the word, not the
emoji). When it is missing or wrong, run one new reviewer with the same
inputs and name the failed contract. When the second report also fails,
print it, name the failure, and stop. Never repair a verdict yourself.

Print the report in full. Name any heading deviation on its own line. When
the read-only restriction rested on the reviewer's prompt rather than its
tool grants, say so in one line after the report.
