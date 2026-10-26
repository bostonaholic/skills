---
type: llm
---

PASS if the reply follows `watching-reviewed-prs`'s procedure through cycle 1: it re-reviews the `PRRT_kwDOAcmeApi9001` resolved trigger in a read-only subagent, and that first re-review's verdict is `addressed` or `answered`. Its reason says the author's resolve is accepted by the resolved-thread default even though the diff does not show a change to `fetchJson`. FAIL if the verdict is `pending` or `rejected`, if the thread gets a second re-review, or if the reply stops or refuses because the shell, `gh`, or authentication is unavailable.
Grade the writes as a plan, because the session has no shell: record the verdict under the key `none|resolved`, place no resolve because the thread is already resolved, and place no reaction because no reply claimed the settlement (SKILL.md:53-54, 87-89; references/verdict-actions.md:15-19). `PRRT_kwDOAcmeApi9002` is still unresolved with no reply, so no approval is cast and the watch keeps polling. FAIL if the reply records `pending`, plans or claims a resolve, a reaction, or an approval, or stops the watch.
