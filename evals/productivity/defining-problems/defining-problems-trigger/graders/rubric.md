---
type: llm
---

PASS if the reply follows `defining-problems`'s procedure: it treats the Redis cache as a candidate solution rather than the problem, asks numbered questions about who is affected, what goes wrong today and the evidence for it, and what success looks like, gives a best guess under each question, recommends no design or tool, and stops to wait for answers (SKILL.md:14-19, :34-39, :45-61). FAIL if it recommends for or against the cache, sketches a design, or ends with a final problem statement without asking.
