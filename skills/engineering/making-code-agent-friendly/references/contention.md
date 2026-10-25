# Contention script

`scripts/contention.mjs` reads git history and prints where parallel changes
collide. It runs only reading git commands.

## Run

Check that `node --version` succeeds, then run:

```sh
node <skill-dir>/scripts/contention.mjs [--max-commits <n>] [--top <n>] [-- <path>...]
```

- It reads the last 500 non-merge commits (`--max-commits`) and caps each list
  at 20 rows (`--top`).
- It skips commits that touch over 50 files: bulk renames, reformatting, and
  dependency bumps are not feature work.
- Raise `--max-commits` when 500 commits cover only days of history.
- Exclude lockfiles and generated files with pathspecs, such as
  `-- . ':!<lockfile>'`, and rerun.

## Output

| Field                         | Meaning                                                           | Flags     |
| ----------------------------- | ----------------------------------------------------------------- | --------- |
| `hotFiles`                    | `share` of scanned commits that touch each file                   | AF1, AF2  |
| `coupledPairs`                | files in different directories that change together in 3+ commits | AF7, AF12 |
| `sequences`                   | directories holding 3+ files whose names start with digits        | AF3       |
| `scatter.medianDirsPerCommit` | distinct parent directories a typical commit touches              | AF12      |
| `commitsScanned`              | commits counted; `commitsIgnored` is the bulk commits skipped     |           |

Every row is a lead, not a finding. Open the file and apply the flag's "Not a
flag when" in the [red flags](references/red-flags.md) before reporting it.

## Exits

- **0:** printed the JSON. When `commitsScanned` is under 50, the history is
  too short to show a pattern: mark Contention `not measured`.
- **1:** git failed, the directory is not a repository, or it has no commits.
  Relay stderr, mark Contention `not measured`, and continue by reading code.
- **2:** usage error: an unknown flag, or a value that is not a positive
  integer. Fix the command and rerun.
