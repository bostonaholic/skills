---
name: defining-problems
description: Interviews the user in rounds of numbered questions until the problem is defined, with who has it, evidence, impact, and success criteria, before any solution. Use when the user says "what problem are we solving?", or asks to define, frame, or clarify a problem. Never infer from a plain feature or bug request. Not for drafting a design; use writing-technical-design-docs.
---

# Defining Problems

Ask "what problem are we trying to solve?" and keep asking until the answer
is clear enough that two people would build toward the same outcome. The
interview ends in a problem statement the user confirms, never a solution.

## Rules

- Stay in the problem space. Propose no design, fix, or tool during the
  interview, even when the answer looks obvious.
- Treat a solution-shaped answer ("we need a cache", "add retries") as a
  candidate solution, not the problem. Record it under candidate solutions,
  then ask what would be different for whom if it existed, and what goes
  wrong today without it.
- Ask "why?" until the problem is stated in terms of people and outcomes,
  without naming any solution. Stop when the next "why?" leaves the user's
  control or scope.
- Finding facts is your job; deciding is the user's. Look up anything the
  repository, tools, or docs can answer instead of asking. For a wide
  search, start a read-only subagent with fresh context, never a fork of
  the parent conversation, so only its findings return.
- Push for evidence over belief: a measurement, an incident, a user quote,
  or a count. Mark a claim with no evidence as an assumption.
- Never fill a gap silently. Every unknown becomes a question or an entry
  under open questions.

## What a defined problem settles

- **Who** has the problem: the people or systems affected, and who does not.
- **Current state**: what happens today, observably, and how often.
- **Evidence**: how anyone knows the current state is true.
- **Impact**: what it costs, to whom, and why it matters now.
- **Desired state**: what is observably true once it is solved, and how it
  will be measured.
- **Constraints and non-goals**: fixed limits, and what is out of scope.
- **Already tried**: earlier attempts and why they fell short.

## Rounds

1. Restate the problem as you understand it in one or two sentences, and
   name every candidate solution already in the request.
2. Ask the frontier: every question whose prerequisites are settled. A
   question that depends on an answer still open this round waits for a
   later round. Use this format exactly:

   ```text
   ❓ **Q1** - **<short title>**: <question>

   ➡️ <best guess, citing any fact you found>
   ```

   Word each question so "yes" accepts the best guess, and mark a guess
   with no fact behind it as a guess.

3. Stop and wait for the user's answers. Then update the picture, recompute
   the frontier, and ask the next round.
4. When every item under "What a defined problem settles" is answered or
   recorded as an open question, write the problem statement below and ask
   the user to confirm or correct it. Revise until they confirm.

## Problem statement

Default layout; adapt headings to the problem, but keep every section.

```markdown
## Problem
<One or two sentences: who, what goes wrong, and why it matters. No solution.>

## Evidence
## Impact
## Success looks like
## Constraints and non-goals
## Assumptions
## Open questions
## Candidate solutions (not yet evaluated)
```

After the user confirms, offer in one line to turn **Success looks like**
into acceptance criteria, then stop. What comes next, a design, a spike, or
dropping the work, is the user's call.

If they accept, call the Skill tool with `writing-acceptance-criteria` on that
section, per the [skill call rules](shared/skill-calls.md); if it is not
installed, say so.
