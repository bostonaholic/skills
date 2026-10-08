---
name: reviewing-code
description: 'Reviews a diff (PR, branch, commit range, or working tree) in a fresh-context read-only subagent for Conventional Comments findings and an APPROVE, REQUEST CHANGES, or COMMENT verdict, posted to the PR. Use when asked to review code, a diff, or a PR. Not for design docs; use reviewing-design-docs.'
effort: high
argument-hint: "[<diff target>]"
---

# Code Review

Read each linked file from this skill's directory when the step that uses it begins. If a read fails, stop that step and report the exact path.

## Input

`$ARGUMENTS` names the diff: a PR number or URL, a branch, a commit range,
or a path. With no argument, the target is the working tree's diff against
the base branch. Resolve it once into a concrete target and pass that target
to the reviewer. Never ask the user to restate it.

- A PR number or URL resolves through
  [posting reviews](references/posting-reviews.md) into the SHA-pair target
  `<base-sha>...<head-sha>`, the PR state, and the at-head flag. When that
  resolution fails, print `Stopped before review: <reason>.` and stop
  before dispatch. An argument of digits only is a PR number.
- A branch goes through the same lookup and that reference's branch gate.
  A branch whose local tip is its open PR's head resolves as a PR number
  does. Any other branch resolves into the base and head refs, and its
  review runs without a post.
- A commit range, a path, or no argument resolves into the base and head
  refs, or the paths.

## Steps

This session holds conversation history, so it is not a valid reviewer
([independent review rules](shared/independent-review.md)). Never review
inline. Step 2 is delegated under the
[step delegation rules](shared/step-delegation.md), with the dispatch
contract below; steps 1, 3, 4, and 5 stay in this session. Step 5 writes
PR state, so it stays inline.

1. **Load the brief.** Read the [code reviewer brief](references/code-reviewer.md),
   including its [report format](references/code-reviewer.md#report-format).
2. **Dispatch.** Run the reviewer in a fresh-context subagent that holds no
   file-editing tool. On Claude Code, call the `Agent` tool with
   `subagent_type: Explore` and `model: opus`. On a host without `Explore`,
   spawn the host's general-purpose subagent with the brief as its role
   instructions. Grant it read and search tools and a shell, and state in
   its prompt that the shell runs only the project's test command and
   read-only commands (`git diff`, `git log`, `git show`, `git blame`,
   `git grep`), never a command that changes tracked files, the index,
   refs, or remote state. When the host cannot give it a shell, grant read
   and search only and say so in its prompt. If the host cannot spawn a
   subagent, stop and report it. Record whether the reviewer got a shell;
   step 5 reads it.

   For a PR target with a shell and the at-head flag no, the prompt says
   "the checkout is not at the PR head" or "the checkout has uncommitted or
   untracked changes", whichever applies. It says the read and search tools
   show the checkout, not the head, so the reviewer reads head files with
   `git show <head-sha>:<path>`, searches with
   `git grep -n <pattern> <head-sha>`, and cites head lines. It restates
   that a blocking finding still makes the verdict REQUEST CHANGES. A prompt
   with no shell carries no off-head text.

   Pass the resolved target (the SHA pair for a PR), the absolute path of
   this skill's directory, and the absolute paths of the brief and of each
   file it links. The reviewer reads these before work; this session does
   not:
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
   and stop. For a PR target, also print
   `Not posted: the report failed the verdict contract.` Never repair a
   verdict yourself.
4. **Relay.** Print the report in full, as the report format requires, and
   name any heading deviation on its own line. When the reviewer ran as a
   restricted general-purpose subagent, add one line after the report: the
   read-only guarantee rests on the prompt, not the host.
5. **Post.** Invoking this skill on a PR target is the request to post the
   review on that PR, so never ask first. Post only when the target is a PR
   that was `OPEN` at Input and step 2 gave the reviewer a shell. Otherwise
   print the first applicable `Not posted:` line from the session lines in
   [posting reviews](references/posting-reviews.md) and stop. To post, run
   that reference's tool check. Write the report alone (from its verdict
   line to its last line, as step 4 printed it, without the
   heading-deviation or restricted-subagent lines) to a file in the host's
   temporary directory with the file-writing tool
   ([never interpolate](shared/external-data.md)). Run the script as that
   reference shows, passing `at-head` or `off-head` from the at-head flag,
   and print its session lines in the script's order. Never print "Posted"
   unless the outcome is `posted`. Never retry.
