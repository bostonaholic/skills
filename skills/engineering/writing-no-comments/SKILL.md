---
name: writing-no-comments
description: 'Bans source comments outside a short keep list in code the agent writes or edits. Use when the user says "no comments", or when about to write or edit code, tests, scripts, or config: load it before the first code edit of every task, including code a subagent writes. Not for cleaning existing comments. The user runs removing-comments.'
---

# Writing no comments

- Add no comment to code you write or edit unless the [code comments rules](shared/code-comments.md) keep it. When unsure, add none.
- Put the reason in a name, a type, an assertion, or a test. If none can hold it, give it in the commit message or the reply.
- Tests and scripts get no step or phase narration.
- Leave comments on lines you do not change. Fix or delete a comment your change makes false.
- Give this rule to a subagent that writes code for you, and check its diff before you accept it.
- Add a comment the user asks for, as asked.
