---
type: llm
---

PASS if `purge_expired` is a private method that deletes the expired entries from `@entries` and `write` calls it inside its `@lock.synchronize` block. FAIL otherwise.
