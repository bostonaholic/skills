# Section guidance

Rules and examples for each section in the section order. Skip sections that do
not apply.

## Contents

- 1. Identity and role
- 2. Mission and stop criteria
- 3. Communication style
- 4. Core workflow
- 5. Tool usage rules
- 6. Domain-specific rules
- 7. Safety and constraints
- 8. Edge cases and error handling
- 9. Examples
- 10. Runtime context

## 1. Identity and role

- Name the specific role and competence level, not "AI assistant".
- Anchor the relationship ("pair-programs with the user", "supports a team of
  ...").
- Keep it to 1-5 lines, usually opening with "You are ...".

Good:

```text
You are a senior backend engineer specializing in distributed systems.
You pair-program with the user to design and implement reliable services.
```

Bad:

```text
I am an AI assistant designed to help users with a wide range of tasks
including but not limited to programming, writing, and analysis...
```

## 2. Mission and stop criteria

State what "done" means and when to stop and ask instead of continuing. For
autonomous agents, prefer action over confirmation and ban needless check-ins
("let me know if that's okay").

```text
Keep going until the user's request is fully resolved. Stop to ask only when
genuinely blocked; otherwise state assumptions and proceed.
```

## 3. Communication style

- Cap length with a number ("fewer than 4 lines"), not an adjective ("be
  concise").
- Ban the specific filler the product must avoid: preamble, recap, emojis.
- Keep code readable even when prose is terse.
- Omit "be helpful and friendly" and generic formatting rules; include only
  testable requirements.

## 4. Core workflow

Define the process, not just the goal: for example read, plan, execute, verify.
Add phase gates ("before editing, confirm the plan"), mode transitions, and a
verification step ("run tests before submitting").

## 5. Tool usage rules

```text
Call independent tools in parallel.
Prefer Read over cat, Search over grep, and Edit over sed.
Never edit a file you have not read in this conversation.
If an approach fails 3 times, stop and explain the blocker.
Describe actions to the user in plain words, not tool names.
```

## 6. Domain-specific rules

Put code style, naming, and architecture rules in their own section, each with
a bad-to-good pair:

```text
Naming:
- Bad:  genYmdStr, handleClick2, processData
- Good: generateDateString, handlePaymentClick, validateUserInput
```

## 7. Safety and constraints

Constrain security (secrets, credentials, injection), destructive operations
(deletion, force-push, production changes), scope creep, and guessing. State
each constraint plainly with its reason. Keep the list short: many rules dilute
the important ones, and rules about default behavior waste tokens.

## 8. Edge cases and error handling

Describe concrete failure scenarios and the response to each, not nested
conditionals:

```text
If a test fails after your edit, decide whether the expectation or the code is
wrong and fix that one. After 3 failed attempts, explain what you tried.
If the request is ambiguous, state your interpretation and proceed.
```

## 9. Examples

Cover response length and tone, tool-call decisions, multi-step workflows, error
handling, and at least one counter-example. Wrap each in a tag:

```xml
<example>
User: How do I add a new API endpoint?
Assistant: Create a route handler in `app/api/your-endpoint/route.ts`:
[3-4 lines of code]
Then add the corresponding type in `lib/types.ts`.
</example>

<bad-example>
User: How do I add a new API endpoint?
Assistant: Great question! There are several ways to add an API endpoint
in Next.js. Let me walk you through the options...
</bad-example>
```

## 10. Runtime context

Reserve a section for values injected at run time. Never hardcode what changes
per session.

```text
## Current Context
- Working directory: {{cwd}}
- Current file: {{active_file}}
- Git branch: {{branch}}
```
