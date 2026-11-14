# Reading sources

## Open the run cache

Open it as [session transcripts](shared/session-transcripts.md) says, with
`reflecting` as the skill name, and print its path. With a prompt, write
it to `<run cache>/prompt.md` now.

A **run** is one invocation plus every later turn that answers its approval
questions, named by the one run cache path this conversation printed. Later
commands take that absolute path literally.

## Resolve this session's transcript

Do this when the sources include this session: always without a prompt, and
with one that names this session or names no source. Resolve it as
[session transcripts](shared/session-transcripts.md) says. **The lenses read
only the normalized `transcript.jsonl` it writes.** Report its printed counts
and any prior history it names with the sources, and stop the run on a named
failure, reporting each of its lines.

## Gather the other sources

Each source lands as a file under `<run cache>/sources/`, and each gets one line
in `<run cache>/sources.md`: what it is, where it came from (a path or URL), how
many items it holds, and what was asked for but not read. Gather read-only, with
whatever this host already holds; never authenticate, never write to a remote,
and never widen a source past what the prompt asked.

- **Past agent sessions**: run
  `node "<skill-dir>/scripts/list-sessions.mjs" "$(git rev-parse --show-toplevel)" <count>`
  with the count the prompt asked for. Report its `found:` count with the
  sources. A named failure (exit 1, the name on the first stderr line) leaves
  past sessions unread; report the name and its `note:` line, and say OpenCode's
  SQLite store is not read when the name is `unsupported-store`. Normalize each
  `session:` path with the `--file` form in
  [session transcripts](shared/session-transcripts.md), which writes
  `sources/<name>.jsonl` and prints the same counts as above. A named failure
  here does not stop the run: mark that session unread in `sources.md` with
  the failure name.
- **PR review comments, issues, and other tracker text**: fetch with the
  repository's authenticated `gh` (`gh api --paginate`), every call carrying
  the repository explicitly, and save the JSON response as the source file.
  "As many as you have access to" means paginate until the API stops, and
  report the count and the oldest item reached.
- **Anything else the prompt names** (a log file, a docs folder, a CI run): read
  it where it lives, or save its fetched content as a source file.

A source that cannot be read is reported with the reason and does not stop the
run while another source remains.
