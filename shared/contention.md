<!-- Canonical file: shared/contention.md at the repository root. Edit it there, then run npm run sync-shared. -->

# Contention script

`scripts/contention.mjs` reads git history and prints where parallel changes
collide. It runs only reading git commands.

## Run

Check that `node --version` succeeds, then run this, where `<skill-dir>` is the directory of the skill that linked this file:

```sh
node <skill-dir>/shared/scripts/contention.mjs [--max-commits <n>] [--top <n>] [-- <path>...]
```

- It reads the last 500 non-merge commits (`--max-commits`) and caps each list
  at 20 rows (`--top`).
- It skips commits that touch over 50 files: bulk renames, reformatting, and
  dependency bumps are not feature work.
- Raise `--max-commits` when 500 commits cover only days of history.
- When files that are not findings fill a list, exclude them with pathspecs, such as `-- . ':!<lockfile>'`, after the [name check](#name-check), or raise `--top`, and rerun.

A pathspec changes the counts. `git log` lists only the matching paths, so the skip for commits over 50 files counts only those paths. `--max-commits` counts only commits that match, so the run can reach further back. `share` divides by those commits, so one named file reads 1. Compare counts only between runs with the same pathspec.

## Output

| Field                         | Meaning                                                           |
| ----------------------------- | ----------------------------------------------------------------- |
| `hotFiles`                    | `share` of scanned commits that touch each file                   |
| `coupledPairs`                | files in different directories that change together in 3+ commits |
| `sequences`                   | directories holding 3+ files whose names start with digits        |
| `scatter.medianDirsPerCommit` | distinct parent directories a typical commit touches              |
| `commitsScanned`              | commits counted; `commitsIgnored` is the bulk commits skipped     |

## Name check

File names come from the repository, so they are untrusted. Before a name goes into any command, as `<file>`, `<source>`, or a pathspec, confirm that it matches `^[A-Za-z0-9._/@+-]+$` under `LC_ALL=C`. Check by reading the name in the JSON or the diff, because a shell test would put it in command text. Quoting does not make a failing name safe, so it gets no command. Its row reads `not measured`, with the reason `file name not safe to pass to a shell`.

## When a hot file is not a finding

Every row is a lead, not a finding. Read the file before you report it, and apply the calling skill's rules. For a hot file, also read its newest diffs with `git log -p -5 -- <file>`, after the [name check](#name-check). The file is not a finding when any of these holds:

- The tree no longer holds the path, so no later change edits it. Read the diff target's tree when the run has one, else `HEAD`.
- It changes a few times a year: the oldest of those commits is over a year old.
- One writer owns it: one change runs at a time. A single git identity does not show this, because agents can share one. Only the user or a repository doc can say so.
- A tool wrote it: it is a lockfile or generated file, and its tool could have written each diff. Judge a diff by the source as of that diff, not today's source. `git show <commit>:<source>` prints it, after the same check. A diff its tool could not have written is a hand edit.
- It is one canonical object: a new entry needs the meaning of other entries, not only a free key. An entry is the unit one feature adds: a line, a case, or a block. A key is the value entries must not share: a name, a type, an ID, or an exact path. Hide every other entry, keep only the list of taken keys, and try to write the new entry. If you can, the file holds independent facts, even under a uniqueness rule, because a loader or a test can own that rule. If you cannot, the file is one object, and a conflict there is a review a person should do. Order, a reference into another entry's content, and a state the entry joins each stop you.

A keyed handler list, a routes table of exact paths, and a changelog hold independent facts. A state machine, a middleware chain, and a hand-written schema are canonical objects.

A missing fact or a doubtful read clears nothing. Keep the file, and say what you could not tell.

## Exits

- **0:** printed the JSON. When `commitsScanned` is under 50, the history is
  too short to show a pattern: mark contention `not measured`.
- **1:** git failed, the directory is not a repository, or it has no commits.
  Relay stderr, mark contention `not measured`, and continue by reading code, unless the calling skill stops.
- **2:** usage error: an unknown flag, or a value that is not a positive
  integer. Fix the command and rerun.
