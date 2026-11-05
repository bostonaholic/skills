# Playbook template

The section headings and their order are exact, so an on-call agent finds
each one in every playbook. The content inside each section adapts to the
incident. `(line N)` cites the normalized transcript. Angle brackets mark a
value that varies per incident; everything else is the value the session
used.

```markdown
# Playbook: <alert name as it fires>

Service: <service or component>. Written from the session of <date>; transcript
lines <first> to <last>. Runs so far: none, dry run pending.

## Trigger

- Alert: `<exact alert name>` from <alerting system>.
- Symptoms that mark this failure, as the session saw them: <symptom> (line N).
- Not this playbook when: <look-alike symptom and the check that tells them
  apart> (line N).

## Check

1. `<command the session ran>` shows <what it reports> (line N).
   - <result pattern the session saw>: this failure; continue.
   - <other result>: not this failure; escalate.
2. ...

## Root cause

<What was wrong, in plain words.> Confirmed by <the check whose result
settled it> showing <the result> (line N).

## Ruled out

- <hypothesis>: `<command>` showed <result> (line N).

## Fix

1. `<command the session ran>` (line N). Expected output: <what the session
   saw>. If instead <other output>: <what the session did, or escalate>.
2. ...

Rollback: <how to undo the fix, when it can be undone>.

Permanent fix: <the change that removes the root cause, with its PR or
ticket> or none yet; this playbook mitigates until one lands.

## Verify

- Signal: <metric or query> read from <monitoring system>, not from the fix
  command's output.
- Wait <duration>, then read it again. Clear when: <condition>.
- Observed: <the reading the session took> (line N). Or `[not observed]`: the
  session confirmed the fix by <what it did>; the signal above is proposed and
  must be confirmed on the first dry run.

## Escalate

- Time budget: <duration> from pickup to a clear signal.
- Stop and page a person when a Check result matches no branch, a Fix step
  fails, or the signal is not clear after the wait.
- Hand over: each command run, each result, the signal's latest reading, and
  the transcript lines this playbook came from.
- `[not run]`: <a check or fix the session did not run but that the
  escalating person may want> (optional).

## Repeat limit

Runs more than three times in a week: open a ticket with the team that owns
<service> for the permanent fix. Once the root cause is gone, delete this
playbook.
```
