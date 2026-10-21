---
name: cutting-skills
description: Audits or trims an existing agent skill to its behavioral core and narrows over-broad trigger metadata. Use when the user asks to cut, simplify, shorten, de-slop, or reduce the context cost or trigger aggressiveness of a SKILL.md or skill folder. Never infer from a skill being long or edited for another purpose.
---

# Skill Cutter

Good skills tell the model what you care about, then stay out of its way. A
skill should hold only what a capable frontier model would otherwise get wrong:
the goal and quality bar, non-obvious gotchas and domain facts, safety and
authorization boundaries, the author's preferences where they differ from a
default, and exact commands or formats where they are fragile or parsed.

## Contents

- Mode
- Measure
- Classify before cutting
- Cutting
- Cut as a hillclimb
- Trigger metadata
- Validate
- Report

## Mode

- **Audit**: when asked to review, critique, or identify cuts, report proposed
  actions without editing. Run no hillclimb and no evals; counts may be
  estimates.
- **Cut**: an explicit request to cut, trim, shorten, simplify, or de-slop
  authorizes local edits inside that skill only, plus updating eval graders
  that cite `SKILL.md:NN` to the new line numbers of the same content. It does
  not authorize commit, push, publication, or other changes outside the skill.

## Measure

Record the target `SKILL.md`'s character count (`wc -c`); characters divided by
four estimates tokens. Line count alone misleads. The frontmatter description
loads on every request and counts too; a long one sets a floor on the cut.

## Classify before cutting

Read the whole `SKILL.md`, its `agents/openai.yaml`, and its resources. Name the
tasks that should trigger it and the decisions an otherwise capable agent would
get wrong without it. Then classify the material:

| Class                                                            | Default treatment                      |
| ---------------------------------------------------------------- | -------------------------------------- |
| Non-obvious domain constraint or fragile required sequence       | Keep                                   |
| Author-specific domain guidance, such as named patterns to flag  | Keep, even when a model knows it       |
| Useful optional expert recommendation                            | Condense and label as optional         |
| Generic knowledge or ordinary engineering advice                 | Delete                                 |
| Policy already enforced by system or repository instructions     | Delete                                 |
| Duplicate instruction or example                                 | Keep the clearest instance             |
| Restatement of a linked script header, reference, or shared rule | Delete; keep the link                  |
| Project- or incident-specific policy in a generic skill          | Move or delete                         |
| Stale, unverifiable, or overclaimed fact                         | Verify, qualify, or delete             |
| Detail needed only for one variant                               | Move to a selectively loaded reference |

Do not hide subjective policy behind claims that a provider or tool requires it.
For unstable provider claims, check current primary documentation.

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
- A typical skill bottoms out around 25-30% smaller. What remains is
  commands, guards, parsed templates, and graded behavior; never compress
  guards or instructions into dense slogans to hit a number. A target that
  needs cuts into Keep-class material is blocked, proven by that
  classification.
- Do not move bulk into references to make `SKILL.md` look shorter.
- Do not delete scripts, assets, or references on apparent non-use; find their
  callers, including tests, first.

## Cut as a hillclimb

In Cut mode, after classifying, call the Skill tool with `hillclimbing`, with
this fixed for it:

- **Goal and check**: the target `SKILL.md`'s character count, at the threshold
  the user gave. With none, the check is "every class-justified deletion made",
  scored by characters.
- **Guardrails**: the checks in [Validate](#validate), plus the skill's
  behavior evals when the repository has them.
- **Iteration**: one class-justified cut, or one section's cuts, so a score
  change traces to it. Revert exactly any cut that breaks a guardrail.

If `hillclimbing` is not installed, run the same loop inline: measure, cut one
class at a time, rerun the checks, keep or revert, and stop when the target is
met or nothing class-justified remains. The [Report](#report) below replaces
hillclimbing's final report, with its score line added. Without a Skill tool, follow the
[skill call rules](shared/skill-calls.md).

When the repository's eval suite covers the skill, it is the quality guardrail:

- Evals cost money. Spend only within a budget the user states; if the run
  needs one, ask for it up front as hillclimbing's one planned question.
- Run the baseline from a clean checkout of the unedited revision, such as a
  separate worktree at `HEAD`, so edits in progress never contaminate it. Run
  the same cases after the cut, more than once per case.
- Scores are noisy: an LLM judge can grade unchanged text far apart on two
  runs. Treat one drop as a reason to rerun. Pool the runs and compare; revert
  a cut only when the pooled drop holds up or the diff shows guidance removed.

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

Give the mode, SKILL.md line and character counts and total line counts before
and after (estimates in Audit mode), the behavior the skill still provides,
each material keep, move, or deletion with its class, the trigger change,
validation and eval results (pooled runs per case), and anything left untouched
because you were unsure.
