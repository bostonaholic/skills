<!-- Canonical file: shared/code-standards.md at the repository root. Edit it there, then run npm run sync-shared. -->

# Code Standards

The bar for planning, implementing, and reviewing production code, where it is stricter than the usual reading.

## Design

- **Single Responsibility:** a function you cannot name without "and" has too many jobs.
- **Open/Closed:** add implementations behind an interface instead of branches.
- **Dependency Inversion:** business logic never imports database, HTTP, or filesystem APIs directly.
- **Construct with collaborators, call with work.** Constructors take long-lived dependencies (clock, DB, logger, HTTP client) and do no I/O; methods take per-request work. Prefer `ReportGenerator(reportingDb, clock).generate(startDate, endDate)`.
- Catch only the exact throwing call and the specific exception, and chain the original cause.
- Never combine refactoring and feature work in one commit.

## Minimum scoped change

Remove what the change replaces or leaves unused before adding its replacement.
Add no validator, guard, option, or parallel mechanism that the design, plan, or tests do not demand. Record wider opportunities instead of implementing them.

## Code comments

Comments obey the [code comments rules](code-comments.md). Review findings use the [finding format](findings.md).

## Reviewing

A finding names the principle it violates, cites `file:line`, and states the current consequence. A finding that names no principle and no consequence is not actionable.
