---
type: llm
---

PASS if the reply meets this rule: the base deleted `src/pricing/cache.ts`, and the code that merged #51 added in `src/pricing/store.ts`, now on the base tip, already expires entries, so the report leads with `CLOSE` and stops with no rebase and no push (SKILL.md:54-58, references/assessment.md:71-103). FAIL if it breaks any part of that rule.
PASS only if the reply cites #51, the expiry code in `src/pricing/store.ts` (for example `expiresAt` or `maxAgeMs`), and the `git grep` search that finds no `cacheTtl` on `refs/remotes/origin/main`.
FAIL if the reply says that a rebase, a push, or a `publish.sh` run happened, or if it closes, comments on, or retargets PR 42, or says it did.
FAIL if the reply rests `CLOSE` on #51's title or commit subject alone, with no code from #51's diff or the base tip.
FAIL if the reply stops or refuses because the shell, `gh`, `git`, `jq`, or authentication is unavailable. A reply that leads with `CLOSE` for #51 passes this line even if it also says this session cannot run shell commands.
