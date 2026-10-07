---
name: simplifying-ruby-code
description: Identifies over-engineered Ruby (stateless command objects, behaviorless value objects, class-method-only classes, deep inheritance, missing protocols) and rewrites it with Hash, Struct, Data, modules, and pure functions. Use when writing, refactoring, or reviewing Ruby classes or service objects, or when tests need heavy mocking.
---

# Simplifying Ruby Code

Prefer plain data (Hash, Array, Struct, Data) and pure functions over classes
that add no state or behavior. Separate decisions from effects: a decision
takes data and returns data; an effect does I/O (database, network, files,
time). Keep them in separate methods or modules so decisions test without
mocks.

Cite patterns by number ("Pattern 1") in reviews.

## Pattern 1: Command objects to module functions

Detect: a class whose only public method is `call`, `perform`, `run`, or
`execute`, with no state beyond its constructor arguments, or a service that
wraps a single operation.

```ruby
# Before
class UserCreator
  def initialize(params); @params = params; end
  def call; User.create(@params); end
end

# After
User.create(params)
```

Keep the object when it holds state across calls, runs a multi-step algorithm
worth naming, or must be serialized (a background job).

## Pattern 2: Value objects to Data, Struct, or Hash

Detect: a class that only stores attributes, with hand-written `initialize`,
readers, or `==`, and no behavior or validation.

```ruby
Point = Data.define(:x, :y)   # immutable, value equality; Ruby 3.2+
Point = Struct.new(:x, :y)    # mutable
point = { x: 10, y: 20 }      # transient data or a JSON boundary
```

| Use          | When                                                 |
| ------------ | ---------------------------------------------------- |
| Hash         | Transient data, varying keys, JSON in or out         |
| Struct       | Fixed attributes, mutation acceptable                |
| Data         | Fixed attributes, immutable (check `ruby -v` >= 3.2) |
| Custom class | Validation, invariants, or real domain behavior      |

## Pattern 3: Class-method-only classes to modules

Detect: a class that is never instantiated and defines only `self.` methods.
Replace it with a module using `module_function`.

## Pattern 4: Deep inheritance to composition

Detect: an inheritance chain more than 2 levels deep counting only the
project's own classes (framework and stdlib bases such as `ApplicationRecord`
or `StandardError` do not count), or an abstract base class with a single
subclass. Share behavior through modules, or collapse the single-subclass
hierarchy.

## Pattern 5: Missing Ruby protocols

Detect: collection-like or value-like classes that callers unpack by hand.
Implement the protocol instead:

- `each` plus `include Enumerable` for collections
- `to_h`, `to_a`, `to_s`, `to_json` for conversion
- `<=>` plus `include Comparable` for ordering
- `hash` and `eql?` for use as Hash keys

## Pattern 6: Mixed decisions and effects

Detect: tests that need extensive mocks or stubs, or methods that compute and
write in the same body. Extract the computation into a pure function that
takes data and returns data, and leave a thin method that performs the I/O.

## Refactor safely

Steps 1 and 2 run in subagents, launched together, per the
[step delegation rules](shared/step-delegation.md); steps 3 and 4 are an edit
and re-run loop and stay inline.

1. Find every caller before inlining or deleting a class:
   `rg -n '\bClassName\b'`, plus string references (`"ClassName"`,
   `constantize`, job and YAML config). Use one read-only `sonnet` subagent per
   class, at most 4 in flight, given the class name and its `file:line`; each
   returns every reference with `file:line` and its kind (constant, string,
   config).
2. Run the test suite for a green baseline in one read-only subagent given the
   test command. It returns the pass, fail, and error counts and each failing
   test with `file:line` and its first error line.
3. Apply one pattern at a time. Run the suite after each step; on failure, fix
   or revert that step before continuing.
4. Update tests that mocked the removed layer to call the pure function or the
   direct API instead.
