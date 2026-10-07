---
name: cutting-skills
description: Audits or trims an existing agent skill to its behavioral core and narrows over-broad trigger metadata. Use when the user asks to cut, simplify, shorten, de-slop, or reduce the context cost or trigger aggressiveness of a SKILL.md or skill folder. Never infer from a skill being long or edited for another purpose.
---

# Skill Cutter

Reduce context cost and accidental activation without weakening the behavior the
skill exists to provide. Treat line count as evidence, not the objective.

Copy this checklist and check off each step:

```text
- [ ] 1. Choose the mode
- [ ] 2. Find the behavioral core
- [ ] 3. Classify material
- [ ] 4. Cut trigger aggression
- [ ] 5. Apply the cut (Cut mode only)
- [ ] 6. Validate, fix, and re-run until clean
- [ ] 7. Report
```

Steps 2 to 5 and the diff inspection in step 6 run in subagents per the
[step delegation rules](shared/step-delegation.md); the rest stays inline.

## 1. Choose the mode

- **Audit:** When asked to review, critique, or identify cuts, inspect and report
  without editing. Skip step 5; the report proposes each action instead.
- **Cut:** An explicit request to cut, trim, shorten, simplify, or de-slop the
  skill authorizes local edits within that skill. It does not authorize commit,
  push, publication, or changes to consumers outside the requested scope.

## 2. Find the behavioral core

Read the complete `SKILL.md`, its `agents/openai.yaml` if present, and only the
directly relevant resources. Identify the concrete tasks that should trigger it
and the decisions an otherwise capable agent would get wrong without it.

A read-only `sonnet` subagent given the target skill path does this and returns
the triggering tasks and core decisions, each with `file:line`.

## 3. Classify material

Classify material before cutting:

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

Record which class justified every material keep, move, or deletion; the report
lists them. Do not hide subjective policy behind claims that a provider or tool
requires it.

A read-only `sonnet` subagent given the skill path and step 2's report returns
this table with a material (`file:lines`), class, action, and reason per row.
One subagent covers the whole skill, since duplicates span files.

## 4. Cut trigger aggression

The frontmatter description is always-loaded routing context. Make it narrow and
concrete:

- name positive user intents and artifacts that should activate the skill;
- remove phrases such as “any task,” “all requests,” and broad product-name-only
  triggers unless universal activation is truly intended;
- add concise exclusions for nearby tasks that should not activate it;
- move no trigger rules into the body, which is read only after activation; and
- keep the `agents/openai.yaml` display text and default prompt aligned with the
  narrowed contract.

Do not make the description so timid that explicit requests stop matching.

A read-only subagent, launched alongside step 3's and given the skill path and
step 2's report, returns the proposed `description` and `agents/openai.yaml`
text with the exclusions it adds. In Cut mode, step 5 applies them.

## 5. Apply the cut

Prefer deletion over compression. Preserve:

- task-specific decision rules and failure modes;
- domain-specific safety or authorization boundaries;
- exact tool or file contracts that are easy to misuse; and
- routing to resources that are genuinely needed conditionally.

Remove:

- explanations written for a novice human when the agent already knows them;
- exhaustive product catalogs, copied manuals, and speculative edge cases;
- mandatory-sounding ceremony that applies only to one project or incident;
- repeated summaries, principles, checklists, and completion language; and
- historical justification that does not change future execution.

Do not preserve text merely because it is correct. Do not replace readable
instructions with dense slogans, and do not move bulk into references simply to
make `SKILL.md` look shorter. Do not delete scripts, assets, or operational
references based only on apparent non-use; search for their callers, including
tests, and read their purpose first.

For unstable provider claims, check current primary documentation. Separate
provider constraints from optional recommendations and local policy.

A writer subagent that may edit only files inside the target skill applies the
step 3 table and the step 4 proposal, and returns each changed file with the
table rows it applied and any row it left unapplied, with the reason.

## 6. Validate

Preserve unrelated work. After editing, update broken links and
`agents/openai.yaml`, then validate:

1. Find the repository's skill checks: a validator or lint command named in
   `AGENTS.md`, `CONTRIBUTING.md`, or the package manifest, or
   `skills-ref validate <target-skill>` when the Agent Skills reference
   validator is installed. Never invent a command.
2. If none exists, check by hand: the frontmatter parses with `name` and
   `description`, and every relative link and script path in the skill
   resolves to a file.
3. Fix every failure inside the skill and re-run until clean. Report failures
   outside the skill instead of fixing them.
4. Inspect the final diff for removed behavior that no classification justifies.
   A fresh read-only `opus` reviewer given the diff and the step 3 table
   returns each removed behavior that no row justifies, with `file:line`.

In Audit mode, run the checks once and report their results.

## 7. Report

Use this template. Keep the fields and their order; in Audit mode, actions are
proposals and after-sizes are estimates.

```markdown
## <skill name>: <Audit | Cut>

Size: SKILL.md <before> -> <after> lines; skill <before> -> <after> words; <before> -> <after> files
Contract: <the behavior the skill still provides, in one or two sentences>

| Material (file:lines) | Class | Action | Reason |
| --------------------- | ----- | ------ | ------ |

Trigger: <description change and exclusions added>
Validation: <each command or manual check, and its result>
Left untouched: <uncertain material and why>
```
