# SOLID and idiomatic-Ruby violations

Each entry gives the principle, its canonical link, the Ruby or Rails shape of
the violation, and the fix.

## Contents

- SOLID principles: Single Responsibility, Open-Closed, Liskov Substitution,
  Interface Segregation, Dependency Inversion
- Idiomatic Ruby: monkey patching, method_missing without respond_to_missing?,
  mutable constants, boolean-parameter control coupling, nil-swallowing chains,
  Comparable and Enumerable re-implementation, string-built code and eval

## SOLID principles

### Single Responsibility Principle (SRP)

- **Link:**
  [SRP](https://en.wikipedia.org/wiki/Single-responsibility_principle);
  [POODR](https://www.poodr.com/) chapter 2.
- **Ruby shape:** a class you can only describe with "and". Measure cohesion: do
  the methods use the same instance state?

**Fix:** Each responsibility in its simplest home.

### Open-Closed Principle (OCP)

- **Link:** [OCP](https://en.wikipedia.org/wiki/Open%E2%80%93closed_principle).
- **Ruby shape:** the same `case` or `if`/`elsif` over a type or kind repeated
  in several methods, so every new variant edits every switch.

**Fix:** Variants that differ only in data become one frozen table; adding a variant adds one entry.

When variants differ in behavior rather than data, apply
[Replace Conditional with Polymorphism](https://refactoring.com/catalog/replaceConditionalWithPolymorphism.html).
In Rails, STI or `delegated_type` is often the natural vehicle; see Single Table
Inheritance in
[object-relational patterns](references/poeaa-object-relational.md).

### Liskov Substitution Principle (LSP)

- **Link:** [LSP](https://en.wikipedia.org/wiki/Liskov_substitution_principle).
- **Ruby shape:** duck types with surprise contracts: a subclass raising where
  the parent returns, returning a different type, or `NotImplementedError` stubs
  for inherited behavior callers rely on. In Rails: STI subclasses that break
  the assumptions of the parent's scopes.

**Fix:** A uniform contract; extra collaborators through the constructor.

### Interface Segregation Principle (ISP)

- **Link:**
  [ISP](https://en.wikipedia.org/wiki/Interface_segregation_principle).
- **Ruby shape:** god ducks: collaborators handed a huge object when they need
  one value, or concerns forcing 20 methods on hosts that need 2.

**Fix:** Pass only the values the collaborator uses
(`InvoicePdf.new(recipient_name:, recipient_email:)`, not the whole user).

### Dependency Inversion Principle (DIP)

- **Link:** [DIP](https://en.wikipedia.org/wiki/Dependency_inversion_principle);
  POODR chapter 3.
- **Ruby shape:** high-level policy naming concrete infrastructure
  (`Stripe::Charge`, `Redis.new`) inline, with no injection seam. See Separated
  Interface in [base patterns](references/poeaa-base.md).

## Idiomatic Ruby

### Monkey patching core and third-party classes

- **Violates:** the
  [Ruby Style Guide](https://rubystyle.guide/#no-monkey-patching); OCP.
- **Before:** reopening `String`, `Hash`, or gem classes in an initializer,
  which collides with gems and upgrades. **After:** a module with `refine`, or a
  plain helper module.

### method_missing without respond_to_missing?

- **Violates:** Ruby metaprogramming conventions
  ([Ruby Style Guide](https://rubystyle.guide/#no-method-missing)); it breaks
  `respond_to?`, `method`, and mocking.

**Fix:** Pair every `method_missing` with a matching `respond_to_missing?`,
and call `super` for names it does not handle.

Better still: define real methods with `define_method` at load time, which is
greppable and faster.

### Mutable constants and shared mutable state

- **Violates:** the
  [Ruby Style Guide](https://rubystyle.guide/#freeze-constants); Hickey's case
  for immutable data.

**Fix:** Freeze constant collections (`STATUSES = %w[draft active done].freeze`).

Class-level mutable state (`@@counter`, class instance variables mutated at
runtime) is the same finding, and is thread-unsafe under a multi-threaded
server. Cite the
[Ruby Style Guide on class variables](https://rubystyle.guide/#no-class-vars).

### Boolean-parameter control coupling

- **Violates:** POODR (clear interfaces);
  [Remove Flag Argument](https://refactoring.com/catalog/removeFlagArgument.html).
- **Before:** `def export(fast) = fast ? quick_scan : full_scan`, so callers
  read `export(true)` and learn nothing. **After:** two named methods, or a
  keyword argument: `export(mode: :fast)`.

### nil-swallowing chains

- **Violates:** Fail Fast; the
  [Special Case](https://martinfowler.com/eaaCatalog/specialCase.html) pattern.
- `a&.b&.c&.d || fallback` repeated across the codebase hides broken invariants.
  If the value must exist, let it raise; if absence is a domain state, model it
  (Special Case or Null Object).

### Comparable and Enumerable re-implementation

- **Violates:** idiomatic Ruby ([Ruby Style Guide](https://rubystyle.guide/)):
  hand-rolled `<`, `>`, `between?`, or `each`-plus-index bookkeeping instead of
  including `Comparable` or `Enumerable` and defining `<=>` or `each`.

### String-built code and eval

- **Violates:** the Rails Security Guide; the
  [Ruby Style Guide](https://rubystyle.guide/#no-eval).
- `eval`, `class_eval "..."` with interpolation, and `send(params[:action])`
  invite injection and unsearchable indirection. **After:** explicit dispatch
  tables (`HANDLERS.fetch(key)`), or `public_send` against an allowlist.
