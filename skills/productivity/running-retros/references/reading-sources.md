# Reading sources

## Open the run cache

Create the run's cache directory first and print its absolute path:

```bash
RUN_DIR="$(mktemp -d "${TMPDIR:-/tmp}/running-retros.XXXXXXXX")" \
  || { echo "cannot create the run cache — stopping" >&2; exit 1; }
echo "run cache: $RUN_DIR"
```

A cache that cannot be created stops the run rather than falling back to
memory. With a prompt, write it to `<run cache>/prompt.md` now.

The printed path is **this run's marker**: the host records command output
inline in the transcript, so the path appears in this session's records and in
no other file on disk. The transcript resolver searches for it on a host that exports no session
id of its own.

A **run** is one invocation plus every later turn that answers its approval
questions, named by the one run cache path this conversation printed. Later
commands take that absolute path literally. The cache is **never deleted**, so
the report stays auditable after the run ends.

## Resolve this session's transcript

Do this when the sources include this session: always without a prompt, and
with one that names this session or names no source.

```bash
node "<skill-dir>/scripts/resolve-transcript.mjs" "<the printed run cache path>"
```

Substitute `<skill-dir>` with this skill's own directory. Never interpolate a
host variable into it: `${CLAUDE_PLUGIN_ROOT}` exists on Claude Code alone, so
a command carrying it breaks on every other host.

The script writes `transcript.jsonl` into the run cache. **The lenses read only
that normalized file.**

The script reads the store of the host running this session: Claude Code,
Codex, or OpenCode. A Conductor session resolves as whichever of those it runs.
It identifies the session by the id the host exported, or, where the host
exports none, by a fixed-string search for the marker. It never takes the newest
file, guesses from the working directory, or picks among candidates. A named
failure (exit 1, the name on the first stderr line, then `tried:` and `note:`
lines) stops the run; report all three.

Report the script's printed counts with the sources, and any prior history the
file does not carry: a Codex thread forked from another one leaves its earlier
turns in the parent's file, which this run does not read.

## Gather the other sources

Each source lands as a file under `<run cache>/sources/`, and each gets one line
in `<run cache>/sources.md`: what it is, where it came from (a path or URL), how
many items it holds, and what was asked for but not read. Gather read-only, with
whatever this host already holds; never authenticate, never write to a remote,
and never widen a source past what the prompt asked.

- **Past agent sessions**: find the files in the host's own store, newest first,
  for the repository this run is in (Claude Code keeps them in
  `~/.claude/projects/<project-slug>/`; Codex in its dated `sessions/` tree,
  matched by the working directory each rollout records). Normalize each with
  `node "<skill-dir>/scripts/resolve-transcript.mjs" "<the printed run cache path>" --file "<transcript path>"`,
  which writes `sources/<name>.jsonl` (suffixed `-2`, `-3`, ... when a
  different earlier source took the name; the same transcript normalized again
  reuses its path) and prints the same counts as above. A named failure here,
  such as `unreadable-transcript` or `unsupported-format`, does not stop the
  run: mark that session unread in `sources.md` with the failure name. Exclude
  this session's own file unless the prompt asked for it. OpenCode's past
  sessions live in SQLite and are not read; say so.
- **PR review comments, issues, and other tracker text**: fetch with the
  repository's authenticated `gh` (`gh api --paginate`), every call carrying
  the repository explicitly, and save the JSON response as the source file.
  "As many as you have access to" means paginate until the API stops, and
  report the count and the oldest item reached.
- **Anything else the prompt names** (a log file, a docs folder, a CI run): read
  it where it lives, or save its fetched content as a source file.

A source that cannot be read is reported with the reason and does not stop the
run while another source remains.
