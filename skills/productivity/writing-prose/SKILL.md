---
name: writing-prose
description: Writes and edits prose for people in a plain, conversational, short house style with no em dashes. Use when drafting or revising documentation, READMEs, explanations, blog posts, or other human-facing prose. Not for prompts written for agents; use writing-system-prompts or composing-agent-prompts.
---

# Writing Prose

## The Rule (house style)

**Write like you talk. Then cut.**

Every sentence must pass this test: "Would I say this to a friend?"
If not, rewrite it.

## Brevity

AI-assisted writing runs long: paragraph after paragraph of plausible-sounding
text that says little. Cut to what you'd say out loud to a busy person. Keep
every idea the reader needs and drop the words that carry none. If a cut loses
meaning, keep the words. If it only loses padding, cut.

```text
# Bad
After careful consideration of the various factors involved in the
decision-making process, we have determined that the optimal course
of action would be...

# Good
We decided to...
```

## Core Formula

Usefulness = Correctness × Novelty × Importance × Strength

- **Correct**: True, but not so vague it says nothing
- **Novel**: Unknown to reader, surprising or unarticulated
- **Important**: Actually matters to them
- **Strong**: As bold as possible without becoming false

These multiply. Zero in any dimension = zero value. Qualify a claim only to
state real uncertainty or scope, never to hedge against criticism.

## The Process

1. **Draft fast**: Get ideas down without editing.
2. **Read aloud**: A sentence that sounds clumsy usually hides a muddled idea.
   Fix the thinking, not just the words.
3. **Cut**: Delete weak sentences and abandon weak paragraphs.
4. **Check**: Run both checks below. Fix every failure and repeat until both
   pass.

## Checks

1. **No em dashes (house style).** Search the text: `grep -n '—' <file>`, or
   the draft itself when it is not in a file. Rewrite each hit with a comma,
   period, colon, semicolon, or parentheses. Repeat until the search finds
   nothing.
2. **Sentence checklist.** For each sentence:
   - [ ] Would I say this to a friend?
   - [ ] Can I cut any words?
   - [ ] Is this the simplest way to say it, in common words and active voice?
   - [ ] Does it sound good when read aloud?
