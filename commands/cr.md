---
description: Start a reviewing-code review of the optional diff target.
argument-hint: "[<diff target>]"
disable-model-invocation: true
---

# Code review shortcut

Call the Skill tool with `reviewing-code`. Pass the text the user typed after the command, unchanged, as its arguments. If the user typed nothing after the command, pass no arguments.

`reviewing-code` owns the review. When it runs, add nothing after its report or its own stop message.

If there is no Skill tool, or the Skill call fails, do not review the code yourself. Never read a `SKILL.md` file by path. Instead, print one line that names the failure and the next step, `/reviewing-code <target>`, with the typed text as `<target>`. Then stop.
