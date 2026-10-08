---
name: writing-technical-design-docs
description: Drafts technical design docs that are directionally correct, not perfect, deciding one-way doors, deferring two-way doors, and naming unknowns. Use when asked to write, draft, or author a design doc, RFC, tech spec, or architecture proposal. Not for reviewing a design; use reviewing-design-docs.
---

# Writing Technical Design Docs

A design doc is a decision artifact, not a specification. Its job is to
align people on a direction with enough rigor that work can start and
enough humility that the plan can change. Aim for directionally correct,
not perfect: a 60% draft circulated now gets better feedback than a 95%
draft circulated in three weeks. If the doc takes longer to write than the
first slice of implementation, it is over-engineered.

## Principles

- **Decide the one-way doors; default the two-way doors.** A one-way door
  is hard to reverse (data model, public API, persistence format, identity
  scheme): argue it out. A two-way door is cheap to reverse (timeouts,
  retry counts, internal module boundaries, log format): name the default,
  say it is revisable, and move on. A two-way door debated for more than a
  paragraph gets cut. When unsure what a wrong call would cost to change,
  treat it as one-way.
- **Name unknowns; never fabricate numbers.** Write "QPS unknown, will
  measure in week 1", not "approximately 500 QPS". Reviewers can challenge
  an unknown; a made-up number costs the doc its credibility.
- **Pick a direction and state one alternative.** Name the chosen approach,
  one alternative considered, and a one-line reason it lost: "Using
  Postgres LISTEN/NOTIFY. Considered Kafka; rejected for ops complexity at
  our scale." Do not lay out an option buffet; a reviewer who prefers
  another option will raise it.
- **Concrete but incomplete.** Write the load-bearing scenario end to end
  with its key edge cases, and mark the rest "follows the same pattern" or
  "TBD in implementation".

## Shape

A default to adapt; fold it into the team's own template where one exists.

1. **Status banner first:**
   `Status: Draft v0.1 (seeking [direction | implementation | rollout] feedback)`.
   It tells reviewers not to send line edits.
2. **Lead with the decision:** right after the problem statement, the
   chosen approach in 3 to 5 sentences. Everything else is justification or
   detail.
3. **Mark depth:** `[deep]` on sections that warrant rigor, `[sketch]` on
   sections deliberately light, so reviewers know where to push.
4. **Open Questions:** numbered, each with an owner and the date its answer
   is needed. Five honest open questions beat zero.
5. **Close with a Reversibility table:** each major decision rated one-way
   or two-way.

For an adversarial review of the draft, call the Skill tool with
`reviewing-design-docs`. If it is not installed, say that no independent
review was done.

## When not to use this skill

- **Compliance, legal, or safety-critical specs:** these need precision,
  not direction. Write a complete, exhaustive spec.
- **Public API contracts shipped to external customers:** a one-way door by
  default; optimize for thoroughness.
- **Post-mortems and incident reports:** backward-looking and factual.
- **Final sign-off architecture docs:** the direction is already set.
