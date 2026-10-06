# Agentic techniques

Add these when the prompt drives an agent through multi-step tool work.

## Deliberate before high-stakes actions

Name the moments where the agent must stop and reason before acting:

```text
Before these actions, stop and reason through the consequences:
- Any git operation that rewrites history
- Deleting files or database records
- Moving from reading code to writing code
- Claiming a task is complete
```

## Discussion-first or action-first

If the tool both explores and executes, make the default mode explicit and
define the transition:

```text
Default to discussion. Implement only when the user asks with words such as
"implement", "build", "create", "fix", or "change".
In discussion: explain options, ask questions, suggest approaches.
In action: implement directly, verify, report results.
```

## Status updates

For multi-step workflows, define how progress is reported:

```text
After each major step, report what was completed, what is next, and any
blocker or decision needed. Do not add "Update:" headings, repeat context the
user already has, or announce work before doing it.
```
