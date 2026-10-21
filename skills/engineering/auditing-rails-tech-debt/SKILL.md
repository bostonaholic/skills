---
name: auditing-rails-tech-debt
description: Audits a Rails app for tech debt, citing each finding to PoEAA, SOLID, or the Rails guides with file:line evidence and before/after code. Use when auditing Rails for anti-patterns, fat models or controllers, callback abuse, or N+1 queries. Not for over-engineering; use simplifying-ruby-code.
---

# Rails tech debt audit

Report only; edit code only if the user asks. A short report of confirmed
problems beats a long report of maybes.

## Every finding

1. **Cites code.** `file:line` for code you read. Never report a smell you
   did not read.
2. **Cites a named source.** Link at least one source from
   [citation resources](references/resources.md) or a PoEAA pattern page,
   preferring the most specific. If you cannot name the violated principle
   and its source, it is an opinion: drop it.
3. **Shows before and after**, in this codebase's names and style.
4. **Uses the simplest After**: a model method, a module function, or a
   query scope. Introduce a new class only when it holds state or
   orchestrates several models. Call the Skill tool with
   `simplifying-ruby-code` and cite its pattern numbers; if it is missing,
   apply this rule as written.
   Without a Skill tool, follow the [skill call rules](shared/skill-calls.md).
5. **Is verified independently.** A different agent than the finder
   confirms each candidate from the code (is it invoked, does a concern or
   other structure already mitigate it, does the schema or a test justify
   the design). Drop anything not confirmed.

## Reference files

Read the reference for the category you hunt or the pattern you cite:
PoEAA [domain logic](references/poeaa-domain-logic.md),
[data source](references/poeaa-data-source.md),
[object-relational](references/poeaa-object-relational.md),
[web presentation](references/poeaa-web-presentation.md),
[distribution, concurrency, and session](references/poeaa-distribution-concurrency-session.md),
and [base patterns](references/poeaa-base.md);
[Rails anti-patterns](references/rails-antipatterns.md) (callback abuse,
N+1, `default_scope`, SQL interpolation in scopes); and
[SOLID and idiomatic Ruby](references/solid-ruby.md).

## Leads

Run `node <skill-dir>/scripts/find-leads.mjs <app-root>`. On exit 1 or 2,
fix what stderr names and rerun. On exit 3, apply the schema rules to
`db/structure.sql` by reading.

Start from `Gemfile`, `config/routes.rb`, `db/schema.rb`, and the largest
files in `sizes`; a missing layer is as diagnostic as a bloated one. A lead
is a place to read, never a finding: confirm each against the finding rule
that names it, and resolve each `schema.unresolved` entry by reading its
model or migration.

## Severity

- **CRITICAL:** corrupts data, opens a security hole, or blocks correctness
  (SQL injection in scopes, missing locks on money paths, callbacks with
  cross-record side effects).
- **HIGH:** taxes every change in the area (god model, business logic in
  controllers, N+1 on hot paths).
- **MEDIUM:** localized debt (missing Value Object, duplicated scopes,
  logic in views).
- **LOW:** style or idiom drift.

## Report

Default shape per finding, to adapt: a `### [SEVERITY] <title>` heading,
then Where (`file:line` ranges), Smell, Violates (named principle with
link), Evidence (quoted code), Before and After, Why a class (only when the
After adds one), and Effort (S, M, or L, incremental or all at once).
Order findings by severity and end with a summary table.

Order remediation cheapest highest-severity first, and put refactorings
that unlock others earlier (for example, extract the Service Layer before
Query Objects).
