---
name: reviewing-ruby-code
argument-hint: "[file paths, directory paths, branch name, or focus area]"
description: Reviews plain Ruby code (gems, libraries, CLI tools, lib/, or a branch diff) for over-engineering such as single-method classes, behaviorless data objects, and needless metaprogramming, reporting file:line findings with before/after code. Use when the user asks to review, audit, or simplify non-Rails Ruby. For Rails apps use reviewing-rails-code.
---

# Ruby Simplicity Review

Find unnecessary classes and abstractions in plain Ruby (gems, libraries, CLI
tools) and report each
with a concrete refactoring. Report only; edit code only if the user asks.

Copy this checklist and check off each step:

```text
- [ ] 1. Resolve the scope and list the files
- [ ] 2. Load simplifying-ruby-code (or use the fallback patterns)
- [ ] 3. Scan each file for the anti-patterns
- [ ] 4. Grep callers for every removal or inlining candidate
- [ ] 5. Classify each finding by severity and complexity
- [ ] 6. Write the report from the template
```

Steps 3, 4, and 6 run in subagents per the
[step delegation rules](shared/step-delegation.md); steps 1, 2, and 5 stay
inline.

## 1. Resolve the scope

| Request                        | Files                                                              |
| ------------------------------ | ------------------------------------------------------------------ |
| File paths                     | Those files                                                        |
| Directory                      | `git ls-files -- '<dir>/*.rb'` (the `*` also matches nested paths) |
| Branch name                    | `git diff --name-only --diff-filter=d <branch>...HEAD -- '*.rb'`   |
| Nothing specified              | `git ls-files -- 'lib/*.rb'`; if empty, `git ls-files -- '*.rb'`   |
| Focus area ("command objects") | The full-audit list, examining that pattern first                  |

## 2. Load the patterns

Call the Skill tool with `simplifying-ruby-code` and cite its pattern numbers
in findings. If it is missing, use these patterns and tell the user to install
it with `npx skills@latest add bostonaholic/skills --skill simplifying-ruby-code`:

1. Command objects to module functions
2. Value objects to Data, Struct, or Hash
3. Class-method-only classes to modules
4. Deep inheritance to composition: more than 2 levels of the project's own
   classes (framework and stdlib bases such as `ApplicationRecord` or
   `StandardError` do not count), or an abstract base with one subclass
5. Missing Ruby protocols (`each` with Enumerable, `to_h`, `<=>` with
   Comparable)
6. Mixed decisions and effects (tests need heavy mocking)

## 3. Ruby anti-patterns

- **Template methods:** a base class with hook methods where passing a block
  would do.
- **Builders:** builder classes for objects that keyword arguments or
  `Data.define` construct directly.
- **Wrappers:** classes that wrap Array, Hash, Set, or another stdlib type and
  forward most calls.
- **Metaprogramming:** `method_missing`, `define_method`, or `instance_eval`
  DSLs where plain methods would work.
- **Dependencies:** gems pulled in for a few lines of stdlib code.

Scan in read-only `sonnet` subagents, one per directory in scope (one per file
for a short list), launched together with at most 4 in flight; give each its
files and the paths of this file and simplifying-ruby-code's `SKILL.md` when
installed. Each returns candidate findings as pattern number or anti-pattern
name, `file:line`, class or method name, and a one-sentence problem, plus good
patterns with `file:line`.

## 4. Check callers

Before reporting that a class can be removed or inlined, run
`rg -n '\bClassName\b'` and check string references (`"ClassName"`,
`const_get`, `send`, gemspec and executable files). For a gem, treat every
public constant as API that other projects may call. Drop or downgrade a
finding whose callers you cannot account for.

Run this check in read-only `sonnet` subagents, one per candidate class, launched
together with at most 4 in flight, given the class name and its `file:line`.
Each returns every reference with `file:line` and its kind (constant, string,
config) and names any it cannot account for.

## 5. Classify

- **Critical:** causes or hides bugs, blocks testing (needs heavy mocking), or
  is a pattern copied across many files.
- **Improvement:** any other finding.
- **Complexity:** S changes one file with no caller changes; M touches several
  files or call sites but keeps the public API; L changes a public API, many
  callers, or persisted data or jobs.

## 6. Report template

Use this template exactly: keep the section order and field labels, and write
"None" under an empty section. Head a finding with its pattern number and name,
or with the section 3 anti-pattern name when no numbered pattern fits.

Draft the report in one writer subagent that may write only
`<out>/simplicity-review.md` in a temporary directory, given the classified
findings, their caller reports, and this file's path; it reads each cited
location and returns the path. Check the draft against the template, then
present it.

````markdown
# Simplicity review: <scope>

## Critical issues

### 1. <Pattern N: pattern name | anti-pattern name> in `<path>:<line>`

**Problem:** <why it adds complexity; name its callers>
**Complexity:** <S | M | L>

Before:

```ruby
<current code>
```

After:

```ruby
<refactored code>
```

**Migration:**

1. <step>; run the test suite
2. <step>; run the test suite

**Tests:** <tests to update, delete, or add>

## Improvements

<same fields as Critical issues, numbering continued>

## Good patterns found

- `<path>:<line>`: <what it does well>

## Summary

| #   | Finding | Severity | Complexity |
| --- | ------- | -------- | ---------- |

Recommended order: <finding numbers, critical first, then lowest complexity>
````
