---
name: cutting-skills
description: Audits or trims an existing agent skill to its behavioral core and narrows over-broad trigger metadata. Use when the user says "cut this skill", or when the user asks to cut, simplify, shorten, de-slop, or reduce the context cost or trigger aggressiveness of a SKILL.md or skill folder. Never infer from a skill being long or edited for another purpose.
---

# Skill Cutter

A skill tells the model what the author cares about, then stays out of its
way. It holds only what a capable frontier model would otherwise get wrong:

- the goal, quality bar, and preferences that differ from a default
- non-obvious gotchas, domain facts, and safety or authorization boundaries
- fragile or parsed commands and formats

Every cut leaves the skill meeting [the skill rules](references/skill-rules.md):
agent-agnostic, and a short, checklist-shaped `SKILL.md` with detail in
`references/`.

## Mode

- **Audit**: when asked to review, critique, or identify cuts, report proposed
  actions without editing. Run no hillclimb and no evals; counts may be
  estimates.
- **Cut**: an explicit request to cut, trim, shorten, simplify, or de-slop
  authorizes local edits inside that skill only, plus updating eval graders
  that cite `SKILL.md:NN` to the new line numbers of the same content. It does
  not authorize commit, push, publication, or other changes outside the skill.

## Measure

- Record the target `SKILL.md`'s character count (`wc -c`) and body line
  count; characters divided by four estimates tokens. Line count alone
  misleads.
- The frontmatter description loads on every request and counts too; a long
  one sets a floor on the cut.

## Classify before cutting

- Read the whole `SKILL.md`, its `agents/openai.yaml`, and its resources.
- Name the tasks that should trigger it and the decisions an otherwise capable
  agent would get wrong without it.
- Give each piece of material a class and its default treatment from
  [the classification table](references/classification-table.md).

## Cutting

- Prefer deletion over compression. Do not keep text merely because it is
  correct.
- The richest cuts, in order: restatements of linked material; padded Markdown
  tables, which become lists with the same words; intros restating the
  description; rationale behind rules; then generic engineering advice. Also
  delete procedure the model already follows, checklists and completion
  ceremony, subagent dispatch mechanics, repeated summaries, report templates
  no parser or user preference needs, and history that does not change
  execution.
- Keep verbatim any exact format, value, or edge case the user cares about.
  A model drops a loose summary of one, so a paraphrase is a silent cut.
- A typical skill bottoms out around 25-30% smaller. What remains is commands,
  guards, parsed templates, and graded behavior; never compress guards or
  instructions into dense slogans to hit a number. A target that needs cuts
  into Keep-class material is blocked, proven by that classification.
- Reshape a long prose paragraph into list items that keep every clause.
- Move detail into a reference only when one branch, step, or variant needs
  it, and link it from that step with when to read it. The procedure, guards,
  and stop conditions stay in `SKILL.md`; never move them to look shorter.
- Do not delete scripts, assets, or references on apparent non-use; find their
  callers, including tests, first.

## Cut as a hillclimb

In Cut mode, after classifying, call the Skill tool with `hillclimbing`, with
the goal, guardrails, iteration, and fallback that
[cutting as a hillclimb](references/cutting-as-a-hillclimb.md) fixes for it.
Without a Skill tool, follow the [skill call rules](shared/skill-calls.md).

## Trigger metadata

- The description is always-loaded routing context. Name the concrete intents
  and artifacts that should activate the skill, remove "any task" style
  triggers, and add short exclusions for nearby tasks.
- Keep every explicit-only guard. Do not make it so timid that explicit
  requests stop matching. Keep `agents/openai.yaml` aligned with it.

## Validate

- Fix links and `agents/openai.yaml`.
- Run the repository's own skill checks (named in `AGENTS.md`,
  `CONTRIBUTING.md`, or the package manifest, or `skills-ref validate
  <target-skill>` if installed). Never invent a command.
- With none, confirm the frontmatter parses, every relative path resolves, and
  the skill rules hold.
- Fix failures inside the skill and re-run until clean; report failures
  outside it.
- Finally, read the diff for removed behavior that no class justifies.

## Report

- The mode, and SKILL.md line and character counts and total line counts
  before and after (estimates in Audit mode).
- The behavior the skill still provides, and each material keep, move, or
  deletion with its class.
- The trigger change, validation and eval results (pooled runs per case), and
  whether the skill rules hold.
- Anything left untouched because you were unsure.
