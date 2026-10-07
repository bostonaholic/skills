---
name: writing-system-prompts
description: Writes and reviews system prompts for AI tools, agents, chatbots, and LLM products using a fixed section order and a quality checklist. Use when drafting a system prompt or auditing one for missing stop criteria, tool rules, constraints, or examples. Not for compressing an existing prompt; use improving-prompts.
---

# System Prompt Engineering

**Structure beats cleverness. Concrete examples beat abstract instructions.**

A system prompt is a contract with the model. Every line must change its
behavior in a way someone could test; cut the rest.

## Contents

- Choose the mode
- Section order
- Write
- Review
- Checklist

## Choose the mode

- **Review:** the user supplied a prompt. Follow the Review steps.
- **Write:** otherwise. Follow the Write steps.

Read each linked file from this skill's directory when the step that uses it
begins. If a read fails, stop that step and report the exact path.

Write steps 2 to 4 and Review steps 1 to 4 are delegated under the
[step delegation rules](shared/step-delegation.md); the rest stay in this
session.

## Section order

Follow this order and skip sections that don't apply:

```text
1. Identity and role           (1-5 lines)
2. Mission and stop criteria   (2-10 lines)
3. Communication style         (5-20 lines)
4. Core workflow               (10-50 lines)
5. Tool usage rules
6. Domain-specific rules
7. Safety and constraints
8. Edge cases and error handling
9. Examples                    (3-10, few-shot)
10. Runtime context            (injected at run time)
```

## Write

1. **Gather requirements.** Infer what the conversation and supplied files
   already answer. Ask only the rest, in one message, and wait: what the AI
   does, who its user is, which tools it has, what "done" looks like, what must
   never happen, and the expected output format.
2. **Write each section** in the order above. Read
   [section guidance](references/section-guidance.md) for each section's rules
   and examples. When the prompt drives an agent through multi-step tool work,
   also read [agentic techniques](references/agentic-techniques.md).
   A writer subagent given the step 1 requirements and assumptions writes
   only the draft file this session names and returns its path plus each
   skipped section with the reason.
3. **Add examples.** This is the highest-return step. Add 3-10 concrete
   examples showing response length and tone, tool-call decisions, edge cases,
   and at least one bad-to-good pair. A writer subagent given the draft path
   and the step 1 requirements adds them to the draft and returns how many it
   added and which of these kinds each shows.
4. **Check** the draft with the checklist below. A read-only `sonnet`
   subagent given the draft path returns each item as checked, unchecked, or
   N/A, with the draft line or reason. Fix and re-run the list in this session.
5. **Deliver** the prompt in a fenced block, followed by one line per
   assumption made in step 1.

## Review

Steps 1 to 3 are independent: run each in its own read-only `sonnet`
subagent, launched together, given the prompt (its path, or its text when
pasted). Each returns its findings as `Section | Issue | Fix` rows.

1. Read the whole prompt and map its content to the section order. Note
   missing and misplaced sections.
2. Read [review anti-patterns](references/review-anti-patterns.md) and flag
   each one present.
3. Run the checklist below against the prompt.
4. Revise the prompt to fix every finding, using
   [section guidance](references/section-guidance.md) for missing or weak
   sections, then run the checklist on the revision. A writer subagent given
   the prompt and the merged rows from steps 1 to 3 writes only the revised
   prompt file this session names and returns its path, the fix applied for
   each row, and any checklist item still unchecked.
5. Report in this format unless the user asked for another:

````markdown
## Findings

| Section | Issue | Fix |
| ------- | ----- | --- |

## Revised prompt

```text
<the full revised prompt>
```
````

## Checklist

Copy this checklist and check off each item. Fix the prompt for every unchecked
item, or mark it N/A with a reason. Re-run the whole list until every item is
checked or N/A.

```text
- [ ] Identity in 1-5 lines, naming a specific role
- [ ] Explicit completion criteria (when to stop, when to ask)
- [ ] Response length capped with a number, not an adjective
- [ ] Tool rules: parallel calls when independent, read before edit, preferred tools
- [ ] Retry limit (typically 3) with an escalation path
- [ ] Constraints for security-critical and destructive actions, each with its reason
- [ ] 3-10 few-shot examples, including a counter-example
- [ ] Multi-step workflow with phase gates (agents)
- [ ] Context efficiency: never re-read context already provided (agents)
- [ ] Domain rules with concrete examples
- [ ] Runtime context section for values that change per session
- [ ] No capability lists, personality directives, marketing copy, defensive disclaimers, or rules restating default behavior
```
