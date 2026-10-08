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

Comments never explain WHAT code does. Permit only a non-obvious WHY (a constraint, workaround, or surprising requirement) that names, structure, and tests cannot carry. Review findings use the [finding format](findings.md).

- **No ticket/issue IDs, plan/slice/phase markers, or doc-section references.** A public upstream-issue URL that is itself the why is allowed; internal trackers and pipeline artifacts are not.
- **No process narration.** State current constraints. Never mention dates, corrections, edit history, users or prompts, review feedback, ticket discussion, or agent instructions. "Previously," "Originally," "As of," and "This was changed because" are detection hints, not the rule.
- **No incidentals.** A comment carries its constraint, not the background or discovered asides that led to it.
- **Document deliberate constraints.** Name the consequence of removing odd code: API limits, compatibility, security, ordering, concurrency, or framework behavior.
- **Be precise.** Refer to symbols and stable identifiers, not line numbers or layout.
- No commented-out code. No TODO/FIXME in delivered code; deferred work goes in the report.
- Doc comments on public interfaces must add contract facts absent from the signature; one that restates the signature is a WHAT comment.

Decision test: Does this explain why? Can code or tests carry it? Is it true now without process context?

## Reviewing

A finding names the principle it violates, cites `file:line`, and states the current consequence. A finding that names no principle and no consequence is not actionable.
