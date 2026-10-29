---
name: choosing-determinism
description: Moves each step of an agent skill whose correct result is fixed by its inputs into a script the skill runs, leaving the model only judgment. Use when creating a skill, or adding or changing its steps, commands, or parsing. Not for trimming a skill; use cutting-skills.
metadata:
  say: "script the deterministic steps"
---

# Choosing Determinism

Always choose determinism where determinism is an option. A model step varies
between runs, costs tokens every run, and cannot be tested; a script does none
of that.

## Sort every step

Read the whole skill: `SKILL.md`, its references, and its scripts. For each
step, ask: given the same inputs, must two correct runs produce the same
result? If yes, script it.

| Deterministic: script it                                    | Judgment: leave to the model                  |
| ----------------------------------------------------------- | --------------------------------------------- |
| Fetching, filtering, sorting, counting, or deduplicating    | Choosing among options or weighing trade-offs |
| Parsing command output, files, or structured data           | Interpreting ambiguous intent or prose        |
| Fixed command sequences, above all ordered or destructive   | Writing or reviewing prose and code           |
| Resolving paths, names, dates, ages, versions, or IDs       | Deciding whether a finding matters            |
| Checking a format, schema, or precondition                  | Explaining a result to the user               |
| Rendering output whose exact layout a person or parser uses | Drafting a message whose wording must fit     |

Split mixed steps: a script gathers and normalizes the inputs, the model
decides, and a script applies or renders the decision.

Prefer, in order: an existing tool's structured mode (a `--json` flag, a query
filter, a plumbing command) inside a script; a new script in the skill's
`scripts/`; model reasoning last.

## Writing the script

- A header comment states usage, arguments, output format, and every exit
  code.
- Take every input as an argument or on stdin. Never prompt. Read the clock,
  randomness, or the environment only when that value is the point, and accept
  an override so tests can pin it.
- Print JSON or fixed-format lines in a defined order, with no prose.
- Fail loud: check required tools first, name each error on stderr, and exit
  non-zero. Never succeed on empty or malformed input. End each failure with a
  pointer to the skill file that explains it, and let a wrapped tool's own
  error text through.
- Make writes idempotent. Test with synthetic inputs, each error path included.

## Wiring it into SKILL.md

Write "Run `scripts/<name> <args>`", then what to do with each output and exit
code. Do not restate in prose what the script does; its header documents it.

## When determinism is not an option

- When a step looks scriptable but stays with the model, give the reason in one
  line so the next editor does not script it.
- Do not fake determinism: a keyword list standing in for reading code is worse
  than the model reading it, unless that list is the author's actual rule.

## Report

List each step moved to a script, each script added or changed with its tests,
and each scriptable-looking step left to the model with its reason.
