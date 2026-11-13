---
type: llm
---

PASS if the reply meets this rule: the system prompt it writes has these properties of a good prompt: explicit stop criteria; response length stated as audience and outcome, with a number only for a hard downstream limit; the refund constraint stated with its reason; and at least one counter-example among its examples (SKILL.md:35-44). FAIL if it breaks any part of that rule. Also PASS when the prompt has all four, in forms such as: a line saying when the conversation is done or when to stop, for the stop criteria; a statement of what the reply covers or who reads it ("answers only what was asked"), or a number tied to a downstream limit, for the length rule (references/section-guidance.md:53-54); any stated why for the refund rule, with or without "because"; and an example marked bad or <bad-example>, or a Bad/Good pair, for the counter-example. A prompt with no examples has no counter-example.
