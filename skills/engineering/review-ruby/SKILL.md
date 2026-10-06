---
name: review-ruby
argument-hint: "[file paths, directory paths, branch name, or focus area]"
description: "Use for reviewing or auditing Ruby or Rails code for over-engineering, including simplifying Ruby classes or Rails services and choosing Hash, Struct, or Data over unnecessary classes."
---

# Ruby Code Review & Refactoring Guide

Analyze Ruby code for unnecessary custom objects, class bloat, and insufficient usage of Ruby's generic data structures. Provide specific refactoring steps with before/after code examples for Rails apps, libraries, gems, CLI tools, and other Ruby applications.

## Scope Determination

Rails is detected when the project's `Gemfile` declares the `rails` gem.

Determine scope from the user's request:

- **File paths** (e.g., `lib/parser.rb`, `app/models/user.rb`): analyze only those files
- **Directory paths** (e.g., `lib/services/`, `app/services/`): analyze all Ruby files in that directory
- **Branch name**: compare current branch against it to review only changed files
- **No scope specified**: perform full codebase audit of `app/` when Rails is detected, otherwise `lib/`
- **Focus area** (e.g., "service objects", "value objects", "data structures"): prioritize that aspect

## References

Read [simplifying patterns](references/patterns.md) before analyzing and apply them throughout. When Rails is detected, also read [Rails considerations](references/rails.md) and scan for its anti-patterns. Cite the pattern behind each finding by its heading (e.g., "Command Objects → Module Functions").

## Anti-Patterns to Scan

### Unnecessary Class Hierarchies

- Deep inheritance for simple behavior → modules/composition. Flag three or more app-defined classes in one ancestor chain (e.g., `Dog < Mammal < Animal`). Do not count framework or stdlib bases such as `ActiveRecord::Base`, `ApplicationRecord`, `ApplicationController`, `ApplicationJob`, or `StandardError`.
- Abstract base classes with single implementations
- Classes that could be modules or simple functions
- Template method pattern where blocks would suffice

### Over-Engineered Data Objects

- Custom classes for simple data pairs (coordinates, ranges, tuples) → Struct/Data/Hash
- Value objects without behavior, validation, or transformation → Struct/Data/Hash
- Missing Ruby protocol implementations (`each`, `to_h`, `to_a`, `to_json`, `to_s`) → add protocols
- Mutable objects where immutable would work

### Stateful Objects Where Functions Would Work

- Single-method classes (`call`, `run`, `execute`, `perform`) → module function
- Services with no state or instance variables → module function
- Services that only wrap another method or a single operation → direct call
- Classes with only class methods, or stateful utility classes → module
- Stateful service objects that could be pure functions
- Builder patterns for simple object construction

### Complexity That Could Be Simplified

- Custom DSLs that reinvent Ruby syntax
- Wrapper classes around standard library
- Complex metaprogramming where simple code would work
- Unnecessary dependencies (pulling in gems for simple tasks)
- Tests that need heavy mocking → separate decisions from effects

## Output Format

For each issue found, provide:

1. **File and location** with line numbers
2. **Problem** — why it violates simplicity principles
3. **Before code** — current implementation
4. **After code** — refactored version
5. **Migration steps** — how to safely refactor
6. **Test considerations** — what tests need updating

Structure findings into: Critical Issues (fix first), Improvements (consider for refactoring), Good Patterns Found, and Summary with recommended refactoring order and estimated complexity.
