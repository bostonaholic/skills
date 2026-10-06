# SOLID and idiomatic-Ruby violations

Each entry gives the principle, its canonical link, the Ruby or Rails shape of
the violation, and a before and after.

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

**Before:**

```ruby
class Report
  def generate = @rows = fetch_rows       # querying
  def to_csv = CSV.generate { ... }       # formatting
  def upload_to_s3 = S3_CLIENT.put(...)   # transport
  def email_to(admin) = ReportMailer...   # notification
end
```

**After (each responsibility in its simplest home):**

```ruby
class Report
  def rows; ...; end                      # querying only
end

module ReportCsv
  module_function

  def generate(rows) = CSV.generate { ... }   # formatting: data in, string out
end

# transport through a gateway; notification at the call site
S3Gateway.new.put(key, ReportCsv.generate(report.rows))
ReportMailer.ready(admin, key).deliver_later
```

### Open-Closed Principle (OCP)

- **Link:** [OCP](https://en.wikipedia.org/wiki/Open%E2%80%93closed_principle).
- **Ruby shape:** the same `case` or `if`/`elsif` over a type or kind repeated
  in several methods, so every new variant edits every switch.

**Before:**

```ruby
def price
  case plan_type
  when "basic" then 10 when "pro" then 30 when "enterprise" then 100
  end
end

def support_sla
  case plan_type
  when "basic" then 72 when "pro" then 24 when "enterprise" then 4
  end
end
```

**After (variants that differ only in data become one frozen table; adding a
variant adds one entry):**

```ruby
PLANS = {
  "basic" => { price: 10, support_sla: 72 },
  "pro" => { price: 30, support_sla: 24 },
  "enterprise" => { price: 100, support_sla: 4 },
}.freeze

def price = PLANS.fetch(plan_type)[:price]
def support_sla = PLANS.fetch(plan_type)[:support_sla]
```

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

**Before:**

```ruby
class Discount
  def amount_for(order) = order.total * rate
end

class PartnerDiscount < Discount
  def amount_for(order, partner)   # changed arity: every polymorphic caller breaks
    ...
  end
end
```

**After (a uniform contract; extra collaborators through the constructor):**

```ruby
class PartnerDiscount < Discount
  def initialize(partner) = @partner = partner
  def amount_for(order) = order.total * @partner.negotiated_rate
end
```

### Interface Segregation Principle (ISP)

- **Link:**
  [ISP](https://en.wikipedia.org/wiki/Interface_segregation_principle).
- **Ruby shape:** god ducks: collaborators handed a huge object when they need
  one value, or concerns forcing 20 methods on hosts that need 2.

**Before:**

```ruby
class InvoicePdf
  def initialize(user)   # takes the whole User, uses only name + email
    @user = user
  end
end
```

**After:**

```ruby
class InvoicePdf
  def initialize(recipient_name:, recipient_email:)
    ...
  end
end
```

### Dependency Inversion Principle (DIP)

- **Link:** [DIP](https://en.wikipedia.org/wiki/Dependency_inversion_principle);
  POODR chapter 3.
- **Ruby shape:** high-level policy naming concrete infrastructure
  (`Stripe::Charge`, `Redis.new`) inline, with no injection seam. See Separated
  Interface in [base patterns](references/poeaa-base.md) for before and after.

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

**Before:**

```ruby
def method_missing(name, *args)
  settings[name.to_s] || super
end
```

**After:**

```ruby
def method_missing(name, *args)
  settings.key?(name.to_s) ? settings[name.to_s] : super
end

def respond_to_missing?(name, include_private = false)
  settings.key?(name.to_s) || super
end
```

Better: define real methods with `define_method` at load time, which is
greppable and faster.

### Mutable constants and shared mutable state

- **Violates:** the
  [Ruby Style Guide](https://rubystyle.guide/#freeze-constants); Hickey's case
  for immutable data.

**Before:**

```ruby
STATUSES = %w[draft active done]
STATUSES << "archived" if legacy?   # mutates for every thread, forever
```

**After:**

```ruby
STATUSES = %w[draft active done].freeze
```

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
