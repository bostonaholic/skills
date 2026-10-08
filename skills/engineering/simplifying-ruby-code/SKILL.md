---
name: simplifying-ruby-code
description: Finds over-engineered Ruby and Rails code (stateless service objects, behaviorless value objects, class-method-only classes, deep inheritance, needless metaprogramming) and rewrites it with Hash, Struct, Data, modules, and pure functions, or reports findings when asked to review. Use when writing, refactoring, or reviewing Ruby or Rails classes, service objects, gems, or a branch diff, or when tests need heavy mocking. Not for a broad Rails tech-debt audit; use auditing-rails-tech-debt.
---

# Simplifying Ruby Code

Prefer plain data (Hash, Array, Struct, Data) and pure functions over classes
that add no state or behavior. Separate decisions from effects: a decision
takes data and returns data; an effect does I/O (database, network, files,
time). Keep them in separate methods or modules so decisions test without
mocks.

When the user asks for a review, report findings and edit nothing unless
they ask. Cite patterns by number ("Pattern 1") or by anti-pattern name.

## Patterns

1. **Command objects to module functions.** A class whose only public
   method is `call`, `perform`, `run`, or `execute`, holding nothing beyond
   its constructor arguments, becomes a direct call or a module function
   (`UserCreator.new(params).call` becomes `User.create(params)`). Keep the
   object when it holds state across calls, runs a multi-step algorithm
   worth naming, or must be serialized, as a background job is.
2. **Value objects to Data, Struct, or Hash.** A class that only stores
   attributes, with hand-written `initialize`, readers, or `==` and no
   behavior or validation:

   | Use          | When                                                 |
   | ------------ | ---------------------------------------------------- |
   | Hash         | Transient data, varying keys, JSON in or out         |
   | Struct       | Fixed attributes, mutation acceptable                |
   | Data         | Fixed attributes, immutable (check `ruby -v` >= 3.2) |
   | Custom class | Validation, invariants, or real domain behavior      |

3. **Class-method-only classes to modules.** A class never instantiated,
   defining only `self.` methods, becomes a module with `module_function`.
4. **Deep inheritance to composition.** More than 2 levels counting only the
   project's own classes (framework and stdlib bases such as
   `ApplicationRecord` or `StandardError` do not count), or an abstract base
   with a single subclass.
5. **Missing Ruby protocols.** Callers unpack a collection-like or
   value-like class by hand instead of it implementing `each` with
   `Enumerable`, `to_h`, `<=>` with `Comparable`, or `hash` and `eql?`.
6. **Mixed decisions and effects.** Tests need heavy mocks, or a method
   computes and writes in one body. Extract the computation into a pure
   function and leave a thin method for the I/O.

## Rails anti-patterns

- **Service objects:** a single-method, stateless service belongs in a model
  method or module function (Pattern 1). Keep complex orchestration as a
  service but separate decisions from effects (Pattern 6). Jobs are
  legitimate objects because they serialize.
- **Models:** keep ActiveRecord models as classes; move business
  calculations into pure functions.
- **Concerns:** a concern shares behavior across models; flag one used as a
  dumping ground for a single model.
- **Helpers:** view formatting only; business rules go in a module.
- **Reinvented Rails:** custom DSLs or base classes that duplicate scopes,
  validations, callbacks, enums, or `ActiveModel`.

## Plain Ruby anti-patterns

- **Template methods:** a base class with hook methods where a block would do.
- **Builders:** for objects that keyword arguments or `Data.define` build
  directly.
- **Wrappers:** classes that wrap Array, Hash, Set, or another stdlib type
  and forward most calls.
- **Metaprogramming:** `method_missing`, `define_method`, or `instance_eval`
  DSLs where plain methods work.
- **Dependencies:** a gem pulled in for a few lines of stdlib code.

In a gem, every public constant is API that other projects may call.

## Before removing or inlining a class

Account for every caller, not only constant references
(`rg -n '\bClassName\b'`). Also search string references (`"ClassName"`,
`constantize`, `const_get`, `send`), `perform_later` and job config,
`config/routes.rb`, `config/*.yml`, and gemspec and executable files. In a
review, drop or downgrade a finding whose callers you cannot account for.

## Review findings

Default shape, to adapt: findings grouped as **Critical** (causes or hides
bugs, forces heavy mocking, or is copied across many files) then
**Improvement**. Each finding gives its pattern, `file:line`, the problem
and its callers, before and after code, complexity (S: one file, no caller
changes; M: several files, same public API; L: public API, many callers, or
persisted data or jobs), and migration steps. End with a recommended order:
critical first, then lowest complexity.

## Refactoring

Get a green test baseline first. Apply one pattern at a time and run the
suite after each; on failure, fix or revert that step before continuing.
Update tests that mocked the removed layer to call the pure function or the
direct API instead.
