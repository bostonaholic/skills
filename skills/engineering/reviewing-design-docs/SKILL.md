---
name: reviewing-design-docs
description: 'Reviews a technical design document or RFC adversarially in a fresh-context read-only subagent (coverage, decisions, edge cases, consistency, risks, citations, scope) and returns findings with a verdict. Use when asked to review a design doc, RFC, or technical design. Not for code diffs; use reviewing-code.'
effort: high
argument-hint: "[<design-doc-path-or-url>]"
---

# Engineering Design Doc Review

## Input

`$ARGUMENTS` is the path to one design document. When it is a URL or pasted
text, save it as Markdown in a scratch file outside the repository and
review that path; when a fetch fails, report the URL and the error. When the
argument is empty, names a directory, or names no readable file, ask for the
path and wait. Never guess.

## Reviewer

This session holds the author's conversation, so it cannot review the
document ([independent review rules](shared/independent-review.md)). Run the
[design reviewer brief](references/design-reviewer.md) in a fresh-context
subagent with read and search tools only, giving it the document's absolute
path and the paths of the files the brief links:
[design template](references/design-template.md),
[finding format](shared/findings.md), and
[decision-record rules](shared/decisions.md). Pass no author discussion. If
no such subagent can run, stop and say so. Never review inline.

## Verdict and relay

The report's first line must be exactly `**Verdict: APPROVE**`,
`**Verdict: REQUEST CHANGES**`, or `**Verdict: COMMENT**`. When it is
missing or wrong, run one new reviewer with the same inputs and name the
failed contract. When the second report also fails, print it, name the
failure, and stop. Never repair a verdict yourself.

Print the report verbatim. When the read-only restriction rested on the
reviewer's prompt rather than its tool grants, say so in one line after the
report. Do not revise the document; on REQUEST CHANGES the user decides how.
Write no file beyond the scratch copy.
