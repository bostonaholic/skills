---
name: writing-technical-design-docs
description: Drafts technical design docs that are directionally correct, not perfect, deciding one-way doors, deferring two-way doors, and naming unknowns. Use when asked to write, draft, or author a design doc, RFC, tech spec, or architecture proposal. Not for reviewing a design; use reviewing-design-docs.
---

# Writing Technical Design Docs

A methodology for authoring technical design docs that get the **direction**
right and let the **details** evolve. The guiding principle: **directionally
correct, not perfection.** The posture of the writing biases toward shipping a
useful doc fast over polishing a perfect one.

## Contents

- The posture
- Core principles
- The author's checklist
- Anti-patterns
- Output guidance
- When not to use this skill

## The posture

A design doc is a **decision artifact**, not a specification. Its job is to
align humans on a direction with enough rigor that work can start and enough
humility that the plan can change. Treat the doc as version 0.1, not 1.0.

If the doc takes longer to write than the first slice of implementation would,
the doc is over-engineered.

## Core principles

### 1. Decide the one-way doors; defer the two-way doors

Borrow from Bezos: a one-way door is hard to reverse (data model, public API
surface, persistence format, identity scheme). A two-way door is cheap to
reverse (timeout values, retry counts, internal module boundaries, log format).

- **One-way doors:** argue them out in the doc. These deserve real rigor.
- **Two-way doors:** name the default, note it is revisable, move on. Do not
  burn pages weighing options.

If a section debates a two-way door for more than a paragraph, cut it.

### 2. Concrete-but-incomplete beats abstract-and-thorough

A specific example with one happy path and two named edge cases conveys more
than three pages of generalized framework. Pick the load-bearing scenario and
write it end to end. Mark the rest as "follows the same pattern" or "TBD in
implementation."

### 3. Name unknowns explicitly

False precision is worse than admitted ignorance. If the QPS is unknown, write
"unknown, will measure in week 1", not "approximately 500 QPS." Reviewers can
challenge an unknown; they cannot challenge a fabricated number without
sounding pedantic.

Keep a standing **Open Questions** section. A doc with 5 honest open questions
is healthier than a doc with 0.

### 4. Pick a direction; state the alternative once

Do not enumerate every option. Name the chosen approach, list **one**
alternative considered, and give the **one-line** reason for not picking it. A
reviewer who disagrees will surface their preferred alternative; that is their
job.

> Good: "We're using Postgres LISTEN/NOTIFY. Considered Kafka; rejected for ops
> complexity at our scale."
>
> Bad: "Option A: Postgres LISTEN/NOTIFY... Option B: Kafka... Option C: SQS...
> Option D: Redis pub/sub... [3 pages of comparison]"

### 5. Bound the rework cost, not the risk

The chance of being wrong cannot be eliminated. The cost of finding out can be
bounded. For each major decision, answer: "If this is wrong, what does it cost
to change?" If the answer is small, ship the decision and move on. If it is
large, that is a one-way door; go back to principle 1.

### 6. Time-box the doc

Set a deadline before starting (for example, "draft by end of week"). If the
deadline passes, ship what exists with the rough edges visible. A 60%-complete
doc circulated on Monday gets better feedback than a 95%-complete doc
circulated three weeks later. Reviewer attention is a depleting resource.

### 7. The doc is a draft: say so out loud

Open with a status banner:
`Status: Draft v0.1 (seeking direction feedback, not line edits)`. This sets
reviewer expectations and pre-empts bikeshedding on wording.

## The author's checklist

Before circulating, check:

- [ ] Could a reader explain the chosen direction in one sentence after
      reading?
- [ ] Are the one-way doors named and argued?
- [ ] Does every two-way door have a default, even if uncertain?
- [ ] Are unknowns labeled as unknown, not faked with false precision?
- [ ] Is there at least one concrete end-to-end example?
- [ ] Is every section that does not change a reader's decision cut?
- [ ] Honestly, is the doc 60 to 80% complete? If yes, ship it. At 95% or
      more, it waited too long.

For an adversarial review of the draft, call the Skill tool with
`reviewing-design-docs`. If it is not installed, rerun this checklist and say
that no independent review was done.

## Anti-patterns

- **The Encyclopedia:** exhaustively covers every edge case before any code is
  written. The reader bounces off; nothing ships.
- **The Option Buffet:** enumerates 4 or more alternatives without picking one.
  Punts the decision to the reviewer.
- **The Crystal Ball:** fabricates numbers (latency, QPS, cost) to sound
  rigorous. Loses credibility on first scrutiny.
- **The Forever Draft:** perpetually 90% complete. The author keeps polishing;
  the team keeps waiting.
- **The Solo Performance:** written without circulating an outline first.
  Three weeks of work, then "actually we're not building this."

## Output guidance

This structure is a default to adapt: follow the team's own doc template where
one exists and fold these elements into it.

1. **Open with a status banner:**
   `Status: Draft v0.1 (seeking [direction | implementation | rollout] feedback)`.
2. **Lead with the decision:** the first section after the problem statement
   is the chosen approach, in 3 to 5 sentences. Everything else is
   justification or detail.
3. **Maintain a visible Open Questions list:** numbered, each with an owner and
   a date the answer is needed.
4. **Mark depth deliberately:** use `[deep]` for sections that warrant rigor
   and `[sketch]` for sections that are intentionally light, so reviewers know
   where to push.
5. **Close with a Reversibility table:** list the major decisions and rate each
   as one-way or two-way. This makes the cost of being wrong explicit.

## When not to use this skill

- **Compliance, legal, or safety-critical specs:** these need precision, not
  direction. Write a complete, exhaustive design doc instead of a directional
  draft.
- **Public API contracts that ship to external customers:** a one-way door by
  default. Optimize for thoroughness.
- **Post-mortems and incident reports:** backward-looking and factual;
  "directionally correct" does not apply.
- **Final sign-off architecture docs:** by sign-off, the direction is set. This
  skill is for the drafting phase.
