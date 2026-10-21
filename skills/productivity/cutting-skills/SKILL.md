---
name: cutting-skills
description: Audits or trims an existing agent skill to its behavioral core and narrows over-broad trigger metadata. Use when the user asks to cut, simplify, shorten, de-slop, or reduce the context cost or trigger aggressiveness of a SKILL.md or skill folder. Never infer from a skill being long or edited for another purpose.
---

# Skill Cutter

A skill should hold only what a capable frontier model would otherwise get
wrong: the goal and quality bar, non-obvious gotchas, safety and authorization
boundaries, the author's preferences, and exact commands or formats that are
fragile or parsed. Line count is evidence, not the objective.

## Mode

- **Audit**: when asked to review or identify cuts, report proposed actions
  without editing.
- **Cut**: an explicit request to cut, trim, or simplify authorizes local edits
  inside that skill only, not commit, push, publication, or changes to
  consumers outside it.

## Classify

Read the whole skill, including `agents/openai.yaml` and resources, then
classify its material by default treatment:

- **Keep**: non-obvious domain constraint or fragile required sequence.
- **Condense and label as optional**: useful optional expert recommendation.
- **Delete**: generic knowledge or ordinary engineering advice; policy already
  enforced by system or repository instructions.
- **Keep the clearest instance**: duplicate instruction or example.
- **Move or delete**: project- or incident-specific policy in a generic skill.
- **Verify, qualify, or delete**: stale, unverifiable, or overclaimed fact.
- **Move to a selectively loaded reference**: detail needed only for one
  variant.

## Cutting

- Prefer deletion over compression, and never replace readable instructions
  with dense slogans.
- Keep verbatim any exact format, value, or edge case the user cares about.
  A model drops a loose summary of one, so a paraphrase is a silent cut.
- Do not move bulk into references to make `SKILL.md` look shorter.
- Do not delete scripts, assets, or references on apparent non-use; find their
  callers, including tests, first.

## Trigger metadata

The description is always-loaded routing context. Name concrete intents,
remove "any task" style triggers, and add short exclusions for nearby tasks,
without making explicit requests stop matching. Keep every explicit-only guard
and keep `agents/openai.yaml` aligned.

## Validate

Run the repository's own skill checks (from `AGENTS.md`, `CONTRIBUTING.md`, or
the package manifest, or `skills-ref validate <target-skill>` if installed).
Never invent a command; with none, confirm the frontmatter parses and every
relative path resolves. Fix failures inside the skill and re-run until clean;
report failures outside it. Finally, read the diff for removed behavior that no
class justifies.

## Report

Give the mode, SKILL.md and total line counts before and after (estimates in
Audit mode), the behavior the skill still provides, each material keep, move,
or deletion with its class, the trigger change, validation results, and
anything left untouched because you were unsure.
