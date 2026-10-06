---
name: auditing-rails-tech-debt
description: Audits a Rails app for tech debt, citing each finding to PoEAA, SOLID, or the Rails guides with file:line evidence and before/after code. Use when auditing Rails for anti-patterns, fat models or controllers, callback abuse, or N+1 queries. Not for over-engineering; use reviewing-rails-code.
---

# Rails tech debt audit

Audit a Rails codebase for anti-patterns and tech debt. Report only; edit code
only if the user asks. Every finding must point at specific code, name the
practice or pattern it violates, and link the authoritative source that defines
that practice. No finding without evidence and a citation.

Copy this checklist and check off each step:

```text
- [ ] 1. Map the app
- [ ] 2. Hunt by category
- [ ] 3. Verify each candidate finding
- [ ] 4. Write the report from the template
```

## Non-negotiables

1. **Evidence-rooted.** Every finding cites `file:line` from the codebase. Never
   report a smell you did not read in the code.
2. **Resource-linked.** Every finding links at least one source from
   [citation resources](references/resources.md) or a pattern page from the
   PoEAA reference files. If you cannot name the violated principle and its
   source, it is an opinion, not a finding: drop it.
3. **Before and after.** Every finding shows the offending code and a concrete
   refactoring adapted to this codebase's names and style, modeled on the
   examples in the reference files.
4. **No false positives.** A short report of confirmed problems beats a long
   report of maybes. Read enough surrounding code (callers, associations,
   schema) to confirm each finding.
5. **Simplest After.** Prefer the smallest change that removes the smell: a
   model method, a module function, or a query scope. Introduce a new class only
   when it holds state or orchestrates several models; a finding whose After
   adds a class must say why a method or module function would not do. Call the
   Skill tool with `simplifying-ruby-code` and cite its pattern numbers in the
   finding; if it is missing, apply this rule as written.

## Reference files

