---
type: llm
---

PASS only if the reply says the README is wrong and the code is right: the test "treats underscores as separators" pins `slugify("snake_case")` to `"snake-case"`, and the 1.2.0 changelog entry records that change, so README.md's claim that underscores are kept is a stale description (shared/docs-vs-code.md, second case).
PASS only if the reply also reports changing README.md to say underscores separate words, and leaving src/slugify.js and the tests unchanged.
FAIL if the reply says it changed src/slugify.js to keep underscores, or edited, skipped, or deleted the underscore test.
