---
lane: state-machines
summary: Finds implicit state machines, specs each one in TLA+, and checks the spec with TLC
makes: true
report: findings
evidence: state, transition, guard
checks: model-check
artifacts: .tla, .cfg
---

# State-machine lane

## Contents

- [Find](#find)
- [Make](#make)
- [Review](#review)

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

## Make

Run these steps in order. Nothing commits, so citations stay at
`scope.commit`: read cited text with `git show HEAD:<path>`, and after an
earlier `applied` edit, find the code by its cited text, not its line number.

1. **Find every transition write.** Search the whole repository for
   transition writes. A transition write is application code that moves an
   existing holder from one state to another. Constructor defaults,
   hydration from storage, migrations, backfills, and test setup are not
   transition writes, and the refactor leaves them unchanged.
2. **Name the spec.** `<Module>` is a PascalCase name for the holder. Specs
   go in the directory that already holds `.tla` files, else `specs/tla/`.
   When a spec of that name exists there, ignoring case, add the lowest free
   number, as in `OrderStatus2`. Never reuse or replace an existing spec.
3. **Write `<Module>.tla` and `<Module>.cfg`.** Model the code as it is now.
   `Init` holds every state that code creates the holder in. Each cited
   transition becomes one action, with the guard the code has. The `.cfg`
   names `INIT`, `NEXT`, and, under `INVARIANTS`, `TypeOK` plus at least one
   invariant that can fail.
4. **Add a history variable.** When the holder is the only variable, every
   reachable value already sits in the type set, so no state predicate on
   the holder alone can reject an illegal step. Add a history variable `prev`
   that each action sets to the old state, and write the invariant over
   `prev` and the holder, for example
   `NoSkip == ~(prev = "pending" /\ s = "shipped")`.
5. **Check it.** Run
   `node <skill-dir>/scripts/run-tlc.mjs <spec.tla> <run>/tlc/<id>/<k>.json`,
   with a new result file `<k>` for each run. On a parse error, repair the
   spec and run again, at most 3 runs per finding.
6. **Keep a counterexample.** A counterexample stands unless its trace
   contradicts a cited line. Never drop or weaken an invariant, tighten a
   guard, or narrow `Init` to reach `pass`. The trace is a report item, and
   the code keeps its behavior.
7. **Mark an unchecked spec.** A spec whose last result is not `pass` or
   `fail` starts with `\* UNCHECKED: <reason>`.
8. **Refactor** only when the baseline passed, `coveringTests` is not empty,
   and every transition write sits in the scope and outside `gaps`.
   Otherwise skip to the return, with `reason` naming the gate that failed,
   such as the transition write outside the scope.
   - Make the machine explicit in the target language: one declared set of
     states, one transition table, and one function that applies it. Every
     transition write goes through that function. State and action names
     match the spec. Add no dependency.
   - Keep persisted values, public names, error messages, side effect order,
     and transaction boundaries unchanged. A transition the code ignores
     today stays ignored; raising an error on an unlisted transition changes
     behavior, so describe it in `proposedChange` instead.
   - Never edit a test, a fixture, or test configuration. A refactor that
     needs such an edit turns red and ends `proposed`.
   - Add no comment to the code you refactor, and fix or delete a comment
     the refactor makes false.
9. **Return** `status: complete` with both spec paths under `artifacts`, the
   explicit machine under `proposedChange`, the last result file as the
   `model-check` check, and `reason` empty when the refactor ran, else why
   it did not.

## Review

Give the reviewer these neutral claims to refute:

- Each spec action maps to a cited transition.
- Each cited transition maps to a spec action.
- Each spec action has the same guard as the code before the refactor, and
  `Init` holds every state that code creates the holder in. Hydration from
  storage does not count.
- The refactored code has the same transitions, guards, side effect order,
  and transaction boundaries as its copy under `before/`.
- Every transition write, anywhere in the repository, goes through the one
  transition function.
- Each `coveringTests` entry drives the machine, and the command in
  `tests.json` runs it.
- At least one invariant other than `TypeOK` can fail on a state that the
  type set allows.
- No path in `changed` is a test, a fixture, or test configuration.

For a rejected finding, the main session adds `\* UNCHECKED: <reason>` as the
first line of each spec this finding's make step wrote.
