---
name: summarizing-friction-logs
description: Aggregates frog friction logs across every repository in a workspace plus the global log into one prioritized dashboard. Use when asked for the friction dashboard, all known friction or papercuts across repos, to list friction logs, or to decide which friction to fix first.
---

# Summarizing friction logs

Collect every [frog](https://frog.fm) friction entry in a workspace into one
read-only dashboard, so known friction can be prioritized in a single view.
Check for frog with `command -v frog`; when it is missing, use the fallback in
step 3 and never install it.

## 1. Resolve the workspace

The workspace is the directory that holds the user's repositories. Use the path
the user gives. Otherwise use the parent of the current repository's top level
(`git rev-parse --show-toplevel`; from a linked worktree, use the main clone,
which `git worktree list` prints first). Outside a repository, ask once.

## 2. Discover the friction logs

```sh
find <workspace> -maxdepth 3 -type d -path '*/.agents/friction-log' -not -path '*/.claude/worktrees/*'
```

Depth 3 reaches `<workspace>/<repo>/.agents/friction-log`. Worktree paths are
excluded because worktrees share the primary clone's log and would double-count
entries. `<workspace>/.agents/friction-log` also matches: it is not a repo but
the global store for system-wide and cross-repo friction (a CLI or MCP server
used everywhere, machine and shell setup, an agent harness). Label that scope
`global` throughout, never the workspace's directory name, and never count it
as a repo. If nothing matches, report the workspace path and stop.

## 3. Collect entries per scope

```sh
frog list --cwd <scope> --format json
```

`<scope>` is the discovered path minus `/.agents/friction-log`: a repo root, or
the workspace for the global store. Each entry has `id`, `title`, `severity`
(`blocker`, `major`, or `minor`), `state` (`pending` or `linked`), and an
optional `target`, the upstream `owner/repo` the friction belongs to. Without
frog, read each `<scope>/.agents/friction-log/<id>/friction.md` directly; its
YAML frontmatter carries `title`, `severity`, and `target`.

## 4. Count before reading or rendering

Print the workspace path and each scope's total, for example
`Workspace: ~/src`, `global: 41`, `api-server: 18`, `web-app: 6`.

A scope with more than 15 entries switches to bounded mode; these limits keep
the dashboard readable. Sort its entries by severity (blocker, major, minor),
then newest first, and read and render only the top 10, plus an aggregate line
for the rest, for example `+ 31 more (4 major, 27 minor) not rendered`. Scopes
with 15 or fewer entries render in full. Never drop entries without saying so.

## 5. Read entry detail

For each entry selected for rendering, read
`<scope>/.agents/friction-log/<id>/friction.md` and distill its body into a
one-line gist: what got in the way, plus the suggested fix when the entry names
one. The list output carries only titles; the gist makes the dashboard
actionable.

## 6. Render the dashboard

Present one Markdown dashboard in the final message. The layout is exact: keep
these sections, their order, the columns, glyphs, and line formats; only values
change.

1. **Header**: total entries, repo count, and a severity breakdown over all
   entries, with global entries counted separately, for example
   `7 entries across 3 repos + 2 global: 1 blocker · 3 major · 5 minor`. Drop
   the `+ N global` clause when the global log is empty. Append any bounded
   scopes, for example `(bounded: global 41→10, api-server 18→10)`.
2. **Entries table**: every rendered entry in one table, sorted by severity,
   then newest first. Glyphs: 🔴 blocker, 🟠 major, 🟡 minor. Derive **Logged**
   from the `id`'s `YYYYMMDDHHMMSS` prefix. When an entry has a `target`,
   append `(upstream: owner/repo)` to its title.

   | Sev        | Scope      | Entry | State   | Logged |
   | ---------- | ---------- | ----- | ------- | ------ |
   | 🔴 blocker | api-server | title | pending | Aug 19 |
   | 🟠 major   | global     | title | linked  | Aug 20 |

3. **Detail**: one short paragraph per rendered entry (its gist), grouped by
   scope, so each row can be understood without opening files. Put `global`
   last: it is everyone's friction rather than one project's.
4. **Footer**: one line naming scopes whose log has zero entries (for example
   `No entries: docs-site, cli-tools`), a note for any log that could not be
   read, and one line per bounded scope, for example
   `Bounded: global, 41 total, showing 10, + 31 more (4 major, 27 minor) not rendered`.

## Notes

- Read-only: never run `frog resolve` or `frog publish`, and never edit entries.
- `pending` versus `linked` matters when prioritizing: `pending` entries are
  filed nowhere else, so they are invisible outside this dashboard.
