# Review findings

- Group findings as **Critical** (causes or hides bugs, forces heavy mocking,
  or is copied across many files) then **Improvement**.
- Each finding gives its pattern, `file:line`, the problem and its callers,
  before and after code, complexity, and migration steps.
- Complexity is S (one file, no caller changes), M (several files, same public
  API), or L (public API, many callers, or persisted data or jobs).
- End with a recommended order: critical first, then lowest complexity.
