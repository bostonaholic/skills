---
name: improving-prompts
argument-hint: "<prompt text or file path containing the prompt to improve>"
description: Compresses and clarifies an existing LLM prompt through concept elevation, verifying that no original instruction is lost. Use when the user supplies a prompt or prompt file and asks to improve, tighten, optimize, or refine it. Not for writing a new prompt; use writing-system-prompts.
---

# Improve Prompt Using Concept Elevation

Concept elevation takes stock of disparate yet connected instructions in a
prompt, then finds a higher-level, clearer way to express their sum. The result
is shorter and lets the model adapt to new situations instead of relying on
specific examples or instructions.

The argument is prompt text or a path to a file containing it. Print the
improved prompt by default. Edit the file in place only when the user asks.

## Process

Perform each step inside its named tag so the reasoning is auditable.

1. `<decompose>`: Number every instruction, constraint, and example in the
   original prompt (I1, I2, ...). This numbered list is the intent inventory.
2. `<group>`: Cluster inventory items that serve the same underlying purpose.
3. `<elevate>`: For each group, find the single higher-level rule that captures
   the sum of its items. Iterate on candidates until the rule is shorter and
   clearer than the items it replaces. Prefer principles over rigid examples.
   Keep an item as written when no rule captures it without loss.
4. `<synthesize>`: Combine the elevated rules into a draft, then remove any
   remaining redundancy or vagueness.
5. `<validate>`: Map every inventory item to the draft line that carries its
   intent. Restore each unmapped item, then map again. Repeat until every item
   maps. Then confirm the draft is shorter than the original and leaves fewer
   cases unaddressed, not more.

Never drop an item silently. When two items conflict or one looks obsolete, keep
both in the draft and flag the conflict.

## Deliverable

After the tagged steps, end with this format (adapt the list labels; keep the
order):

````markdown
```text
<the improved prompt>
```

- Merged: I1, I4, I7 -> <the rule that replaces them, abbreviated>
- Kept as written: I3 (<why no rule captured it>)
- Flagged: I9 conflicts with I2 (<the decision the user must make>)
````