Read a file when a step-2 category sends you to it, or when classifying a
finding it covers. The PoEAA files document every pattern in Fowler's
[Catalog of Patterns of Enterprise Application Architecture](https://martinfowler.com/eaaCatalog/),
each with its link, definition, Rails mapping, before/after Ruby, and finding
rule.

- [Domain logic patterns](references/poeaa-domain-logic.md): Transaction Script,
  Domain Model, Table Module, Service Layer. Read for logic placement.
- [Data source patterns](references/poeaa-data-source.md): Table Data Gateway,
  Row Data Gateway, Active Record, Data Mapper. Read for god models and raw SQL.
- [Object-relational patterns](references/poeaa-object-relational.md): Unit of
  Work, Identity Map, Lazy Load, Identity Field, Inheritance Mappers, Foreign
  Key Mapping, Association Table Mapping, Dependent Mapping, Embedded Value,
  Serialized LOB, Single, Class, and Concrete Table Inheritance, Metadata
  Mapping, Query Object, Repository. Read for model, schema, and query findings.
- [Web presentation patterns](references/poeaa-web-presentation.md): Model View
  Controller, Page Controller, Front Controller, Template View, Transform View,
  Two Step View, Application Controller. Read for controllers, views, and JSON
  rendering.
- [Distribution, concurrency, and session patterns](references/poeaa-distribution-concurrency-session.md):
  Remote Facade, Data Transfer Object, Optimistic, Pessimistic, Coarse-Grained,
  and Implicit Lock, Client, Server, and Database Session State. Read for API
  shape, job arguments, locking, and session use.
- [Base patterns](references/poeaa-base.md): Gateway, Service Stub, Record Set,
  Mapper, Layer Supertype, Separated Interface, Registry, Value Object, Money,
  Special Case, Plugin. Read for external calls, globals, and primitives.
- [Rails anti-patterns](references/rails-antipatterns.md): fat controller, fat
  model, callback abuse, N+1, Law of Demeter, `default_scope`, SQL injection in
  scopes, and other Rails-specific smells. Read for any Rails smell not named by
  a PoEAA pattern.
- [SOLID and idiomatic Ruby](references/solid-ruby.md): SOLID principles and
  idiomatic-Ruby violations. Read for type switches, monkey patches, and
  metaprogramming.
- [Citation resources](references/resources.md): every resource linked from
  Fowler's
  [Enterprise Application Patterns guide](https://martinfowler.com/articles/enterprisePatterns.html)
  plus the Ruby and Rails canon. Read before writing the report to pick each
  finding's citation.

## 1. Map the app

Build a model of the app before judging anything:

- Run `bin/rails stats` (or count by hand) for size and shape; note the
  test-to-code ratio.
- Read `Gemfile`, `config/routes.rb`, and `db/schema.rb`. They reveal the
  architecture faster than any model file.
- Inventory the layers: `app/models`, `app/controllers`, `app/services`,
  `app/jobs`, `app/serializers`, `lib/`, and any nonstandard directories.
  Missing layers are as diagnostic as bloated ones.
- List the 10 largest models and controllers, since tech debt concentrates in
  the biggest files:
  `find app/models app/controllers -name '*.rb' | xargs wc -l | sort -rn | head`.

## 2. Hunt by category

Sweep each category. The reference files list the concrete greps and smells.

1. **Domain logic placement:** business logic in controllers, views, jobs, or
   rake tasks instead of the domain layer
   ([domain logic](references/poeaa-domain-logic.md)).
2. **Model layer:** god models, callback chains with side effects, missing Value
   Objects or Extract Class, misused STI
   ([object-relational](references/poeaa-object-relational.md),
   [Rails anti-patterns](references/rails-antipatterns.md)).
3. **Query hygiene:** N+1 queries, raw SQL string interpolation, duplicated
   scopes, missing Query Objects
   ([object-relational](references/poeaa-object-relational.md),
   [Rails anti-patterns](references/rails-antipatterns.md)).
4. **Presentation:** logic-heavy views, controllers making rendering decisions
   that models should own, missing presenters or serializers
   ([web presentation](references/poeaa-web-presentation.md)).
5. **Boundaries:** third-party API calls scattered through models and jobs
   instead of Gateways; hashes crossing layer boundaries instead of DTOs or
   Value Objects ([base](references/poeaa-base.md),
   [distribution](references/poeaa-distribution-concurrency-session.md)).
6. **Concurrency and state:** missing locking on contended records, session
   bloat ([distribution](references/poeaa-distribution-concurrency-session.md)).
7. **SOLID and idiomatic Ruby:** case-statement type switches, monkey patches,
   `method_missing` abuse, mutable constants
   ([SOLID](references/solid-ruby.md)).

For an app under about 10k lines of Ruby, one agent can read everything
relevant: audit inline. For a larger app, fan out parallel read-only subagents,
one per category. Give each its category, reference files, and these
non-negotiables, and have it return findings in the report template with
`file:line` evidence. Subagents edit nothing. Verify and merge their findings
yourself; never let a subagent's unverified claim into the final report.

## 3. Verify

For each candidate finding, read the surrounding code and confirm: is it
invoked? Does a mitigating structure exist elsewhere (for example, a concern
that already extracts the logic)? Does the schema or a test justify the design?
Drop anything you cannot confirm.

## 4. Report

Use this template exactly: keep the field labels and their order, order findings
by severity, and omit **Why a class** when the After adds no class.

```markdown
### [SEVERITY] <short title naming the anti-pattern>

- **Where:** `<path>:<start>-<end>` (and other locations)
- **Smell:** <what the code does wrong, in one or two sentences>
- **Violates:** <named principle or pattern with link(s), e.g. [Service Layer](https://martinfowler.com/eaaCatalog/serviceLayer.html), [SRP](https://en.wikipedia.org/wiki/Single-responsibility_principle)>
- **Evidence:** <the offending code, quoted>
- **Before → After:** <minimal refactoring to the target pattern, using this codebase's real names>
- **Why a class:** <the state it holds or the models it orchestrates, and why a method or module function would not do>
- **Effort:** <S | M | L>, <incremental or all at once>

## Summary

| Finding | Severity | Effort |
| ------- | -------- | ------ |

Remediation order: <finding titles>
```

Severity:

- **CRITICAL:** corrupts data, opens a security hole, or blocks correctness (SQL
  injection in scopes, missing locks on money paths, callbacks with cross-record
  side effects).
- **HIGH:** taxes every change in the area (god model, business logic in
  controllers, N+1 on hot paths).
- **MEDIUM:** localized debt that hurts when the area next changes (missing
  Value Object, duplicated scopes, logic in views).
- **LOW:** style or idiom drift; fix opportunistically.

Order remediation cheapest-highest-severity first, and put refactorings that
unlock others earlier (for example, extract the Service Layer before Query
Objects).
