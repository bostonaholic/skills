# Critique mode

Critique through three lenses, each in a fresh-context, read-only subagent
given the explanation, the relevant paths, and its lens, so it judges the
code rather than your explanation. Where subagents are unavailable, run the
lenses yourself and say so.

- **Abstraction fit and boundary discipline**: does each abstraction earn its
  place; do boundaries sit where things change independently; is validation
  at entry points; is it testable in isolation?
- **Data model and complexity spend**: do structures fit access patterns; are
  types honest about runtime shapes; is complexity where the domain needs it?
- **Evolution readiness and consistency**: how much moves when the likely next
  requirement lands; which hardcoded assumptions would need relaxing; does the
  area follow the codebase's patterns, and is any divergence explained?

Each finding is **structural** (wrong boundary, broken model, coupling that
blocks future work), **concern** (real friction), or **observation**, with
code evidence: a dependency chain shown, never asserted. Architectural
findings only; line-level review belongs to `reviewing-code`. Never suggest a
rewrite without a demonstrated problem.

Judge as the lead, not an aggregator. Sort every finding into **Act on**,
**Consider** (real, unclear cost/benefit), **Noted**, or **Dismissed** (wrong,
missing context, or style preference; say which). For each **Act on** item,
name the smallest corrective change, a material trade-off, and the fact that
would change the advice.

Present the explanation first, standing on its own, with the verdict below it.
