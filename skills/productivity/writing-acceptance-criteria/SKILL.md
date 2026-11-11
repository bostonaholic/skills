---
name: writing-acceptance-criteria
description: 'Writes or rewrites acceptance criteria until each is provable: one observable outcome with a named check that can fail. Use when the user says "write acceptance criteria", or asks to write, rewrite, or tighten acceptance criteria or a definition of done. Not for proving work meets them; use proving-claims.'
---

# Writing acceptance criteria

A criterion is provable when a concrete check can show it true or false. One
that no check can fail is a wish, not a criterion. Rewrite until every line
can fail.

## Rules

- One observable outcome per criterion. Split any line joined by "and" into
  separate criteria.
- State behavior a user or caller can observe, never implementation. "Keep
  access until the end of the paid period", not "call `cancel()`".
- Every criterion names its check: a test, a command, a measurement, or a
  screenshot. Give the setup, the action, and the expected result with
  concrete values (dates, counts, thresholds, the exact command).
- A criterion that still says "works", "correctly", "well", "fast",
  "intuitive", "polished", "user-friendly", "robust", or "seamless" is not
  done being written. Replace the word with the number or state it stands
  for.
- Falsify each one: say what result would make it false. If you cannot name
  that result, it is still a wish.
- A check must observe the outcome. A test that asserts a method was called,
  a passing suite with no test for this criterion, or reading a test without
  running it proves nothing.
- Finding facts is your job; choosing thresholds is the user's. Look up
  existing benchmarks, test names, and fixtures in the repository. When a
  threshold has no source, propose one and mark it `assumption`; never
  present an invented number as agreed.
- Never silently drop a vague criterion. Rewrite it, or list it under open
  questions with what the user must decide.

## Procedure

1. Read the ticket, description, or existing criteria, and the code it
   touches when the repository is available.
2. Rewrite each criterion by the rules. Keep the user's intent; add no scope.
3. Check every line: one outcome, a named check, a stated failing result, no
   vague word. Fix and recheck any line that fails.
4. Return the criteria in the format below, then ask the user to confirm
   assumptions and answer open questions.

## Output

Default format; adapt the layout, keep every field.

```markdown
## Acceptance criteria

1. <observable outcome>
   - Check: <test, command, measurement, or screenshot, with setup and action>
   - Fails if: <the result that makes it false>

## Assumptions
## Open questions
```

Example: "Cancellation works correctly" becomes "Cancelling stops future
renewal charges", checked by creating a subscription that renews on October 1,
cancelling it, and asserting no charge is due that day. It fails if a charge
is due on October 1.

## Handing the criteria to an agent

- Write the criteria before the work starts. The agent doing the work gets
  read access only: it never edits the criteria or the tests that encode
  them. The check lives outside the agent that did the work.
- When the user hands the ticket to an agent, offer this prompt exactly:

  ```text
  Implement this ticket against the acceptance criteria below.
  Do not edit the criteria or the tests that encode them.

  For each criterion, report:
  - The check you ran: the exact command, test name, measurement, or screenshot
  - The result
  - If you could not prove it, say so and stop short of claiming done

  A passing suite is not evidence for a criterion that has no check.
  Reading a test is not a passing test run.
  Do not claim done until every criterion has evidence or an explicit gap.
  ```

- A human still reviews the returned evidence. Evidence that does not observe
  the criterion's outcome goes back.
