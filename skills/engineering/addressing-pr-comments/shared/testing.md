<!-- Canonical file: shared/testing.md at the repository root. Edit it there, then run npm run sync-shared. -->

# Test quality policy

The bar for every test that lands in a commit, and the bar reviewers hold changed test files to.

## Value bar

Every test costs time to read, run, and keep current. It pays for that only when it guards behavior a caller can see, a likely regression, or a contract that stands apart from the code. A bigger suite, a higher coverage number, or a green run is not progress without such a guard. A throwaway reproduction test deleted before the commit is evidence, not part of the suite.

## Authoring gate

Before adding or changing a test, answer each question in writing:

1. What goes unguarded if you delete this test? Name a caller-visible behavior, an invariant, or a contract.
2. Which likely bug turns it red? Describe the bug, not the assertion.
3. Which test already catches that bug? Each contract has one owning test at the owner boundary, the layer that owns the behavior. A test at another layer needs a risk the owner's test cannot reach. When a parameterized test covers the contract, add a row instead of a near-copy.
4. Does production code need a hook, wrapper, flag, or export only this test uses? If so, drop it and test through the code real callers use.

A question with no answer stops the test. A test that then matches a [junk pattern](#junk-patterns) fails the gate unless the [retention bar](#retention-bar) keeps it. If a behavior-preserving refactor would turn the test red, it pins the implementation: move its assertions to the owner boundary.

The bar never removes a test the task explicitly asks for. Keep it and record `task-required, fails <class>`.

## Junk patterns

Each class names one way a test costs more than it protects. A new test in any class fails the authoring gate; a reviewer flags a changed test in any class unless the retention bar keeps it.

- **Cannot fail.** It passes whether the behavior works or not: it asserts nothing; its expected value comes from the code under test or a copy of its logic, or from a mock configured to return it; or a rejection test goes green because a different check rejects the input first. Ask: if the implementation were wrong, could this expected value still be right? A test you never saw fail proves nothing; when the behavior already exists, break it temporarily, watch the test go red, and restore it.
- **Restates the source.** It holds its own copy of an export list, fixture fields, or a manifest and compares it with the real one, or reads a source file for a literal line or string. It changes with every edit and catches nothing else.
- **Duplicates stronger proof.** A test at a stronger boundary already fails on the same regression: a private helper's call pattern already covered at the public boundary, two tests pushing the same kind of input through one contract, or callers repeating cases a shared helper's own test runs.
- **Keeps test-only code alive.** The test is the only reason some production export, global, or wrapper exists.
- **Promises more than it checks.** The name, fixture, or mock claims a behavior no assertion observes: the mock does the work under test, the fixture hands over the ordering or callback the code should produce, or a test named "clears the cache" never asserts the cache is clear.
- **Depends on luck.** Its outcome, not merely its text, depends on the real clock or future dates, fixed sleeps, scheduler order or missing awaits, shared state or missing teardown, unseeded randomness, real networks, fixed ports or leaked resources, unordered results read by position, exact float equality, or platform, locale, timezone, or CI parallelism. `Date.now()` in a log line does not count; one feeding an assertion does.

## Retention bar

A test that looks like a junk class stays when it guards something no other test guards:

- A contract other code relies on: a public interface, protocol, configuration or data format, storage layout or migration, security rule, default value, or release artifact.
- A call sequence a caller can see.
- A likely regression whose failure mode you can name.
- A source-text check when no cheaper independent guard exists. It goes red when a user-visible key, byte, or path changes and stays green when only internal names change.

When a kept test goes red, suspect the product first: reproduce, repair the owning code, keep the test. Never delete a test for being slow or for reading code without running it.

## Removal evidence

Before a change deletes or weakens a base-branch test while keeping the behavior it covers, fill in all seven fields:

| Field            | What to record                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------ |
| Location         | The test name and the file that holds it.                                                  |
| Origin           | The commit or issue that added the test, and why the test exists.                          |
| Caught bug       | The failure that the test can detect today.                                                |
| Callers          | Each non-test caller of the code that the test covers.                                     |
| Remaining proof  | The stronger owner-boundary test that still catches that bug, or why no test needs to.     |
| Freed code       | The code that the removal lets you delete, or "none".                                      |
| Risk and command | What can go wrong, and the focused command whose green run shows that the removal is safe. |

Keep the test while any field is empty. Put the record in the body of the commit that removes the test; when a plan step orders the removal, the step supplies the fields. A deleted test is exempt only when the same change deletes the behavior it covers.

## Regression tests

A bug-fix regression test goes red on the pre-fix code, and the red comes from the assertion written for that bug. Put one test at the owner boundary, not one per layer the bug passes through. Record the Red run: the command and the failing assertion it printed.

## Prove a race with two connections

A claimed race is proven by a test that reproduces it and fails before the fix, never by reading code. Drive each side on its own connection: a transactional test harness puts both sides on one connection, which hides the conflict. Gate the interleaving with explicit handoffs so it does not depend on the scheduler, then assert the surviving state. The handoffs make the outcome reachable; they are not the assertion.

Detect blocking by whether the second side completes within a timeout. Engine lock tables show only your own transactions without elevated privileges, so an empty result there is not evidence that nothing is locked.

## Prove a coverage gap by mutation

To show a suite does not cover a behavior, delete the code that implements it and run the suite. A green run proves the gap. Restore the code at once.

A mutation that turns many tests red proves nothing specific. The discriminating result is one mutation that fails exactly the test that claims the behavior, and no other.
