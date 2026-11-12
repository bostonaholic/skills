---
name: redesigning-from-first-principles
description: Redesigns an existing design as if a new requirement had been a founding assumption, then propagates it to every reference and delivers it in working increments. Use when the user explicitly asks to redesign for a requirement or from first principles. Never infer from a feature request. Not for redoing an attempt; use redoing-implementations.
disable-model-invocation: true
---

# Redesign From First Principles

Do not bolt the new requirement onto the current design. Redesign as if it
had been a founding assumption, so the result reads as if it was always
built that way.

1. **Read the whole design.** Read every file the requirement touches and
   the files that depend on them, until you can state the current design's
   assumptions. Name the assumption the requirement breaks.
2. **Design from scratch.** Ask: if this were written today with the
   requirement known from day one, what would be built? Describe that target
   design, then the bolt-on alternative, and say what the bolt-on would leave
   behind (special cases, flags, adapters, names that no longer fit). If the
   target design is the current design plus a small addition, say so and make
   that change; never redesign for its own sake.
3. **Plan the increments.** Break the path to the target into steps that
   each leave the system working and its checks passing. Order them so no
   step needs a later one.
4. **Get approval.** Reply with the broken assumption, the target design,
   what the bolt-on would leave behind, and the increments. Wait for
   approval before editing.
5. **Deliver one increment at a time.** After each, run the project's
   checks and fix until they pass before starting the next.
6. **Propagate to every reference.** Search for the broken assumption by
   name and by idea: types, names, comments, docs, examples, tests,
   fixtures, config, and rationale or decision sections. Update each to the
   new design, so none still describes the old one. Report what you changed
   and any reference you left, with why.
