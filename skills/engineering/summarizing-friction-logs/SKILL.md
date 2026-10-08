---
name: summarizing-friction-logs
description: Aggregates frog friction logs across every repository in a workspace plus the global log into one prioritized dashboard. Use when asked for the friction dashboard, all known friction or papercuts across repos, to list friction logs, or to decide which friction to fix first.
---

# Summarizing friction logs

Collect every [frog](https://frog.fm) friction entry in a workspace into one
read-only dashboard, so known friction can be prioritized in a single view.

## Rules

- **Read-only.** Never run `frog resolve` or `frog publish`, never edit
  entries, and never install frog.
- **Never drop entries silently.** Anything not rendered is counted.
- **`pending` matters most.** A `pending` entry is filed nowhere else, so it
  is invisible outside this dashboard; a `linked` one already has an issue.

## Find the logs

The workspace is the directory that holds the user's repositories: the path
the user gives, otherwise the parent of the current repository's main clone
(from a linked worktree, the first path `git worktree list` prints). Outside a
repository, ask once.

```sh
find <workspace> -maxdepth 3 -type d -path '*/.agents/friction-log' -not -path '*/.claude/worktrees/*'
```

Worktrees are excluded because they share the primary clone's log and would
double-count entries. `<workspace>/.agents/friction-log` also matches: it is
not a repo but the global store for system-wide and cross-repo friction (a CLI
used everywhere, machine setup, an agent harness). Label it `global`, never the
workspace's directory name, and never count it as a repo.

## Collect entries

```sh
frog list --cwd <scope> --format json
```

`<scope>` is the discovered path minus `/.agents/friction-log`. Entries carry
`id`, `title`, `severity` (`blocker`, `major`, `minor`), `state` (`pending` or
`linked`), and an optional `target` (upstream `owner/repo`). Without frog, read
each `<scope>/.agents/friction-log/<id>/friction.md`; its frontmatter carries
`title`, `severity`, and `target`.

Count each scope before reading detail. A scope with more than 15 entries is
bounded: sort by severity, then newest first, render only the top 10, and add
an aggregate line for the rest, for example
`+ 31 more (4 major, 27 minor) not rendered`.

For each rendered entry, read its `friction.md` and distill the body into a
one-line gist: what got in the way, plus the suggested fix when it names one.

## Dashboard

One Markdown dashboard, in this shape:

- **Header**: totals with global counted separately, for example
  `7 entries across 3 repos + 2 global: 1 blocker · 3 major · 5 minor`, plus
  any bounded scopes, for example `(bounded: global 41→10)`.
- **Table**, sorted by severity, then newest first. Glyphs: 🔴 blocker,
  🟠 major, 🟡 minor. **Logged** comes from the `id`'s `YYYYMMDDHHMMSS` prefix.
  Append `(upstream: owner/repo)` to the title when an entry has a `target`.

  | Sev        | Scope      | Entry | State   | Logged |
  | ---------- | ---------- | ----- | ------- | ------ |
  | 🔴 blocker | api-server | title | pending | Aug 19 |

- **Detail**: each entry's gist, grouped by scope, `global` last.
- **Footer**: scopes with zero entries, logs that could not be read, and one
  line per bounded scope with its total and the unrendered counts.
