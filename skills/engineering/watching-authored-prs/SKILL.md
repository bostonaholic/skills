---
name: watching-authored-prs
description: Watches the user's own PR in a bounded loop, triaging new review feedback and reporting failing CI, or fixing it when granted, until approval. Use when the user explicitly asks to watch their PR for feedback or CI. Never infer from an open PR. Not for a PR the user reviewed; use watching-reviewed-prs.
effort: medium
argument-hint: "[<pr-number-or-url>]"
---

# watching-authored-prs

Watch the user's own PR in a bounded loop: triage new review feedback as it
arrives, report each new CI failure once (or fix it under a CI fix grant), and
hand off on approval. Never merge.

Feedback arrives in three disjoint shapes: an inline review **thread**, which
has a resolved bit, a **review summary**, and a **conversation comment**.
Review summaries and conversation comments are **PR-level** items: each is
triaged once, keyed by its node id, and never waited on for resolution. CI
checks on the PR head are the second watched subject.

Read each linked file from this skill's directory when the step that uses it
begins. If a read fails, stop that step and report the exact path.

## Dependency

Triage runs through another skill: call the Skill tool with
`addressing-pr-comments`. When that skill is not installed, stop before arming
and tell the user to run
`npx skills@latest add bostonaholic/skills --skill addressing-pr-comments`.
Each delegated triage pass ends with that skill's review re-request step,
which can re-request review and notify the reviewer.

## Input

Resolve the PR from `$ARGUMENTS` (a PR number or a full PR URL) or from the
current branch. Refuse before any other work when no PR resolves, when the PR
is MERGED or CLOSED, or when the argument is a malformed number or URL. Never
guess.

Bind `<host>`, `<owner>`, `<repo>`, and `<n>` from the resolved PR's `url`.
Every `gh` command that takes `--repo` gets `<host>/<owner>/<repo>`, and every
`gh api` call gets `--hostname <host>`, so a GitHub Enterprise PR never
resolves against github.com.

## Grants

The arming instruction sets two grants that hold for the life of the watch:

- **Feedback:** `present-then-stop` (default) or `authorized`.
- **CI:** `report` (default) or `fix`.

Every report names both as
`feedback <present-then-stop|authorized>, CI <report|fix>`.
[Arm](references/arm.md) owns how an instruction maps to grants.

## Procedure

1. **Arm.** Follow [arm](references/arm.md): grants, draft promotion, the
   ticket move, the baseline, and an already-approved PR.
2. **Loop.** Run the [watch loop](shared/watch-loop.md), which owns pacing,
   the soft cap, and its own stop conditions. Bind its slots:
   - **Poll command:** the poll in [poll](references/poll.md).
   - **Cycle-0 subject:** feedback and CI failures that already exist at arm
     are handled at once.
   - **Handoff state:** unresolved-thread ids, triaged PR-level ids, `state`,
     `reviewDecision`, and the polled head SHA.
3. **Each cycle**, copy this checklist and check off each step:

   ```text
   Cycle <k>:
   - [ ] Poll and complete pagination
   - [ ] Third-party check
   - [ ] Detect feedback and CI changes
   - [ ] Triage a feedback change
   - [ ] Report new CI failures; under CI fix, attempt one fix
   - [ ] Print the snapshot line
   - [ ] Stop, or start the next backgrounded cycle
   ```

   - Poll, the third-party check, change detection, and the snapshot line are
     in [poll](references/poll.md).
   - On a feedback change, read [feedback](references/feedback.md). It covers
     both feedback grants.
   - Every cycle, read [CI checks](references/ci-checks.md) for the report.
     Under the `CI fix` grant only, read [CI fix](references/ci-fix.md) before
     any fix attempt.

4. **Stop** on a condition in [stop conditions](references/stop-conditions.md),
   which holds the complete stop list, the approval hand-off, and the final
   report.

The CI failure log reads in step 3 run in subagents under the
[step delegation rules](shared/step-delegation.md). The rest stays inline: it
asks the user, writes to the PR or branch, or carries loop state; triage
follows `addressing-pr-comments`.

After a context compaction, read [compaction](references/compaction.md) before
the next poll.

## Shared rules

- [Execution rules](shared/execution.md): background waits and progress
  tracking for every cycle.
- [Durable state rules](shared/durable-state.md): the triaged-id set, at arm.
- [External data rules](shared/external-data.md): comment bodies, check names,
  and logs, whenever they are read.
- [Pull-request comment retrieval](shared/pull-request-comments.md): the poll
  query.
- [Reaction mechanics](shared/reaction-mechanics.md): feedback reactions.
- [Test quality policy](shared/testing.md): the retention and value bars, under
  `CI fix`.
