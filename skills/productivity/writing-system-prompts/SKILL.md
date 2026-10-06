---
name: writing-system-prompts
description: Writes and reviews system prompts for AI tools, agents, chatbots, and LLM products using a fixed section order and a quality checklist. Use when drafting a system prompt or auditing one for missing stop criteria, tool rules, constraints, or examples. Not for compressing an existing prompt; use improving-prompts.
---

# System Prompt Engineering

**Structure beats cleverness. Concrete examples beat abstract instructions.**

A system prompt is a contract with the model. Every line must change its
behavior in a way someone could test; cut the rest.

## Choose the mode

- **Review:** the user supplied a prompt. Follow the Review steps.
- **Write:** otherwise. Follow the Write steps.

Read each linked file from this skill's directory when the step that uses it
begins. If a read fails, stop that step and report the exact path.

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
3. **Add examples.** This is the highest-return step. Add 3-10 concrete
   examples showing response length and tone, tool-call decisions, edge cases,
   and at least one bad-to-good pair.
4. **Check** the draft with the checklist below.
5. **Deliver** the prompt in a fenced block, followed by one line per
   assumption made in step 1.

## Review

1. Read the whole prompt and map its content to the section order. Note
   missing and misplaced sections.
2. Read [review anti-patterns](references/review-anti-patterns.md) and flag
   each one present.
3. Run the checklist below against the prompt.
4. Revise the prompt to fix every finding, using
   [section guidance](references/section-guidance.md) for missing or weak
   sections, then run the checklist on the revision.
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
