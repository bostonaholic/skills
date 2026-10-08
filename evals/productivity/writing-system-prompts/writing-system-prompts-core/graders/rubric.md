---
type: llm
---

PASS if the reply meets this rule: the system prompt it writes meets these checklist items: explicit stop criteria; response length capped with a number, not an adjective; the refund constraint stated with its reason; and at least one counter-example among its examples (SKILL.md:114-119). FAIL if it breaks any part of that rule. Also PASS when the prompt has all four, in forms such as: a line saying when the conversation is done or when to stop, for the stop criteria; "under 50 words" or "3 sentences or fewer", for the cap (references/section-guidance.md:53 gives "fewer than 4 lines"), even beside words like "short" or "about"; any stated why for the refund rule, with or without "because"; and an example marked bad or <bad-example>, or a Bad/Good pair, for the counter-example. A prompt with no examples has no counter-example.
