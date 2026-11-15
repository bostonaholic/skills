---
type: llm
---

PASS if the reply writes down the premise both fixes share (requests wait because the pool has too few connections, so a bigger pool fixes it), says that a fourfold pool increase barely moving the error rate is evidence against that premise, proposes an observation that would come out differently if the premise were false (such as which endpoints, jobs, or threads hold connections when the error fires, how long checkouts are held, or whether a few requests leak or hold connections), gives a concrete command or script to make that observation, and makes the observation its recommended next step instead of the pool-80 change (SKILL.md:14-36). Naming pool 80 or other fixes only as outcomes of the observation's result is fine. FAIL if the reply recommends applying a pool of 80, or any other fix, now, including a reply that gives the database.yml change with caveats, or if it gives no command or script for the observation.
