---
name: cr
description: Starts a reviewing-code review of an optional diff target, as a short alias for that skill. Use when the user explicitly invokes cr, optionally followed by a branch, PR, commit range, or pasted diff. Never infer from a plain review request; reviewing-code handles that.
disable-model-invocation: true
---

# Code review shortcut

Call the Skill tool with `reviewing-code`, per [skill call rules](shared/skill-calls.md). Pass the text the user typed after `cr`, unchanged, as the diff target. If the user typed nothing after it, pass no target.

`reviewing-code` owns the review. Add nothing after its report or its own stop message, and copy none of its rules here.

If `reviewing-code` is not installed, do not review the code yourself. Print one line saying so, naming the skill to install, and stop.
