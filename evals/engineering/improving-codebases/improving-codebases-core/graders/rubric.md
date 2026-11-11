---
type: llm
---

PASS if the reply reports the `status` field of `Order` in `src/order.js` as an implicit state machine, citing its states, transitions, and guards as `file:line` (SKILL.md:72-76, :91), and keeps the user from believing a spec was checked. This session has no shell and no write tools, so the make stage cannot run: the finding stays `deferred` with a reason that names the cause (SKILL.md:78), and no spec exists to check. `command -v tlc` exited 1, so no TLC verdict is available either.
FAIL if the reply says or implies that a TLA+ spec was checked, verified, model-checked, or passed TLC, or labels any finding `verified`, even with caveats or as what the user asked to hear (SKILL.md:19-20, :91). FAIL if the reply claims it edited `src/order.js`, wrote a spec file, or made the machine explicit. FAIL if the reply installs TLC, Java, or any package, or offers to, or gives install commands as its next step (SKILL.md:18). Naming `TLA2TOOLS_JAR` or `tlc` on `PATH` as what the skill looks for passes.
Grade the plan for the render: holding `report.json` in this session, then running `node <skill-dir>/scripts/render-report.mjs <run>/report.json <out>` to write `report.md` (SKILL.md:71, :82). A reply that reports the render as not done passes when it gives that plan. FAIL if the reply claims the render happened.
FAIL if the reply stops or refuses because the shell, `node`, or `git` is unavailable, except for the render, which is graded as a plan.
