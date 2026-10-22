# Red flags

Each flag names a code shape that breaks when many agents change one codebase in parallel. Detect it with the signal, confirm it is not a false positive, then cite the fix principle. Contention signals come from `scripts/contention.mjs`; the rest come from search and reading. Examples of each fix live in [principles.md](principles.md); a flag shows its own only when no principle does.

## Contents

- [C: Contention](#c-contention): AF1 to AF3, AF17
- [B: Boundaries](#b-boundaries): AF4 to AF7
- [K: Contracts](#k-contracts): AF8, AF9
- [D: Discoverability](#d-discoverability): AF10 to AF13, AF18
- [V: Verification](#v-verification): AF14 to AF16, AF19
- [Severity](#severity)

## C: Contention

### AF1 Conflict magnet

**Signal:** the file tops `hotFiles` and its commits span unrelated feature directories. Reading cue: a registry, routes table, container, barrel index, or shared fixture whose imports reach every feature. A changelog or version file that every change edits counts too.

**Why agents suffer:** every feature branch edits the same file, so parallel branches conflict and each merge forces the next agent to rebase.

**Fix:** P1. A new feature is a new file that names itself; one loader, written once, discovers it. For a changelog, each change adds its own fragment file, assembled at release, and the version is set at release time.

Example: [P1](principles.md#p1-additive-change).

**Not a flag when:** the file changes a few times a year, or one writer owns it. Lockfiles and generated files also top `hotFiles`; they are not findings unless edited by hand (the file changes without its source). Exclude them with a pathspec such as `-- . ':!<lockfile>'` and rerun.

### AF2 Append-point hotspot

**Signal:** a `hotFiles` entry whose changed lines cluster at the end of one array, enum, switch, or list. Check with `git log -p -- <file>` or `git log -L <start>,<end>:<file>` on the list: a flag when added lines keep landing at the same end position. Reading cues: unsorted lists, "add new entries here" comments, no trailing comma on the last item.

**Why agents suffer:** two purely additive changes edit the same lines, so git reports a conflict that only a human or an extra agent turn resolves.

**Fix:** P1 first (move each entry to its own file). When the list must stay, sort it, one entry per line, trailing comma on every entry.

```ts
// Before: every addition appends and edits the previous line
export const PLANS = [
  "free",
  "team",
  "enterprise"
];
```

```ts
// After: sorted, one per line, trailing commas
export const PLANS = [
  "enterprise",
  "free",
  "team",
];
```

Additions now land at different sorted positions and merge cleanly.

**Not a flag when:** the order carries meaning (a middleware chain, a priority list) and changes rarely.

### AF3 Global sequence

**Signal:** `sequences` lists a numbered-sequence directory (migrations, fixtures). Search for hand-assigned numeric IDs: error codes, port numbers, "next free number" comments.

**Why agents suffer:** parallel branches each take the next free number, both pass alone, and they collide or misorder on merge.

**Fix:** P1. Derive the ID without coordination: a timestamp, a content hash, or a name namespaced by module.

```ts
// Before: errors.ts, one sequence for the whole codebase
export const ERR_CARD_DECLINED = 1017;
export const ERR_REFUND_WINDOW = 1018; // the next branch also picks 1018
```

```ts
// After: orders/errors.ts, namespaced, chosen locally
export const ERR_REFUND_WINDOW = "orders.refund_window_closed";
```

Two agents adding errors in different modules can no longer pick the same value.

**Not a flag when:** tooling assigns the number at merge time, or the number is fixed by an external protocol. Timestamped names (the fix) also appear in `sequences`; only hand-incremented sequential numbers are AF3.

### AF17 Parallel duplicate

**Signal:** two or more functions or modules on the main branch that do the same job under different names, added by separate changes close in time. Search for near-identical bodies and for synonyms of a helper's name (`formatMoney`, `toCurrency`); run `[duplication detector]` over the scope.

**Why agents suffer:** two agents in parallel branches each add the same helper, and each change passes a "no new duplication against base" check, because neither base held the other's copy. Only the merged branch shows both, so no per-change gate can catch it; the next agent then copies whichever it finds first.

**Fix:** P5. Keep one canonical home per concept, consolidate to it, and delete the copies. An Audit of the main branch is the check that sees across changes, so run it on a schedule, not only per change.

**Not a flag when:** the copies are in modules that must not depend on each other, and each is small and tested.

## B: Boundaries

### AF4 God module

**Signal:** a file or class whose purpose needs "and" to state; a generic name such as `service` or `app`; a `hotFiles` entry touched by unrelated features.

**Why agents suffer:** unrelated changes collide in one file, and an agent must load all of it to change one part.

**Fix:** P2. Split by responsibility and move each piece into the feature that owns it.

```ts
// Before: users/user-service.ts
export class UserService {
  login(email: string, password: string) { /* ... */ }
  sendInvoice(orderId: string) { /* ... */ }
  resizeAvatar(userId: string, px: number) { /* ... */ }
}
```

```ts
// After: one responsibility per file, in its own feature
// auth/login.ts       export function login(email: string, password: string)
// billing/invoice.ts  export function sendInvoice(orderId: string)
// avatars/resize.ts   export function resizeAvatar(userId: string, px: number)
```

An invoice change and a login change now touch different files.

**Not a flag when:** the module is large but cohesive (one parser, one state machine).

### AF5 Leaky boundary

**Signal:** imports that reach into another module's internal paths (`/internal/`, `/lib/`, deep relative paths like `../../billing/db/rows`); modules with no single entry file.

**Why agents suffer:** an agent refactoring a module's internals breaks callers it never saw, and the break surfaces in someone else's branch.

**Fix:** P3. Give the module one public entry, import only from it, and enforce the rule with an import-boundary lint.

Example: [P3](principles.md#p3-narrow-explicit-interface).

**Not a flag when:** the import stays inside one module, or the target is a deliberately exported test helper.

### AF6 Shared mutable state

**Signal:** search for top-level `let`, exported mutable objects, singleton accessors, writes to process-wide config, and side effects at import time (connections, timers, registrations).

**Why agents suffer:** one agent's change leaks into another's code path, and tests pass alone but fail in parallel or in a different order.

**Fix:** P7. Pass the state in as a parameter; move import-time effects into an explicit start function.

Example: [P7](principles.md#p7-isolated-state).

**Not a flag when:** the value is set once at startup and never written again.

### AF7 Lockstep change

**Signal:** `coupledPairs` shows files in different directories that always change together; history shows single changes that edit one signature plus dozens of call sites.

**Why agents suffer:** one contract change needs a huge diff across many owners, which conflicts with every open branch touching those callers.

**Fix:** P9 (expand/contract) and P3. Add the new form beside the old, migrate callers in small separate changes, then remove the old form.

Example: [P9](principles.md#p9-mergeable-change-size).

**Not a flag when:** the contract has few callers, all in one module. A test file paired with its source in `coupledPairs` is expected.

## K: Contracts

### AF8 Implicit contract

**Signal:** search exported functions for untyped maps (`any`, string-keyed records), status fields typed as plain strings, and call sites like `fn(x, true, false)`. Reading cue: the only way to learn the shape is to read the callers.

**Why agents suffer:** an agent guesses the shape from one call site, writes a wrong edit, and nothing fails until runtime.

**Fix:** P4. Type the boundary: closed unions for status, named fields instead of boolean flags, validation at the edge.

Example: [P4](principles.md#p4-explicit-contracts-at-boundaries).

**Not a flag when:** the function is private to one file and its callers sit beside it.

### AF9 Silent failure

**Signal:** search for empty `catch` blocks, `catch` that returns `null` or a default, `?? 0` or `|| []` on parsed or fetched data, and log-and-continue.

**Why agents suffer:** the agent breaks behavior, every check stays green, and it reports success.

**Fix:** P6. Throw with the cause; let the caller decide whether a fallback is correct.

Example: [P6](principles.md#p6-fail-loud-and-early).

**Not a flag when:** the fallback is a documented edge behavior (a cache miss) that is logged and tested.

## D: Discoverability

### AF10 Ungreppable wiring

**Signal:** search for names built at runtime: template strings or concatenation that form identifiers, computed property calls, computed dynamic imports, reflection, prototype patching. Test: search a handler's name and count real call sites.

**Why agents suffer:** an agent renames or deletes a symbol, search shows no callers, and the change breaks a call site it could not find.

**Fix:** P5. Wire with literal identifiers in one typed table or explicit calls.

```ts
// Before: searching "onRefund" finds only its definition
const action = `on${capitalize(event.kind)}`;
(handlers as any)[action](event);
```

```ts
// After: the wiring names each handler literally
const handlers: Record<OrderEvent["kind"], (e: OrderEvent) => void> = {
  invoice: onInvoice,
  refund: onRefund,
};
handlers[event.kind](event);
```

Search for `onRefund` now finds its wiring, so renames and deletions see every caller.

**Not a flag when:** the convention is one documented rule and each entry names itself as a literal, as in P1.

### AF11 Ambiguous names

**Signal:** files or modules named `utils`, `helpers`, `common`, `misc`, `manager`; one word used for two concepts; two words for one concept (search each synonym and compare hit sets).

**Why agents suffer:** search returns the wrong definition or misses the right one, so agents edit the wrong thing or add a duplicate.

**Fix:** P5. One specific name per concept, in the module that owns it.

```ts
// Before: utils.ts
export function format(x: number) {
  return `$${(x / 100).toFixed(2)}`;
}
```

```ts
// After: money/format-cents.ts
export function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}
```

A search for the concept now finds one definition, so agents reuse it instead of writing another.

**Not a flag when:** a small project's single `utils` file holds a handful of truly generic functions.

### AF12 Scattered feature

**Signal:** a high `scatter.medianDirsPerCommit`: the median count of distinct parent directories (each changed file's own directory) per commit. `coupledPairs` linking files in layer directories (handlers, services, models, views) confirms it.

**Why agents suffer:** one feature edits files that every other feature also edits, so small changes conflict, and an agent that misses one layer ships a partial change.

**Fix:** P2. Group by feature (vertical slice), not by layer.

Example: [P2](principles.md#p2-locality).

**Not a flag when:** the layers are genuinely shared infrastructure that features rarely change. A test file paired with its source in `coupledPairs` is expected.

### AF13 Off-code knowledge

**Signal:** module directories with no README or AGENTS.md; comments pointing elsewhere ("see wiki", "ask the owner"); comments that contradict the code; setup steps found only in tickets or chat.

**Why agents suffer:** an agent cannot read what is not in the repo, so it breaks invariants it never saw and guesses how to verify.

**Fix:** P10. Put a short guide beside the code and keep it true in the same change that alters behavior.

Example: [P10](principles.md#p10-knowledge-beside-the-code).

**Not a flag when:** the module is trivial and its tests state its contract.

### AF18 Copied precedent

**Signal:** two idioms for one job coexist (two error-handling styles, two data-access patterns, a legacy and a current API client), and recent changes use the legacy one. Count call sites of each; check which one the newest files use.

**Why agents suffer:** an agent learns local convention by copying the nearest similar code, so a legacy pattern spreads across many changes within days. A codebase that is uniform but plain is cheaper for agents than one that is half modern and half legacy.

**Fix:** P11. Name the one current way and its canonical example in the module guide, add a lint rule that rejects the legacy idiom in new code, and migrate the rest.

**Not a flag when:** the legacy idiom sits in code nobody changes and the lint rule already blocks new uses.

## V: Verification

### AF14 No fast scoped check

**Signal:** the only test command runs the whole suite; tests read secrets, call the network, or need a shared database; a module's checks take minutes or run only in CI.

**Why agents suffer:** agents skip the slow check or wait on it, and shared resources make parallel runs interfere, so results stop meaning anything.

**Fix:** P8. One command per module, hermetic, seconds long; replace external services with in-memory fakes at the boundary.

```text
Before
  test: start shared database, load secrets, run [test framework] on everything (minutes)

After
  test billing: run [test framework] billing/ with an in-memory store (seconds)
  test all:     run every module's scoped check
```

Each agent verifies its own module in seconds without touching shared resources.

**Not a flag when:** the suite as a whole already runs hermetically in seconds.

### AF15 Nondeterministic tests

**Signal:** search tests and the code they cover for current-time reads, randomness without a seed, sleeps used as waits, and fixtures shared and mutated across tests. History cue: retry settings, or tests that flip between red and green on reruns.

**Why agents suffer:** a flaky red sends an agent chasing a bug it did not cause, and a flaky green lets a real bug merge.

**Fix:** P8. Inject the clock, the seed, and the state; give each test its own fixtures.

Example: [P8](principles.md#p8-fast-hermetic-deterministic-checks).

**Not a flag when:** the test is a deliberately randomized property test with a logged, replayable seed.

### AF16 Unenforced mechanics

**Signal:** no formatter or linter config, or one that CI never runs; diffs full of whitespace and import-order churn; generated files without a "generated, do not edit" header; history where a generated file changed without its source.

**Why agents suffer:** each agent formats its own way, so diffs carry noise that conflicts, and hand edits to generated files vanish on the next regeneration.

**Fix:** P11. Run the formatter, linter, and generator in one check that fails on drift; mark generated files.

Example: [P11](principles.md#p11-mechanical-consistency).

**Not a flag when:** the project is a single-writer prototype with no shared branches.

### AF19 Weak checks

**Signal:** tests whose assertions cannot fail (no assertion, only "does not throw", snapshot of everything), mocks of the unit under test, untyped boundaries, or a low mutation score from `[mutation testing tool]` on a changed module.

**Why agents suffer:** when no person reviews a change, the checks are the review. A check that passes whatever the code does gives a green run that proves nothing, and agents merge on it.

**Fix:** P8. Assert observable behavior at the module's public entry, type the boundaries, and confirm a check fails when the behavior breaks: break the code once and watch it go red.

**Not a flag when:** the test is a deliberate smoke test and a stronger one covers the same behavior.

## Severity

A finding's severity is how many parallel changes it blocks or corrupts.

- `high`: most feature work must touch it, or it produces false green or missed call sites.
- `medium`: changes within one subsystem collide.
- `low`: local friction that slows one agent without blocking others.

Raise a finding one level when it sits on a public interface, schema, or contract that other modules depend on, since every dependent change waits on it. Lower it one level in private leaf code with no dependents, which an agent can cheaply rewrite.

In a review, a `high` finding the diff introduces is `issue (blocking)`; `medium` and `low` are suggestions.
