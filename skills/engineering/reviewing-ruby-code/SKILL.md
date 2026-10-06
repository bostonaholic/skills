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

## 1. Resolve the scope

| Request                        | Files                                                              |
| ------------------------------ | ------------------------------------------------------------------ |
| File paths                     | Those files                                                        |
| Directory                      | `git ls-files -- '<dir>/*.rb'` (the `*` also matches nested paths) |
| Branch name                    | `git diff --name-only <branch>...HEAD -- '*.rb'`                   |
| Nothing specified              | `git ls-files -- 'lib/*.rb'`; if empty, `git ls-files -- '*.rb'`   |
| Focus area ("command objects") | The full-audit list, examining that pattern first                  |

## 2. Load the patterns

Call the Skill tool with `simplifying-ruby-code` and cite its pattern numbers
in findings. If it is missing, use these patterns and tell the user to install
it with `npx skills add bostonaholic/skills --skill simplifying-ruby-code`:

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

## 4. Check callers

Before reporting that a class can be removed or inlined, run
`rg -n '\bClassName\b'` and check string references (`"ClassName"`,
`const_get`, `send`, gemspec and executable files). For a gem, treat every
public constant as API that other projects may call. Drop or downgrade a
finding whose callers you cannot account for.

## 5. Classify

- **Critical:** causes or hides bugs, blocks testing (needs heavy mocking), or
  is a pattern copied across many files.
- **Improvement:** any other finding.
- **Complexity:** S changes one file with no caller changes; M touches several
  files or call sites but keeps the public API; L changes a public API, many
  callers, or persisted data or jobs.

## 6. Report template

Use this template exactly: keep the section order and field labels, and write
"None" under an empty section.

````markdown
# Simplicity review: <scope>

## Critical issues

### 1. Pattern <N>: <pattern name> in `<path>:<line>`

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
