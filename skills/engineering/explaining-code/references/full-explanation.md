# Full explanation (ELIE)

Write for the person reviewing the code, not the person who wrote it. Assume
the reviewer knows software engineering fundamentals but none of this
codebase's internals, local vocabulary, arbitrary labels, or symbols. Use a
reference format the reader can skim past concepts they already know, and
deliver the complete explanation in chat as skimmable Markdown.

## Order

1. Open with a TL;DR that states the main point in plain language, before any
   concepts, diagrams, or definitions. Keep undefined local terms out of it;
   define an unavoidable one inline.
2. Build one dependency-ordered explanation from top to bottom. Start with the
   purpose and outcome, then add only the product and system context the next
   point needs. Define each local term, acronym, name, symbol, and phrase
   before or at its first use. Each point may depend only on context above it:
   never make the reader jump ahead, open a glossary, or cross between
   sections.
3. Unpack the local meaning behind important class, function, variable, and
   service names, acronyms, and domain terms. Treat specialized technology as
   concepts too: storage and cache behavior, queues, events, RPCs, framework
   APIs, deployment primitives, and datastore commands. Separate general
   engineering concepts from repo-specific meaning.
4. Give background on the service architecture and the workflows the change
   touches, such as client to server calls, async events, or job processing.

The expanded content alone must let the reviewer understand what the code
does, why it is needed, how the important parts work together, and the
evidence that the change is safe.

## Progressive disclosure

- Keep context that later sections need expanded and in the main reading
  order.
- Put optional detail (full code samples, edge cases, component internals) in
  clearly labeled collapsible sections, such as `<details>` blocks, after the
  reader has the high-level context.
- Never hide a prerequisite definition, or a fact the rest of the explanation
  needs, inside a collapsed section.
- Label each collapsed section in already-defined language, so the reader
  knows why to open it.
- Collapsed sections deepen understanding. They never repair gaps in the
  expanded explanation.

## Fallbacks and Failures

When the code has an error, fallback, or degradation path, include a section
titled **Fallbacks and Failures**. Explain the decisions that determine whether
execution fails fast, degrades gracefully, or falls back to another path, so
reviewers can judge whether that behavior fits. Ground each scenario in its
branch or error-handling code. Omit the section only when no such path exists;
never invent hypothetical ones.

## Examples, tables, and diagrams

- **Trace concrete data**: a sample request with realistic field values, a
  record before and after, a message on a topic, or a row written to a table.
  Fabricate representative values. Never use real personal data, secrets,
  customer data, or production payloads.
- **Tables**: use them only for short, comparable values. When a key column
  holds long unbroken strings (feature flag keys, URLs, code paths, fully
  qualified symbols, protobuf fields, UUIDs, opaque IDs), use definition
  lists, grouped sections, or repeated fields such as `Flag: ...`, so each
  long value wraps on its own line.
- **Diagrams**: match them to behavioral complexity, not line count. Draw one
  for interacting parts, non-obvious branching, or effects across systems; a
  self-contained tweak usually needs none. Pick the form that fits: sequence
  flow, before/after, branching, state machine, or data structure. Label every
  node and edge in plain language, and define each repo-specific name nearby.

## Engineering estimates

Give duration, staffing, delivery-date, or effort-sizing estimates only when
explicitly requested, including by an explicitly invoked workflow that calls
for them. Loading this skill automatically is not a request. Answer questions
about complexity, scope, difficulty, or effort with the concrete changes,
dependencies, unknowns, risks, and validation involved. Preserve the user's
constraints, attributed estimates, measured runtimes, and configured
durations. When an estimate is requested, state its assumptions and
uncertainty.

## Self-check

Before responding, read only the expanded content once, top to bottom, as an
unfamiliar reviewer:

1. Every term, diagram label, and symbol has its context before its first use.
2. No later expanded section depends on a collapsed section.

Reorder or add definitions until both checks pass.
