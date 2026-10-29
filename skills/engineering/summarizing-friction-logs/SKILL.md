---
name: summarizing-friction-logs
description: Aggregates frog friction logs across every repository in a workspace plus the global log into one prioritized dashboard. Use when asked for the friction dashboard, all known friction or papercuts across repos, to list friction logs, or to decide which friction to fix first.
metadata:
  say: "show the friction dashboard"
---

# Summarizing friction logs

Collect every [frog](https://frog.fm) friction entry in a workspace into one
read-only dashboard, so known friction can be prioritized in a single view.

## Rules

- **Read-only.** Never run `frog resolve` or `frog publish`, never edit
  entries, and never install frog.
- **`pending` matters most.** A `pending` entry is filed nowhere else, so it
  is invisible outside this dashboard; a `linked` one already has an issue.

## Collect

The workspace is the directory that holds the user's repositories. Resolve
`<skill-dir>` to this skill's absolute directory and run, adding
`--workspace <dir>` when the user names one:

```sh
node "<skill-dir>/scripts/collect-friction.mjs" [--workspace <dir>]
```

It prints JSON with the rendered `header`, `table`, and `footer`, and the
`gist_slots` to fill.

- **Exit 0**: build the dashboard below.
- **Exit 1**: report stderr and stop. When it says `not in a git repository`,
  ask the user once for the workspace and rerun with `--workspace`. When it
  says no friction log was found, name the workspace and suggest pointing the
  skill at the one that holds the logs.
- **Exit 2**: no log could be read. Report each stderr line and stop.

## Dashboard

One Markdown dashboard, in this order:

- **Header**: `header`, verbatim.
- **Table**: `table`, verbatim.
- **Detail**: one entry per `gist_slots` item, in that order, grouped under a
  heading per scope. Read the slot's `path` and distill its body into a
  one-line gist: what got in the way, plus the suggested fix when it names
  one. Gists stay with the model because they summarize prose.
- **Footer**: `footer`, verbatim, when non-empty.
