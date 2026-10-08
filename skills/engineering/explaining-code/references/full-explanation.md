# Full explanation (ELIE)

Write for the person reviewing the code, not its author. Assume the reviewer
knows software engineering but none of this codebase's internals, local
vocabulary, or symbols. Deliver the explanation in chat as skimmable Markdown.

## Order

1. Open with a TL;DR in plain language, before any concept, diagram, or
   definition. Keep undefined local terms out of it.
2. Build one dependency-ordered explanation. Start with purpose and outcome,
   then add only the context the next point needs. Define each local term,
   acronym, name, and symbol at or before its first use. Never make the reader
   jump ahead, open a glossary, or cross between sections.
3. Unpack the local meaning behind important names and domain terms, including
   specialized technology (cache behavior, queues, events, RPCs, framework
   APIs, datastore commands). Separate general concepts from repo-specific
   meaning.
4. Give background on the architecture and workflows the change touches.

The expanded content alone must let the reviewer understand what the code
does, why it is needed, how the parts work together, and the evidence that
the change is safe.

Put optional detail (full code samples, edge cases, internals) in labeled
`<details>` blocks after the high-level context, labeled in already-defined
language. Never hide a prerequisite definition, or a fact the rest of the
explanation needs, inside a collapsed section.

## Fallbacks and Failures

When the code has an error, fallback, or degradation path, include a section
titled **Fallbacks and Failures**: the decisions that determine whether
execution fails fast, degrades, or falls back, grounded in the branch or
error-handling code, so the reviewer can judge whether that behavior fits.
Omit it only when no such path exists; never invent hypothetical ones.

## Examples, tables, and diagrams

- Trace concrete data (a sample request, a record before and after) with
  fabricated values. Never use real personal data, secrets, or production
  payloads.
- Use tables only for short, comparable values. When a key column holds long
  unbroken strings (flag keys, URLs, code paths, qualified symbols, UUIDs), use
  definition lists or repeated fields such as `Flag: ...` so each value wraps
  on its own line.
- Draw a diagram for interacting parts, non-obvious branching, or effects
  across systems, not for a self-contained tweak. Label every node and edge in
  plain language.

## No estimates

Give duration, staffing, or effort estimates only when explicitly requested;
loading this skill is not a request. Answer questions about complexity or
effort with the concrete changes, dependencies, unknowns, and risks.

## Self-check

Before responding, read only the expanded content top to bottom as an
unfamiliar reviewer. Every term, label, and symbol must have its context
before first use, and no expanded section may depend on a collapsed one.
Reorder or add definitions until both hold.
