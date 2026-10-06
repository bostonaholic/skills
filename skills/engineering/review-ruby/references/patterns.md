# Simplifying Ruby Code

## Core Principle

Prefer simple data structures (Hash, Array, Struct, Data) and pure functions over unnecessary classes and abstractions.

**MANDATORY:** Identify whether code is a decision (pure logic) or effect (I/O). Keep them separate.

Tests that require extensive mocking indicate mixed concerns. Separate decisions from effects so the decisions can be tested without mocks.

## Over-Engineering Patterns

### Command Objects → Module Functions

```ruby
# ❌ Over-engineered
class UserCreator
  def initialize(params); @params = params; end
  def call; User.create(@params); end
end

# ✅ Simple
User.create(params)  # or module function if logic needed
```

**Keep command object when:** Has state, multi-step algorithm, needs queuing.

### Value Objects → Struct/Data/Hash

```ruby
# ❌ Manual value object
class Point
  attr_reader :x, :y
  def initialize(x, y); @x, @y = x, y; end
  def ==(other); x == other.x && y == other.y; end
end

# ✅ Simple
Point = Data.define(:x, :y)  # Ruby 3.2+, immutable
Point = Struct.new(:x, :y, keyword_init: true)  # mutable
point = {x: 10, y: 20}  # simplest
```

### Utility Classes → Modules

```ruby
# ❌ Class with only class methods
class DateFormatter
  def self.format_for_display(date); date.strftime("%B %d, %Y"); end
end

# ✅ Module
module DateFormatter
  module_function
  def format_for_display(date); date.strftime("%B %d, %Y"); end
end
```

### Deep Inheritance → Composition

```ruby
# ❌ Deep hierarchy
class Animal; end
class Mammal < Animal; end
class Dog < Mammal; end

# ✅ Composition
module WarmBlooded
  def warm_blooded?; true; end
end

class Dog
  include WarmBlooded
end
```

## Data Structure Selection

| Use          | When                                               |
| ------------ | -------------------------------------------------- |
| Hash         | Temporary data, varying keys, JSON interface       |
| Struct       | Fixed attributes, need methods, mutable OK         |
| Data         | Fixed attributes, immutable (Ruby 3.2+)            |
| Custom Class | Complex validation, rich behavior, domain concepts |

## Ruby Protocols

Implement for interoperability with standard library:

```ruby
class Collection
  include Enumerable

  def each(&block); @items.each(&block); end  # Enables map, select, etc.
  def to_a; @items.dup; end
  def to_h; @items.to_h; end
  def to_json(*args); @items.to_json(*args); end
end
```

Key protocols: `to_h`, `to_a`, `to_json`, `to_s`, `each`, `<=>`, `hash`/`eql?`

## Refactoring Steps

1. **Identify decisions vs effects** - Mark pure logic vs I/O
2. **Extract pure functions** - Create module functions with data parameters
3. **Test pure functions** - No mocks needed
4. **Simplify data structures** - Replace classes with Struct/Data/Hash
5. **Remove unnecessary layers** - Inline wrappers that add no value

## Principles

1. **Prefer data over objects**: use Hash, Array, Struct, and Data over custom classes for simple data
2. **Prefer functions over classes**: use modules with `module_function` over command objects for stateless operations, unless state is needed
3. **Prefer composition over inheritance**: share behavior with modules and keep inheritance shallow
4. **Implement Ruby protocols**: make objects work with Ruby's built-in methods and Enumerable
5. **Use blocks effectively**: blocks are Ruby's lambdas; use them instead of callback objects
6. **Leverage the standard library**: Ruby's stdlib is rich; do not reinvent Array, Hash, Set, etc.
7. **OOP for domain models, functional for calculations**: use both appropriately
