---
name: explaining-code
description: Explains code or code changes in plain language, briefly by default or in full for a reviewer. Use when asked to explain, ELIE, summarize, or break down a PR, diff, branch, file, function, or concept for someone new to the code. Not for how a whole subsystem works; use explaining-architecture.
argument-hint: "[elie] <PR, file, function, branch, or concept>"
---

# Explaining code

Explain a specific change or piece of code to a reader new to it, at one of
two depths.

When the question is how a whole subsystem works (its architecture, data flow,
and file map), call the Skill tool with `explaining-architecture` instead. If
that skill is not installed, explain at the chosen depth, scoped to the
question.

## Input

`$ARGUMENTS` is an optional depth token followed by the subject: a PR number or
URL, a file path, a function or class name, a branch name, or a concept.

**STOP** when the request names no subject and the conversation makes none
clear. Ask once what to explain, and do no work until the user answers.

## Depth

- **Brief** (the default): follow the Brief section below.
- **Full** (ELIE): selected by a leading `elie` or `eliet` token, or by a
  request for ELIE, an explanation "for an engineer" or "for a reviewer", an
  "in depth" explanation, or the full explanation. Read
  [full explanation](references/full-explanation.md) and follow it instead of
  the Brief section.

Drop the depth token before reading the subject.

## Brief

Lead with a one-sentence summary that a developer with no context on this area
understands. Use concrete nouns ("the order history page", "the login screen"),
not abstract ones ("the component", "the module"). Use an everyday analogy only
when one fits naturally.

Follow with 3 to 6 sentences that answer the implicit follow-ups: what the
situation was before, what changed, and why. The whole Brief reply is the lead
plus those sentences, at most seven sentences in one or two paragraphs, with no
headings, bold labels, or bullet lists. Count the sentences before replying.
Write more only on request. Spell out and define an unavoidable term or acronym
inline at its first use, as in "the SLA (service-level agreement) checker".

Cover what and why, not how. Leave out the tests, reviewer notes, risks, edge
cases, and implementation detail such as algorithms, comparisons, headers,
status codes, and function names; those belong to Full. If they would help, end
with one line offering the full explanation. Summarize the effect instead of
listing every file touched. Match the scope of the explanation to the question:
asked about one function, explain that function, not the whole system.

Fit the sentence order to the subject. A PR's sentences run before, then
after; a concept may be one paragraph; and a module overview may name its
responsibilities in prose. An illustrative Brief explanation of a PR:

> The search page now remembers recent results for one minute, so repeat
> searches load instantly. Before, every search queried the database, even
> when the same query ran seconds earlier. Now a results cache (a short-lived
> in-memory copy of recent answers) is checked first, and the database is
> queried only on a miss. Results can be up to a minute stale, which the PR
> accepts because listings change rarely.
