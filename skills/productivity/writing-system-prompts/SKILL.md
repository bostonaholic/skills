---
name: writing-system-prompts
description: Writes and reviews system prompts for AI tools, agents, chatbots, and LLM products using a fixed section order and a quality checklist. Use when drafting a system prompt or auditing one for missing stop criteria, tool rules, constraints, or examples. Not for compressing an existing prompt; use improving-prompts.
---

# System Prompt Engineering

**Structure beats cleverness. Concrete examples beat abstract instructions.**

A system prompt is a contract with the model. Every line must change its
behavior in a way someone could test; cut the rest, including anything the
model or its harness already does by default.

## Section order

Follow this order and skip sections that don't apply. Read
[section guidance](references/section-guidance.md) for each section's rules
and good and bad examples.

```text
1. Identity and role
2. Mission and stop criteria
3. Communication style
4. Core workflow
5. Tool usage rules
6. Domain-specific rules
7. Safety and constraints
8. Edge cases and error handling
9. Examples
10. Runtime context (injected at run time)
```

## What a good prompt has

- A specific role, not "AI assistant".
- Explicit completion criteria: when to stop, and when to ask instead.
- Response length capped with a number ("fewer than 4 lines"), never an
  adjective ("be concise").
- A retry limit with an escalation path for agents.
- Constraints on security-critical and destructive actions, each with its
  reason, stated once.
- 3-10 concrete examples showing length and tone, tool-call decisions, and edge
  cases, with at least one bad-to-good pair. Examples are the highest-return
  part of the prompt.
- A runtime context section for values that change per session.

## Write

Infer what the conversation and supplied files already answer. Ask only the
rest, in one message, and wait: what the AI does, who its user is, which tools
it has, what "done" looks like, what must never happen, and the expected output
format. Deliver the prompt in a fenced block, followed by one line per
assumption you made.

## Review

Map the prompt to the section order, noting missing and misplaced sections.
Flag each [review anti-pattern](references/review-anti-patterns.md) present.
Then revise. Unless the user asked for another format, report:

````markdown
## Findings

| Section | Issue | Fix |
| ------- | ----- | --- |

## Revised prompt

```text
<the full revised prompt>
```
````
