---
name: writing-prose
description: Writes and edits prose for people in a plain, conversational, short house style with no em dashes. Use when drafting or revising documentation, READMEs, explanations, blog posts, or other human-facing prose. Not for prompts written for agents; use writing-system-prompts or composing-agent-prompts.
metadata:
  say: "write this up"
---

# Writing Prose

**Write like you talk. Then cut.**

Every sentence must pass this test: "Would I say this to a friend?" If not,
rewrite it. A sentence that sounds clumsy read aloud usually hides a muddled
idea; fix the thinking, not just the words.

## Brevity

- AI-assisted writing runs long: paragraph after paragraph of plausible-sounding
  text that says little.
- Cut to what you'd say out loud to a busy person. Keep every idea the reader
  needs and drop the words that carry none.
- If a cut loses meaning, keep the words. If it only loses padding, cut.

```text
# Bad
After careful consideration of the various factors involved in the
decision-making process, we have determined that the optimal course
of action would be...

# Good
We decided to...
```

## What makes it worth reading

Usefulness = Correctness × Novelty × Importance × Strength

- **Correct**: true, but not so vague it says nothing.
- **Novel**: unknown to the reader, surprising, or unarticulated.
- **Important**: actually matters to them.
- **Strong**: as bold as possible without becoming false.

These multiply: zero in any one is zero value. Qualify a claim only to state
real uncertainty or scope, never to hedge against criticism.

## No em dashes

House style bans em dashes. Before delivering, search the text for `—` and
rewrite each hit with a comma, period, colon, or parentheses.

## No counts that go stale

- Never state how many items a changing set holds ("our 12 services", "the
  four steps below"). Name the items, link the list, or write "every" or
  "these".
- Before delivering, test each number: does adding or removing one item make
  it wrong? If yes, rewrite it.
- Keep numbers in quotes and code. Keep numbers that set a limit, record a
  measurement or past event, or state a fact that cannot change.
