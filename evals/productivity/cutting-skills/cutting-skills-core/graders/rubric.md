---
type: llm
---

PASS if the reply meets this rule: in Cut mode it edits skill/SKILL.md in place; the cut keeps in skill/SKILL.md the domain safety rule to build indexes on `orders` with `CREATE INDEX CONCURRENTLY` outside a transaction block, removes the broad "any task that touches a database" trigger from the description in favor of concrete intents plus at least one concise exclusion for a nearby task, and deletes generic material such as the novice SQL explanation and the 2024 history paragraph; and the reply reports the cut in the skill's template, with the `## <skill name>: Cut` heading, then the `Size:`, `Contract:`, a table giving each material keep, move, or deletion with its class, action, and reason, `Trigger:` naming the exclusions added, `Validation:`, and `Left untouched:` fields in that order (SKILL.md:52, :56-69, :73-92, :117-131). FAIL if it breaks any part of that rule.
