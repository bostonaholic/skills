<!-- Canonical file: shared/pr-body-rules.md at the repository root. Edit it there, then run npm run sync-shared. -->

# PR body rules

Rules for every PR body a skill writes.

## PR references

Write every PR number in a body as a full link, `[#<n>](<pr-url>)`, never a
bare `#<n>`. GitHub does not autolink a PR's own number inside its body, so a
bare self-reference renders as plain text.

## Stack table

Every stacked PR body carries a `## Stack` table of every PR in the stack,
bottom (merges first) to top, with columns `Order`, `PR`
(`[#<n>](<pr-url>)`), and `Concern`. Bold this PR's row:

```markdown
## Stack

| Order | PR                                                 | Concern                          |
| ----- | -------------------------------------------------- | -------------------------------- |
| 1     | [#101](https://github.com/owner/repo/pull/101)     | Add the parser                   |
| **2** | **[#102](https://github.com/owner/repo/pull/102)** | **Wire the parser into the CLI** |
| 3     | [#103](https://github.com/owner/repo/pull/103)     | Document the new flag            |
```

When the stack gains, loses, or reorders a PR, rewrite the table in every open
PR of the stack. Omit the section for a PR that is not stacked.
