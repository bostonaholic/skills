# Skill authoring

Every active skill follows Anthropic's
[skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices).
This page catalogs those practices with stable IDs for commits, reviews, and
lint output. Rules marked **lint** are enforced by `npm run lint:skills`
(`scripts/lint-skills.mjs`), which runs in CI. The rest are review criteria.

## Contents

- Description form
- A. Metadata
- B. Concision and freedom
- C. Structure and progressive disclosure
- D. Workflows and feedback loops
- E. Content
- F. Scripts and tools
- G. Evaluation and iteration
- Checks

## Description form

The description is the only part of a skill loaded before it runs, so it
carries all routing. Write it in this order, in the third person:

```text
<Verbs> <what it does>. Use when <triggers and key terms>. [Never infer from <near miss>.] [Not for <nearby task>; use <other skill>.]
```

Aim for 300 characters or fewer. Keep every explicit-only guard and exclusion.
Keep `agents/openai.yaml` `short_description` and `default_prompt` aligned
with it.

## A. Metadata

| ID  | Rule                                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------- |
| A1  | `name` is at most 64 characters of lowercase letters, digits, and hyphens, with no `anthropic` or `claude`. **lint** |
| A2  | `name` starts with a gerund (`reviewing-code`), so the collection follows one pattern. Avoid vague names. **lint**   |
| A3  | `description` is non-empty, at most 1,024 characters, with no XML tags. **lint**                                     |
| A4  | `description` is third person: it opens with a verb such as "Reviews" and never says I or you. **lint**              |
| A5  | `description` says what the skill does and when to use it, with a `Use when` clause. **lint**                        |
| A6  | `description` names specific key terms and triggers, plus exclusions for nearby skills.                              |

## B. Concision and freedom

| ID  | Rule                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------- |
| B1  | Assume the agent is capable. Cut what it already knows; every paragraph must justify its tokens.         |
| B2  | Match freedom to fragility: heuristics for open tasks, exact commands for fragile or ordered operations. |
| B3  | Write instructions that work on small and large models alike.                                            |

## C. Structure and progressive disclosure

| ID  | Rule                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | The SKILL.md body stays under 500 lines. Split detail into references before reaching it. **lint**                                          |
| C2  | SKILL.md is an overview that routes to references, each with a clause saying when to read it.                                               |
| C3  | Every file in the skill's `references/` and `shared/` is linked from SKILL.md as a markdown link, so no file sits two levels deep. **lint** |
| C4  | A file over 100 lines opens with a `## Contents` section listing its sections. **lint**                                                     |
| C5  | File names describe their content; directories group by domain; paths use forward slashes. **lint** (slashes)                               |

## D. Workflows and feedback loops

| ID  | Rule                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------- |
| D1  | Complex tasks are clear, numbered steps.                                                                                  |
| D2  | Particularly complex workflows include a progress checklist the agent copies and checks off.                              |
| D3  | Quality-critical output has a feedback loop: validate, fix, repeat, and proceed only when validation passes.              |
| D4  | Decision points are explicit. Large branches live in separate files read only on that branch.                             |
| D5  | Batch, destructive, or outward-facing operations follow plan, validate, execute, with a verifiable intermediate artifact. |

## E. Content

| ID  | Rule                                                                                           |
| --- | ---------------------------------------------------------------------------------------------- |
| E1  | No time-sensitive or machine-specific facts. Keep history in a collapsed "Old patterns" block. |
| E2  | One term per concept across a skill and its references.                                        |
| E3  | Output templates state their strictness: exact, or a default to adapt.                         |
| E4  | Concrete input and output examples where style matters.                                        |
| E5  | Offer one default with an escape hatch, not a menu of options.                                 |

## F. Scripts and tools

| ID  | Rule                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------- |
| F1  | Scripts handle error conditions and report them by name instead of leaving them to the agent.        |
| F2  | No unexplained constants: every limit, timeout, and count says why it has that value.                |
| F3  | Deterministic operations live in scripts with documented usage, output, and exit codes.              |
| F4  | Instructions say whether to run a script ("Run `scripts/x.mjs`") or read it ("See `scripts/x.mjs`"). |
| F5  | Required tools and packages are listed with a check command. Never assume one is installed.          |
| F6  | MCP tools are named in full as `ServerName:tool_name`.                                               |
| F7  | Inputs that render as images are checked visually.                                                   |

## G. Evaluation and iteration

| ID  | Rule                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------- |
| G1  | Each skill has at least three evaluations, built before large edits and scored against a run without the skill. |
| G2  | Evaluations run on Haiku, Sonnet, and Opus.                                                                     |
| G3  | Skills improve from observed use: watch which files the agent reads, misses, or rereads, then revise.           |
| G4  | Team feedback, where a team uses the skill. Not applicable to this personal collection.                         |

The evaluation suite is not built yet; see the tracking issue linked from
AGENTS.md.

## Checks

```sh
npm run lint:skills
uv run scripts/validate-skills.py skills/engineering/*/SKILL.md skills/productivity/*/SKILL.md
npm test
```

`validate-skills.py` checks the Agent Skills specification. `lint:skills`
checks the rules marked **lint** above.
