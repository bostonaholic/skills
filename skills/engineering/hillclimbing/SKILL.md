---
name: hillclimbing
description: Iterates toward a goal one measured change at a time, keeping what raises the score and reverting what does not, until a fresh run of the check proves the completion criteria met. Use when the user gives a goal and completion criteria and asks to hillclimb, iterate, or keep going until they pass.
---

# Hillclimbing

Climb toward the goal in measured steps, and do not stop until the completion
criteria are met and proven. "Good progress", "mostly passing", and "should
work now" are not done.

## 1. Fix the check before the first change

Turn the completion criteria into a check: a command or procedure with a
pass or fail result, plus a score that moves as the work gets closer (failing
test count, p95 latency, eval pass rate, error count). Record, verbatim:

- the goal and criteria as the user stated them
- the check and its passing threshold
- guardrails: checks that pass now and must still pass at the end (the rest of
  the test suite, the build, type checks)
- the budget (iterations, time, or cost), only if the user gave one

If a criterion cannot be made checkable, ask once, now, and propose a check.
This is the only planned question.

Run the check and guardrails to record the baseline. If the check already
passes, report that and stop.

Keep the record and the iteration log in a progress file outside the working
tree, or at a path the user names, and reread it after any context reset. The
loop outlives the conversation's memory of it.

## 2. Climb

Each iteration:

1. Pick the change with the best expected gain from the evidence of the last
   run: the failure message, the profile, the diff. Not a guess.
2. Make one change, small enough that a score change can be traced to it.
3. Rerun the check and the guardrails.
4. If the score improved and every guardrail passes, keep the change.
   Otherwise revert it exactly and note why it failed.
5. Append one line to the log: iteration, change, score, kept or reverted.

Keep the best state so far recoverable (a commit, branch, or patch), so any
attempt can be abandoned. Never ask whether to continue between iterations;
report progress in passing and keep going.

A noisy score (benchmarks, flaky tests, sampled evals) needs several runs per
measurement; compare medians. One lucky run is not an improvement, and one
lucky pass is not done.

## 3. Break plateaus, never repeat

After three iterations in a row without gain, stop taking small steps: three
rules out one bad pick and noise without spending the budget on a dead end.
Reread the log, name the assumption every failed attempt shares, and take a
larger step that drops it (a different algorithm, design, or root cause). Never
retry a reverted change. A plateau is not a reason to stop.

## 4. Never move the goalposts

The criteria are fixed. To reach them, never:

- edit, skip, delete, or loosen a test, assertion, threshold, or the check
- special-case the check's inputs: hardcoded expected outputs, benchmark
  detection
- suppress what the check reports: swallowed errors, disabled lint rules,
  bypassed hooks
- narrow the check: a subset of tests, a smaller sample, changed config

If the check itself is wrong (a test asserts the old bug), that is a blocker
for the user, not a change to make.

## 5. Stop only on one of these

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

Final report (a default to adapt):

```text
Status: met | budget spent | blocked: <what is needed from the user>
Score: <baseline> -> <final> (threshold <threshold>)
Check: <command>
<its output from the final run>
Iterations: <n> (<kept> kept, <reverted> reverted)
```
