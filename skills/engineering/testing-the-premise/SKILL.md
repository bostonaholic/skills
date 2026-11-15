---
name: testing-the-premise
description: Writes down the premise that repeated failed fixes share and tests it before any further fix that assumes it. Use when the user says "test the premise", or when a second fix to the same failure has not worked, such as a limit, timeout, pool size, or retry count raised again while the error persists. Never infer from one failed fix. Not for a first diagnosis; use fixing-root-causes.
---

# Test the Premise

When two or more fixes that share one premise fail the same check, suspect
the premise, not the fixes. Each failed fix is evidence against the belief it
assumed. A third fix on that belief spends effort where the evidence says the
cause is not.

1. **Write the premise down.** State in one sentence what every failed fix
   assumed. List each fix and the check it failed.
2. **Pick an observation that splits it.** Name one observation that comes
   out differently if the premise is false. Look at how the failures are
   distributed (which inputs, runs, files, hosts, or times fail), not only at
   how large they are.
3. **Make it rerunnable.** Write the observation as a command or script a
   reviewer can rerun, then run it.
4. **Follow the result.**
   - Contradicts the premise: the cause is elsewhere. Find what the failures
     share that the premise did not predict, write that as the new premise,
     and return to step 2.
   - Confirms the premise: ask the next "why". The earlier fixes may have
     treated a consequence instead of the cause.
5. **Remove the condition instead of compensating for it.** If one part
   always lands on the failing side, change what puts it there. A mechanism
   that cleans up after the cause leaves it in place and adds work on every
   run.

**Stop:** do not write or recommend the next fix until the premise is
written down and tested, even when the user asks for it. Reply with the test
instead, and name candidate fixes only as outcomes of its result.

## Report

Reply with the premise, the observation and the command that makes it, its
result, the cause the result points to, and then the fix.
