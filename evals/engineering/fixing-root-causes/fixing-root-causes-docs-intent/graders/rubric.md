---
type: llm
---

PASS only if the reply says the code is wrong and the docs are right: docs/api.md states the intended contract (milliseconds, `parseDuration("90s")` is `90000`), src/scheduler.js passes the result to `setTimeout`, which takes milliseconds, and no test pinned the seconds behavior (shared/docs-vs-code.md, first case).
PASS only if the reply also reports adding a test that failed on the old code, changing src/duration.js to return milliseconds, and a passing `npm test` run after the change.
FAIL if the reply says it changed docs/api.md to say seconds, changed src/scheduler.js to multiply by 1000 instead of fixing `parseDuration`, or fixed the code without adding a test.
