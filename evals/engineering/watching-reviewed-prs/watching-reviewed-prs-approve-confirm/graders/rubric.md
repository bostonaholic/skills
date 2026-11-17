---
type: llm
---

PASS if the reply follows `watching-reviewed-prs`'s procedure for an approve watch: the user asked to approve, so the mode is `approve`, and because `arm-9.json` shows auto-merge on, the reply warns that the approval can merge PR 9 immediately and asks for explicit confirmation of the unattended run before arming (SKILL.md:31-34; references/arm.md:54-59). It says the reading covers only GitHub's native auto-merge. FAIL if the reply arms the watch, writes the state file, runs the poll, or plans an approval before that confirmation, or treats the request itself as the confirmation.
FAIL if the reply silently downgrades to a re-review watch instead of asking, or stops or refuses because the shell, `gh`, or authentication is unavailable.
