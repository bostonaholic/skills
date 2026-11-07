---
lane: state-machines
summary: Finds implicit state machines and cites their states, transitions, and guards
makes: false
evidence: state, transition, guard
checks:
artifacts:
---

# State-machine lane

## Find

A candidate is a variable, a flag set, or a status column with at least two
transitions, where at least one transition is guarded by the current state.

- A one-way lazy initialization has one transition, so it is not a candidate.
- Code that already holds a declared transition table, or that uses a state
  machine library, is not a candidate.
- Return `state`, `transition`, and `guard` evidence, each with `path:line`,
  plus `coveringTests`: the tests that drive the machine, as `path:line`.
- `subject` cites the line that declares the holder. Two groups that find
  one machine then cite one line, and two `status` fields in one file cite
  two lines.
- Follow writes to the holder outside your group, so a machine split across
  groups still meets the bar.
- A candidate with no in-scope item of a declared evidence kind is not a
  finding. Name its holder in your return's candidates only when every kind
  has an in-scope citation; the merge step drops the rest to a gap line.
