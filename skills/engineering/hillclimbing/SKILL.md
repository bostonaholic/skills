---
name: hillclimbing
description: Iterates toward a goal one measured change at a time, keeping what raises the score and reverting what does not, until a fresh run of the check proves the completion criteria met. Use when the user gives a goal and completion criteria and asks to hillclimb, iterate, or keep going until they pass.
---

# Hillclimbing

## 1. Fix the check before the first change

- Turn the criteria into a check with a pass or fail result and a score that
  moves as the work gets closer.
- Record, verbatim: the goal and criteria as stated, the check and its
  threshold, guardrails (checks that pass now and must still pass), and the
  budget, only if the user gave one.

If a criterion cannot be made checkable, ask once, now, and propose a check.
This is the only planned question.

Run the check and guardrails for a baseline. If the check already passes,
report that and stop. Keep the record and iteration log in a progress file
outside the working tree, and reread it after a context reset.

## 2. Climb

Each iteration:

- Make one change chosen from the last run's evidence, small enough to trace a
  score change to it.
- Rerun the check and guardrails.
- Keep it only if the score improved and every guardrail passes; otherwise
  revert it exactly.
- Log one line: change, score, kept or reverted.
- Keep the best state recoverable.
- Never ask whether to continue between iterations.

A noisy score needs several runs per measurement; compare medians.

After three iterations without gain, name the assumption every failed attempt
shares and take a larger step that drops it. Never retry a reverted change. A
plateau is not a reason to stop.

## 3. Never move the goalposts

To reach the criteria, never:

- edit, skip, delete, or loosen a test, assertion, threshold, or the check
- special-case the check's inputs, such as hardcoded expected outputs
- suppress what the check reports, such as swallowed errors or bypassed hooks
- narrow the check to a subset or smaller sample

A wrong check (a test asserts the old bug) is a blocker for the user, not a
change to make.

## 4. Stop only on one of these

1. **Met.** Rerun the full check and every guardrail fresh, from the final
   state. They pass. An earlier pass, a subset, or a partial run does not
   count.
2. **Budget spent.** The user's stated budget, never one invented here.
3. **Blocked on the user.** The next step needs a permission, a credential, a
   destructive or outward-facing action that needs confirmation, a choice
   between conflicting criteria, or a fix to a wrong check. Or the criteria
   are provably unreachable: name the constraint and the measurement or source
   that proves it. "Hard" and "many attempts failed" are not proof. Finish
   every step that does not depend on the blocker first.

Final report, adapted as needed:

```text
Status: met | budget spent | blocked: <what is needed from the user>
Score: <baseline> -> <final> (threshold <threshold>)
Check: <command>
<its output from the final run>
Iterations: <n> (<kept> kept, <reverted> reverted)
```
