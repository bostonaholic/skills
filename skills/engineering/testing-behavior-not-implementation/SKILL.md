---
name: testing-behavior-not-implementation
description: 'Checks each test asserts what the code''s users can observe, so it fails when that behavior breaks and passes when only internals change. Use when the user says "test behavior, not implementation", or when writing, changing, or keeping a test. Not for auditing a whole suite; use auditing-tests.'
---

# Test Behavior, Not Implementation

A test is a claim about what the code does for its users: a caller, an end user, or another service.

- **Behavior** is what those users observe through the interface they use: return values, errors, state they can read back, and effects on systems outside the code, such as a request sent, a row written, or a message emitted.
- **Implementation** is what they cannot observe: private helpers, internal call order, intermediate data, and which internal collaborator did the work.

## Judge each test against two edits

- **Break the behavior.** Make the code return a wrong value, skip an effect, or do the effect twice. If the test still passes, it proves nothing. Usual causes:
  - an assertion looser than the contract
  - an expected value computed by the code under test
  - a restated constant or prompt string that never runs the code that reads it
  - an assertion on data the test built itself
- **Change the internals.** Keep every observable result the same and restructure the code underneath. If the test now fails, it is pinned to the implementation: it needs a rewrite on every refactor and still catches no bug.

Keep a test that catches the first edit and survives the second. Rewrite or delete the rest.

## Write a test that does both

- Drive the code through its users' interface with a concrete input.
- Derive the expected value from the requirement, not from a run of the code.
- Assert what the contract promises, no less and no more.

## The contract decides, not the assertion's shape

- When "an empty cart never charges" is the promise, asserting the payment client got no call is behavior. Pair it with a case where the charge happens, so the test shows it can see a call.
- The payload a mocked external service receives is behavior, because that service observes it. A call to an internal helper is implementation, because no user sees it.
- An empty list is the exact answer when no record matches, and a hollow check when the test only needs some result.
- An exact error message pins wording no caller reads. The error type callers branch on is the contract.
- A test can pin an invariant instead of a call, such as a key that must exist in two tables or a compile-time type check. The invariant is the behavior.
