---
name: auditing-rails-tech-debt
description: Audits a Rails app for tech debt, citing each finding to PoEAA, SOLID, or the Rails guides with file:line evidence and before/after code. Use when auditing Rails for anti-patterns, fat models or controllers, callback abuse, or N+1 queries. Not for over-engineering; use simplifying-ruby-code.
---

# Rails tech debt audit

Audit a Rails codebase for anti-patterns and tech debt. Report only; edit
code only if the user asks. A short report of confirmed problems beats a
long report of maybes.

## Every finding

1. **Cites code.** `file:line` for code you read. Never report a smell you
   did not read.
2. **Cites a named source.** Link at least one source from
   [citation resources](references/resources.md) or a pattern page from the
   PoEAA reference files, preferring the most specific (a pattern page over
   a book). If you cannot name the violated principle and its source, it is
   an opinion, not a finding: drop it.
3. **Shows before and after.** The offending code and a concrete
   refactoring in this codebase's names and style.
4. **Uses the simplest After.** Prefer the smallest change that removes the
   smell: a model method, a module function, or a query scope. Introduce a
   new class only when it holds state or orchestrates several models, and
   say why a method or module function would not do. Call the Skill tool
   with `simplifying-ruby-code` and cite its pattern numbers; if it is
   missing, apply this rule as written.
5. **Is verified independently.** Before a candidate reaches the report,
   a different agent than the one that found it confirms it from the code
   (is it invoked, does a concern or other structure already mitigate it,
   does the schema or a test justify the design), so the finder never
   grades its own claim. Drop anything not confirmed.

## Reference files

Read a file when hunting its category or citing a pattern it covers. Each
PoEAA file gives every pattern in Fowler's
[catalog](https://martinfowler.com/eaaCatalog/) with its link, definition,
Rails mapping, fix, and finding rule.

- [Domain logic](references/poeaa-domain-logic.md): Transaction Script,
  Domain Model, Table Module, Service Layer. Logic placement.
- [Data source](references/poeaa-data-source.md): gateways, Active Record,
  Data Mapper. God models and raw SQL.
- [Object-relational](references/poeaa-object-relational.md): Unit of Work,
  Lazy Load, inheritance mappings, Query Object, Repository, and the rest.
  Model, schema, and query findings.
- [Web presentation](references/poeaa-web-presentation.md): MVC, controller
  and view patterns. Controllers, views, and JSON rendering.
- [Distribution, concurrency, and session](references/poeaa-distribution-concurrency-session.md):
  Remote Facade, DTO, locking, session state. API shape, job arguments,
  locking, and sessions.
- [Base patterns](references/poeaa-base.md): Gateway, Service Stub,
  Registry, Value Object, Money, Special Case, and the rest. External calls,
  globals, and primitives.
- [Rails anti-patterns](references/rails-antipatterns.md): Rails smells no
  PoEAA pattern names (callback abuse, N+1, `default_scope`, SQL
  interpolation in scopes, and more).
- [SOLID and idiomatic Ruby](references/solid-ruby.md): type switches,
  monkey patches, metaprogramming, mutable constants.
- [Citation resources](references/resources.md): Fowler's enterprise
  patterns literature plus the Ruby and Rails canon.

Start from `Gemfile`, `config/routes.rb`, `db/schema.rb`, and the largest
models and controllers; debt concentrates in the biggest files, and a
missing layer is as diagnostic as a bloated one.

## Severity

- **CRITICAL:** corrupts data, opens a security hole, or blocks correctness
  (SQL injection in scopes, missing locks on money paths, callbacks with
  cross-record side effects).
- **HIGH:** taxes every change in the area (god model, business logic in
  controllers, N+1 on hot paths).
- **MEDIUM:** localized debt that hurts when the area next changes (missing
  Value Object, duplicated scopes, logic in views).
- **LOW:** style or idiom drift; fix opportunistically.

## Report

Default shape per finding, to adapt: a `### [SEVERITY] <title>` heading,
then Where (`file:line` ranges), Smell, Violates (named principle with
link), Evidence (quoted code), Before and After, Why a class (only when the
After adds one), and Effort (S, M, or L, incremental or all at once).
Order findings by severity and end with a summary table.

Order remediation cheapest highest-severity first, and put refactorings
that unlock others earlier (for example, extract the Service Layer before
Query Objects).
