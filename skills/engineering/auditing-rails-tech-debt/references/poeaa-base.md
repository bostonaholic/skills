# PoEAA: Base Patterns

Source: the Base Patterns in Fowler's
[PoEAA catalog](https://martinfowler.com/eaaCatalog/).

## Contents

- Gateway
- Service Stub
- Record Set
- Mapper
- Layer Supertype
- Separated Interface
- Registry
- Value Object
- Money
- Special Case
- Plugin

## Gateway

- **Definition** ([Fowler](https://martinfowler.com/eaaCatalog/gateway.html)):
  "An object that encapsulates access to an external system or resource."
- **Rails relevance:** the most-violated base pattern. Smell: HTTP clients, SDK
  calls, and API keys scattered through models, jobs, and controllers, so access
  is untestable and unswappable, and every timeout and retry decision is
  duplicated.

**Fix:** One gateway owns the protocol, configuration, errors, and retries.

A class fits here: the gateway holds its endpoint configuration, and tests
substitute a fake for it (see Service Stub).

**Finding rule:** grep for `Net::HTTP`, `Faraday`, `HTTParty`, and SDK constants
(`Stripe::`, `Aws::`) outside a dedicated gateway or client layer. Cite Gateway.

## Service Stub

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/serviceStub.html)): "Removes
  dependence upon problematic services during testing."
- **Rails relevance:** test suites that hit real external services (flaky, slow,
  rate-limited), or stub at the HTTP-string level everywhere because no Gateway
  seam exists.

**Fix:** Stub the gateway seam once.

**Finding rule:** flag WebMock or VCR fixtures duplicated across many specs (the
seam is missing). Cite Service Stub and Gateway.

## Record Set

- **Definition** ([Fowler](https://martinfowler.com/eaaCatalog/recordSet.html)):
  "An in-memory representation of tabular data."
- **Rails relevance:** `ActiveRecord::Result` and relations are the record set.
  Smell: materializing whole tables into arrays to filter or sort in Ruby what
  the database does better.

**Fix:** Push filtering, sorting, and limits into the query
(`Order.paid.order(:created_at).limit(10)`).

**Finding rule:** flag `.all.to_a`, `select` or `sort_by` blocks on unbounded
relations, and iteration over large tables without `find_each`. Cite Record Set
and the Rails querying guide.

## Mapper

- **Definition** ([Fowler](https://martinfowler.com/eaaCatalog/mapper.html)):
  "An object that sets up a communication between two independent objects."
- **Rails relevance:** translation between an external representation and domain
  objects. Smell: external payload vocabulary (webhook JSON keys, CSV headers)
  leaking through the whole codebase because no mapper translates at the edge.

**Fix:** A mapper translates at the boundary; the domain speaks its own language.

**Finding rule:** flag external key strings (`["data"]["object"]`-style digs)
appearing outside boundary code. Cite Mapper and Gateway.

## Layer Supertype

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/layerSupertype.html)): "A type
  that acts as the supertype for all types in its layer."
- **Rails relevance:** `ApplicationRecord`, `ApplicationController`,
  `ApplicationJob`, `ApplicationMailer`. Smells: bypassing them
  (`< ActiveRecord::Base` directly), or the inverse, the supertype as a dumping
  ground of methods only a few subclasses use.

**Fix:** inherit from the layer supertype, and keep only layer-wide behavior in it: pull single-consumer methods down to the consumer.

**Finding rule:** grep `< ActiveRecord::Base` and `< ActionController::Base`
outside the `Application*` definitions; flag `Application*` methods with one
caller. Cite Layer Supertype and ISP.

## Separated Interface

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/separatedInterface.html)):
  "Defines an interface in a separate package from its implementation."
- **Rails relevance:** Ruby's duck typing supplies this cheaply. The smell is
  domain code naming concrete infrastructure classes so implementations cannot
  vary (also DIP).

**Fix:** Depend on a role; inject the implementation.

**Finding rule:** flag concrete third-party classes referenced inside domain
operations. Cite Separated Interface and the Dependency Inversion Principle.

## Registry

- **Definition** ([Fowler](https://martinfowler.com/eaaCatalog/registry.html)):
  "A well-known object that other objects can use to find common objects and
  services."
- **Rails relevance:** `Rails.application.config`, `Rails.cache`. Fowler advises
  using a registry only as a last resort. Smells: global mutable registries
  (`$redis`, class-variable caches, `Thread.current` stashes) as hidden data
  channels between layers.

**Fix:** Explicit passing, or Rails' sanctioned registry with reset semantics.

**Finding rule:** grep `$` globals, `@@` class variables, and `Thread.current`
writes. Cite Registry, including its last-resort guidance.

## Value Object

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/valueObject.html)): "A small
  simple object, like money or a date range, whose equality isn't based on
  identity."
- **Rails relevance:** Primitive Obsession is the smell: domain concepts (money,
  ranges, coordinates, phone numbers) as loose primitives, with validation,
  formatting, and comparison logic re-implemented at every use site.

**Fix:** A value object that owns the logic, such as
`DateRange = Data.define(:starts_on, :ends_on)` with an `overlaps?(other)`
method (Ruby 3.2+).

**Finding rule:** flag repeated primitive-tuple parameters and duplicated format
or compare logic. Cite Value Object and Replace Primitive with Object
(refactoring.com).

## Money

- **Definition** ([Fowler](https://martinfowler.com/eaaCatalog/money.html)):
  "Represents a monetary value."
- **Rails relevance:** the canonical Value Object. Smells: floats for currency
  (rounding drift), amounts without a currency, and arithmetic on raw decimals
  across the codebase.

**Fix:** Integer cents and a currency behind a Money value object, for example from the money-rails gem.

**Finding rule:** grep the schema for `float` or `decimal` money-named columns
without currency companions; flag `to_f` on money. Severity HIGH (CRITICAL if
float). Cite Money.

## Special Case

- **Definition**
  ([Fowler](https://martinfowler.com/eaaCatalog/specialCase.html)): "A subclass
  that provides special behavior for particular cases."
- **Rails relevance:** the Null Object pattern. Smell: `nil` checks for the same
  absent thing repeated across the codebase (`user&.name || "Guest"` in 30
  places).

**Fix:** A `GuestAuthor` class answering the same messages (`name`,
`avatar_url`, `premium?`), returned by `Post#author` as `super || GuestAuthor.new`.

A class fits here: callers send the guest the same messages as a real author,
which a method or module function cannot do.

**Finding rule:** flag repeated `&.` or `|| default` chains against the same
association or attribute. Cite Special Case.

## Plugin

- **Definition** ([Fowler](https://martinfowler.com/eaaCatalog/plugin.html)):
  "Links classes during configuration rather than compilation."
- **Rails relevance:** implementation selection driven by environment or
  configuration. Smell: `Rails.env` branches buried in domain code, so behavior
  differs across environments in ways configuration never declares, and staging
  paths never run in test.

**Fix:** Configuration selects the implementation once.

**Finding rule:** grep `Rails.env.` outside `config/` and initializers. Cite
Plugin and OCP.
