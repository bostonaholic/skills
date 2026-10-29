# Principles of agent-friendly code

Clean code used to mean easy for a human to read. When hundreds of agents
change one codebase in parallel, it means safe for autonomous change at
scale. An agent navigates by search, holds a bounded context window, works
in its own branch while others edit the same tree, trusts only what a check
proves, and cannot ask the author what was meant. Each principle below
removes one way those constraints turn into a broken merge or a wrong
change. Red-flag IDs (AF1 to AF19) name what each principle fixes.

## Contents

- P1 Additive change
- P2 Locality
- P3 Narrow explicit interface
- P4 Explicit contracts at boundaries
- P5 Static, greppable wiring
- P6 Fail loud and early
- P7 Isolated state
- P8 Fast, hermetic, deterministic checks
- P9 Mergeable change size
- P10 Knowledge beside the code
- P11 Mechanical consistency
- Writing checklist
- Trade-offs

## P1 Additive change

A new feature is new files. It registers itself from its own file, or lives
in a directory the loader scans by convention; it never edits a central list.

Fixes: AF1, AF2, AF3

Before:

```ts
// handlers.ts: every feature appends here
import { refund } from "./refund";
import { invoice } from "./invoice";
export const handlers = [refund, invoice];
```

After:

```ts
// handlers/refund.ts: one file per feature, nothing shared to edit
import type { OrderEvent } from "../events";
import { issueRefund } from "../refunds";

export const handler = {
  name: "refund",
  run: (e: OrderEvent) => issueRefund(e.orderId),
};

// handlers/invoice.ts: the same shape, with its own imports and name "invoice"
// loader.ts: loads every handlers/*.ts by directory convention; never edited per feature
```

Two agents adding handlers now create two files and never touch the same line.

## P2 Locality

Everything for one concept lives in one directory: its types, logic, storage,
and tests. A feature change touches few files, all in that directory.

Fixes: AF4, AF12

Before:

```text
models/refund.ts
services/refund-service.ts
controllers/refund-controller.ts
tests/services/refund-service.test.ts
```

After:

```text
refunds/
  index.ts        public entry
  refund.ts       type and rules
  store.ts        persistence
  refund.test.ts
```

An agent loads one directory into context and its diff stays inside it.

## P3 Narrow explicit interface

Each module exposes one public entry. Internals stay private, and a lint or
build rule rejects imports that reach past the entry.

Fixes: AF5, AF7

Before:

```ts
// checkout.ts
import { roundCents } from "../billing/internal/money";
import { taxTable } from "../billing/internal/tax-table";
const total = roundCents(subtotal * (1 + taxTable[region]));
```

After:

```ts
// billing/index.ts: the only importable path
export { priceWithTax } from "./internal/price";

// checkout.ts
import { priceWithTax } from "../billing";
const total = priceWithTax(subtotal, region);
```

An agent can rewrite `billing/internal/` freely; no other branch depends on it.

## P4 Explicit contracts at boundaries

Inputs and outputs that cross a module boundary have a declared type or
schema, are validated at the edge, and are pinned by a contract test.

Fixes: AF8

Before:

```ts
export function ship(order: any, express: boolean) {
  if (order.status === "pd") return carrier.send(order, express);
}
```

After:

```ts
export type Speed = "standard" | "express";
export type PaidOrder = { id: string; status: "paid"; address: Address };

export function ship(order: PaidOrder, speed: Speed): Shipment {
  return carrier.send(order, speed);
}
```

The type checker tells a distant agent what `ship` accepts; it does not have to read every caller.

## P5 Static, greppable wiring

Calls and imports are written out, and every name is specific and unique,
so searching a symbol finds every definition and call site.

Fixes: AF10, AF11, AF17

Before:

```ts
// utils.ts
export function handle(kind: string, payload: unknown) {
  return (actions as any)[`on${kind}`](payload);
}
```

After:

```ts
// refunds/dispatch-refund-event.ts
import { onRefundRequested, onRefundSettled, type RefundEvent } from "./refund-events";

export function dispatchRefundEvent(event: RefundEvent) {
  switch (event.kind) {
    case "requested":
      return onRefundRequested(event);
    case "settled":
      return onRefundSettled(event);
    default: {
      const unhandled: never = event;
      throw new Error(`Unhandled refund event: ${JSON.stringify(unhandled)}`);
    }
  }
}
```

A search for `onRefundSettled` now returns its real caller, so a rename misses nothing, and a new event kind fails the type check until an agent handles it.

## P6 Fail loud and early

An error surfaces where it happens, with its cause, so a broken change fails
a check instead of passing it. Whether a fallback is correct is the caller's
decision.

Fixes: AF9

Before:

```ts
export function loadRate(code: string): number {
  try {
    return rates[code].value;
  } catch {
    return 1;
  }
}
```

After:

```ts
export function loadRate(code: CurrencyCode): number {
  const rate = rates[code];
  if (rate === undefined) {
    throw new Error(`No exchange rate for ${code}`);
  }
  return rate.value;
}
```

An agent's broken change now fails a test at the lookup, naming the missing code.

## P7 Isolated state

