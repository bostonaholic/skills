---
name: reviewing-code
description: 'Reviews a diff (PR, branch, commit range, or working tree) in a fresh-context read-only subagent for Conventional Comments findings and an APPROVE, REQUEST CHANGES, or COMMENT verdict, posted to the PR. Use when asked to review code, a diff, or a PR. Not for design docs; use reviewing-design-docs.'
effort: high
argument-hint: "[<diff target>]"
---

# Code Review

## Target

`$ARGUMENTS` names the diff: a PR number or URL, a branch, a commit range, or
a path. With no argument, the target is the working tree's diff against the
base branch. Resolve it once into a concrete target and hand that to the
reviewer. Never ask the user to restate it.

- A PR number or URL resolves through
  [posting reviews](references/posting-reviews.md) into the SHA pair
  `<base-sha>...<head-sha>`, the PR state, and the at-head flag. When that
  fails, print `Stopped before review: <reason>.` and stop before the
  reviewer runs. An argument of digits only is a PR number.
- A branch goes through the same lookup and that reference's branch gate. A
  branch whose local tip is its open PR's head resolves as a PR number does.
  Any other branch resolves into base and head refs and is reviewed without
  a post.
- A commit range, a path, or no argument resolves into base and head refs
  (or paths) and never posts.

## Reviewer

This session holds the author's conversation, so it cannot review the work
([independent review rules](shared/independent-review.md)). Run the
[code reviewer brief](references/code-reviewer.md) in a fresh-context
subagent that holds no file-editing tool, and give it only the resolved
target (the SHA pair for a PR) and the paths of the brief and the files it
links: [finding format](shared/findings.md),
[testing rules](shared/testing.md),
[code standards](shared/code-standards.md), and
[external text rules](shared/external-data.md). If it has a shell, it runs
only the project's test command and read-only git commands (`git diff`,
`git log`, `git show`, `git blame`, `git grep`). If no such subagent can
run, stop and say so. Never review inline. Record whether the reviewer got
a shell; posting reads it.

For a PR target with a shell and the at-head flag no, the prompt says "the
checkout is not at the PR head" or "the checkout has uncommitted or
untracked changes", whichever applies. It says the read and search tools
show the checkout, not the head, so the reviewer reads head files with
`git show <head-sha>:<path>`, searches with
`git grep -n <pattern> <head-sha>`, and cites head lines. It restates that
a blocking finding still makes the verdict REQUEST CHANGES. A prompt with
no shell carries no off-head text.

## Verdict and relay

The report's first line must be a `**Verdict: ...**` line whose word is
exactly `APPROVE`, `REQUEST CHANGES`, or `COMMENT` (match the word, not the
emoji; only ✅, ❌, or 💬 may come before it). When it is missing or wrong,
run one new reviewer with the same inputs and name the failed contract.
When the second report also fails, print it, name the failure, and stop;
for a PR target, also print
`Not posted: the report failed the verdict contract.` Never repair a
verdict yourself.

Print the report in full. Name any heading deviation on its own line. When
the read-only restriction rested on the reviewer's prompt rather than its
tool grants, say so in one line after the report.

## Post

Invoking this skill on a PR target is the request to post the review on
that PR, so never ask first. This step writes PR state, so it runs in this
session. Post only when the target is a PR that was `OPEN` at Input and the
reviewer got a shell. Otherwise print the first applicable `Not posted:`
line from the session lines in
[posting reviews](references/posting-reviews.md) and stop.

To post, run that reference's tool check. Write the report alone (from its
verdict line to its last line, as printed, without the heading-deviation or
restricted-subagent lines) to a file in the host's temporary directory with
the file-writing tool ([never interpolate](shared/external-data.md)). Run
the script as that reference shows, passing `at-head` or `off-head` from the
at-head flag, and print its session lines in the script's order. Never
print "Posted" unless the outcome is `posted`. Never retry.
