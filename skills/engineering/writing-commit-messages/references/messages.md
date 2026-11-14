# Commit messages

Each commit records one independently correct decision: what changed, why,
and how to understand or revert it without surrounding context.

## The 50/72 rule

- Subject: under 50 characters, imperative, specific, first word capitalized
  after any type prefix, and no final period. Complete "This commit will...".
- Body: blank line after the subject, wrap at 72 characters, and explain the
  motivation and any non-obvious caller, migration, or compatibility effects.

## Conventional Commits

Use `<type>[optional scope]: <description>`, an optional body, then optional
footers, with a type from the table below. The scope names the component, for
example `feat(auth):`.

Breaking changes require a `BREAKING CHANGE:` footer or `!` in `feat!:` or
`feat(api)!:`.

| Type       | Use                                 |
| ---------- | ----------------------------------- |
| `feat`     | User or API feature                 |
| `fix`      | Existing-behavior bug fix           |
| `refactor` | Restructure without behavior change |
| `test`     | Tests only                          |
| `docs`     | Documentation only                  |
| `chore`    | Build, tooling, dependencies        |
| `perf`     | Performance improvement             |
| `ci`       | CI/CD configuration                 |
| `revert`   | Prior-commit revert                 |

## Atomic commits

One logical change per commit, each leaving tests passing. Split unrelated
hunks into separate commits.

## A commit that ships a feature

The last commit before a PR, or one that completes a feature:

1. Summarize the complete user-visible feature, not the implementation steps.
2. Briefly list the important affected files or subsystems in the body.
3. Cite the issue, for example `Closes #42`.
4. Omit attempts, WIP notes, and details evident from the diff.

A complex change needs a body. Squash every `WIP:` commit before the PR.
