---
name: cutting-skills
description: Audits or trims an existing agent skill to its behavioral core and narrows over-broad trigger metadata. Use when the user asks to cut, simplify, shorten, de-slop, or reduce the context cost or trigger aggressiveness of a SKILL.md or skill folder. Never infer from a skill being long or edited for another purpose.
---

# Skill Cutter

Good skills tell the model what you care about, then stay out of its way. A
skill should hold only what a capable frontier model would otherwise get wrong:
the goal and quality bar, non-obvious gotchas and domain facts, safety and
authorization boundaries, the author's preferences where they differ from a
default, and exact commands or formats where they are fragile or parsed. Line
count is evidence, not the objective.

## Mode

- **Audit**: when asked to review, critique, or identify cuts, report proposed
  actions without editing.
- **Cut**: an explicit request to cut, trim, shorten, simplify, or de-slop
  authorizes local edits inside that skill only. It does not authorize commit,
  push, publication, or changes to consumers outside the skill.

## Classify before cutting

Read the whole `SKILL.md`, its `agents/openai.yaml`, and its resources. Name the
tasks that should trigger it and the decisions an otherwise capable agent would
get wrong without it. Then classify the material:

| Class                                                        | Default treatment                      |
| ------------------------------------------------------------ | -------------------------------------- |
| Non-obvious domain constraint or fragile required sequence   | Keep                                   |
| Useful optional expert recommendation                        | Condense and label as optional         |
| Generic knowledge or ordinary engineering advice             | Delete                                 |
| Policy already enforced by system or repository instructions | Delete                                 |
| Duplicate instruction or example                             | Keep the clearest instance             |
| Project- or incident-specific policy in a generic skill      | Move or delete                         |
| Stale, unverifiable, or overclaimed fact                     | Verify, qualify, or delete             |
| Detail needed only for one variant                           | Move to a selectively loaded reference |

Do not hide subjective policy behind claims that a provider or tool requires it.
For unstable provider claims, check current primary documentation.

## Cutting

- Prefer deletion over compression. Do not keep text merely because it is
  correct.
- Typical deletions: step-by-step procedure for what the model already does,
  checklists and completion ceremony, subagent dispatch mechanics, repeated
  summaries, rigid report templates no parser or user preference needs, and
  history that does not change execution.
- Do not replace readable instructions with dense slogans.
- Do not move bulk into references to make `SKILL.md` look shorter.
- Do not delete scripts, assets, or references on apparent non-use; find their
  callers, including tests, first.

## Trigger metadata

The description is always-loaded routing context. Name the concrete intents and
artifacts that should activate the skill, remove "any task" style triggers, and
add short exclusions for nearby tasks. Keep every explicit-only guard. Do not
make it so timid that explicit requests stop matching. Keep
`agents/openai.yaml` aligned with it.

## Validate

Fix links and `agents/openai.yaml`, then run the repository's own skill checks
(named in `AGENTS.md`, `CONTRIBUTING.md`, or the package manifest, or
`skills-ref validate <target-skill>` if installed). Never invent a command. With
none, confirm the frontmatter parses and every relative path resolves. Fix
failures inside the skill and re-run until clean; report failures outside it.
Finally, read the diff for removed behavior that no class justifies.

## Report

Give the mode, SKILL.md and total line counts before and after (estimates in
Audit mode), the behavior the skill still provides, each material keep, move,
or deletion with its class, the trigger change, validation results, and
anything left untouched because you were unsure.
