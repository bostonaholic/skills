---
name: choosing-determinism
description: Moves each step of an agent skill whose correct result is fixed by its inputs into a script the skill runs, leaving the model only judgment. Use when creating a skill, or adding or changing its steps, commands, or parsing. Not for trimming a skill; use cutting-skills.
---

# Choosing Determinism

Always choose determinism where determinism is an option. A step the model
performs varies between runs, spends tokens on every run, and cannot be
tested. A script gives the same output for the same input, costs almost
nothing to run, and has tests. A skill hands the model only what needs
judgment and calls a script for the rest.

## Sort every step

Read the whole skill: `SKILL.md`, its references, and its scripts. For each
step, ask: given the same inputs, must two correct runs produce the same
result? If yes, the step is deterministic.

| Deterministic: script it                                    | Judgment: leave to the model                  |
| ----------------------------------------------------------- | --------------------------------------------- |
| Fetching, filtering, sorting, counting, or deduplicating    | Choosing among options or weighing trade-offs |
| Parsing command output, files, or structured data           | Interpreting ambiguous intent or prose        |
| Fixed command sequences, above all ordered or destructive   | Writing or reviewing prose and code           |
| Resolving paths, names, dates, ages, versions, or IDs       | Deciding whether a finding matters            |
| Checking a format, schema, or precondition                  | Explaining a result to the user               |
| Rendering output whose exact layout a person or parser uses | Drafting a message whose wording must fit     |

Most steps are mixed. Split them: a script gathers and normalizes the inputs,
the model decides, and a script applies or renders the decision. Shrink the
model's part to the piece that needs judgment.

Prefer, in order: an existing tool's structured mode (a `--json` flag, a query
filter, a plumbing command) inside a script; a new script in the skill's
`scripts/`; model reasoning last.

## Signs a step belongs in a script

- A fenced block of several commands for the agent to retype. It retypes them
  with variations.
- "Run X and find the ones where...": the model filters by reading output.
- A number, pattern, or threshold the model must apply to many items.
- Prose explaining how to parse, compute, or format something exactly.
- A step repeated once per item.
- A warning to be careful ("make sure to always"), which marks a step the
  model gets wrong.

## Writing the script

- One job per script, named for it. Use the language the collection's other
  scripts use; with none, POSIX shell for command sequences and a
  dependency-free single file for parsing.
- A header comment states usage, arguments, output format, and every exit
  code.
- Take every input as an argument or on stdin. Never prompt. Read the clock,
  randomness, or the environment only when that value is the point, and accept
  an override so tests can pin it.
- Print stable, machine-readable output: JSON or fixed-format lines, in a
  defined order, with no prose for the model to reparse.
- Fail loud: check required tools first, name each error on stderr, and exit
  non-zero. Never succeed on empty or malformed input.
- Make writes idempotent, so a rerun after a failure is safe.
- Say in a comment why each constant has its value.
- Test it with synthetic inputs, each error path included.

## Wiring it into SKILL.md

Write "Run `scripts/<name> <args>`", then what to do with each output and exit
code. Do not restate in prose what the script does; its header documents it.
When a step a script covers changes, change the script and its tests, not the
prose around it.

## When determinism is not an option

Leave a step to the model only when its correct result depends on judgment the
inputs do not fix. When a step looks scriptable but stays with the model, give
the reason in one line so the next editor does not script it. Do not fake
determinism: a script that guesses at meaning, such as a keyword list standing
in for reading code, is worse than the model reading it, unless that keyword
list is the author's actual rule.

## Report

List each step moved to a script, each script added or changed with its tests,
and each scriptable-looking step left to the model with its reason.