State is passed in, not reached for, and importing a module does nothing, so
one agent's change cannot leak into another's code path or test run.

Fixes: AF6

Before:

```ts
// db.ts: connects on import
export const db = connect(process.env.DB_URL!);

// orders.ts
import { db } from "./db";
export const findOrder = (id: string) => db.get("orders", id);
```

After:

```ts
// orders.ts: the caller supplies the store
export type OrderStore = { get(id: string): Promise<Order | undefined> };

export function findOrder(store: OrderStore, id: string) {
  return store.get(id);
}
```

Each agent's test hands in its own store, so no branch's tests see another's data.

## P8 Fast, hermetic, deterministic checks

One command verifies one module in seconds, offline, with the same result on
every run. Time, randomness, and I/O come in as parameters. Each check fails
when the behavior it covers breaks; without a human reviewer, it is the review.

Fixes: AF14, AF15, AF19

Before:

```ts
test("expires after a day", async () => {
  const token = await api.issueToken(); // real network
  await sleep(86_400_000);
  expect(isExpired(token)).toBe(true);
});
```

After:

```ts
test("expires after a day", () => {
  const issuedAt = new Date("2030-01-01T00:00:00Z");
  const token = issueToken({ issuedAt });
  const later = new Date("2030-01-02T00:00:01Z");
  expect(isExpired(token, later)).toBe(true);
});
```

A green run is now proof, and an agent can rerun it after every edit.

## P9 Mergeable change size

One concern per change. Change a contract by expand and contract: add the new
form, migrate callers in separate changes, then delete the old form.

Fixes: AF7

Before:

```ts
// old: export type User = { name: string };
// one change renames the field and edits all 40 callers at once
export type User = { fullName: string };
```

After:

```ts
// change 1: expand; every old producer still compiles
export type User = {
  /** @deprecated use fullName */
  name: string;
  fullName?: string;
};

// changes 2..n: migrate one module at a time; producers write both fields,
// readers use `user.fullName ?? user.name`
// final change: contract, make `fullName` required and remove `name`
```

Each step merges on its own, so no change has to touch every module in lockstep.

## P10 Knowledge beside the code

Each module carries a short README or AGENTS.md that states its purpose,
public surface, invariants, and verify command. A constraint or rationale the
code cannot show goes in a test, a type, or that README or AGENTS.md, and in a
comment only when the code comments rules keep it: agents keep no memory
between sessions, so a reason left in chat is lost. Keep both true: a lying
doc is worse than none.

Fixes: AF13

Before:

```text
refunds/
  index.ts
  refund.ts
  store.ts
```

After:

```markdown
# refunds

Purpose: issue and track refunds against settled payments.
Public surface: `requestRefund`, `getRefund` from `index.ts`. Nothing else.
Invariants: a refund never exceeds its payment; amounts are integer cents.
Verify: `[test runner] refunds/`
```

An agent learns the rules and the check from the one directory it already opened.

## P11 Mechanical consistency

A formatter, a linter, and generators enforce one way to write things, run in
CI, and fix what they can. Generated files carry a header and are never
edited by hand. Agents copy the nearest example, so a lint rule retires a
legacy idiom before it spreads.

Fixes: AF16, AF18

Before:

```text
src/api/client.ts     hand-edited after generation
(no formatter config; style varies by author)
```

After:

```text
[formatter config]        run in CI and pre-commit
[linter config]           includes the import-boundary rule from P3
src/api/client.gen.ts     "// GENERATED by [generator]; do not edit"
schema/api.[schema ext]   the source an agent edits instead
```

Diffs carry only intent, so two agents' changes do not conflict over whitespace.

## Writing checklist

Run these before finishing new code. Each answer should be yes.

- Does this change add files rather than edit a file most features edit? (P1)
- Does every new identifier avoid a hand-picked number from a shared sequence? (P1)
- Does the change stay inside one module's directory? (P2)
- Do other modules reach the new code only through the module's public entry? (P3)
- Does every new boundary input and output have a declared type or schema? (P4)
- Can every call site of a new symbol be found by searching its name? (P5)
- Before adding a helper, did a search find no existing one that does the same job? (P5)
- Does every failure path raise or return an error with its cause? (P6)
- Is state passed in, with nothing happening at import time? (P7)
- Can the touched module's tests run alone, offline, in seconds, with the same result each time? (P8)
- Does each new test fail when the behavior it covers is broken? (P8)
- Is this one concern, small enough to merge without coordinating other changes? (P9)
- If the public surface, an invariant, or the verify command changed, does the module's README or AGENTS.md say so in this change? (P10)
- Did the formatter, linter, and generators run, with no hand edits to generated files? (P11)
- Does the new code follow the module's current idiom, not a legacy one found nearby? (P11)

## Trade-offs

- A small repo with a few contributors gains little from splitting; apply these where parallel edits actually collide.
- Do not split a module before a second responsibility appears. Premature directories scatter a feature as surely as a god module hides one.
- Indirection that breaks search costs more than the conflict it avoids. Prefer discovery by an explicit directory convention over reflection or string-built names.
- A registry file is fine when entries are one per line, sorted, and rarely change; sorted lines rarely conflict.
