# Reading sources

## Contents

- 2. Open the run cache
- 3. Resolve and normalize this session's transcript
- 4. Gather the other sources the prompt names

## 2. Open the run cache

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
no other file on disk. Step 3 searches for it on a host that exports no session
id of its own.

A **run** is one invocation plus every later turn that answers its approval
questions, named by the one run cache path this conversation printed. Later
commands take that absolute path literally. The cache is **never deleted**, so
the report stays auditable after the run ends.

## 3. Resolve and normalize this session's transcript

Run this step when the sources include this session: always without a prompt,
and with one that names this session or names no source. Otherwise skip to
step 4; the marker is unused.

```bash
node "<skill-dir>/scripts/resolve-transcript.mjs" "<the printed run cache path>"
```

Substitute `<skill-dir>` with this skill's own directory. Never interpolate a
host variable into it: `${CLAUDE_PLUGIN_ROOT}` exists on Claude Code alone, so
a command carrying it breaks on every other host.

The script writes `transcript.jsonl` into the run cache. **The lenses read only
that normalized file**, in consecutive chunks until its end. Do not select only
recent records or truncate long entries to fit a single tool response or
context window. Track the last record read when continuing across chunks.

The script reads the store of the host running this session: Claude Code,
Codex, or OpenCode. A Conductor session resolves as whichever of those it runs.
It identifies the session by the id the host exported, or, where the host
exports none, by a fixed-string search for the marker. It never returns an
unmatched session's content, takes the newest file, guesses from the working
directory, or picks among candidates. Named failures stop the run instead:

| Failure                    | What it means                                                                                                       | What to report                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `unsupported-host`         | neither supported agent exported a session id here                                                                  | the host, and that retro reads Claude Code, Codex, and OpenCode stores — Conductor through whichever of those it runs |
| `ambiguous-host`           | two agents claim this process — one is running inside the other's shell — and the marker settled neither transcript | both hosts named; no pick was made                                                                                    |
| `ambiguous-session`        | more than one childless OpenCode session carries this run's marker                                                  | every session id matched, and no pick                                                                                 |
| `invalid-session-id`       | the exported id is not a session id shape                                                                           | the value seen                                                                                                        |
| `no-session-store`         | the host records no transcripts here                                                                                | the path tried                                                                                                        |
| `no-match`                 | neither the session id nor the marker reached the store after one retry                                             | every pattern tried                                                                                                   |
| `multiple-matches`         | an invariant violation, since both signals are unique to this run                                                   | every path matched, and no pick                                                                                       |
| `sqlite-unavailable`       | this runtime cannot load the built-in `node:sqlite` module                                                          | the database path tried                                                                                               |
| `unreadable-session-store` | the OpenCode store lacks a required table or column, or a read of it failed                                         | the database path tried                                                                                               |
| `unsupported-format`       | the resolved store holds no records any supported host writes                                                       | the store, and the unrecognized-record count                                                                          |
| `unreadable-transcript`    | the resolved or named transcript file is missing, a directory, or not readable                                      | the path tried and the error code                                                                                     |
| `unwritable-run-cache`     | the normalized output could not be written into the run cache                                                       | the directory tried and the error code                                                                                |

Copy the script's counts into the report: the host, whether the session was
resolved by id or by marker, the format, records kept, records dropped per
type, malformed lines skipped, unrecognized records, and any prior history the
file does not carry. A Codex thread forked from another one leaves its earlier
turns in the parent's file, which this run does not read. If a lens cannot
finish reading, report its unread record range.

## 4. Gather the other sources the prompt names

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
  which writes `sources/<name>.jsonl` (suffixed `-2`, `-3`, ... when an earlier
  source took the name) and prints the same counts as step 3. Exclude this
  session's own file unless the prompt asked for it. OpenCode's past sessions
  live in SQLite and are not read; say so.
- **PR review comments, issues, and other tracker text**: fetch with the
  repository's authenticated `gh` (`gh api --paginate`), every call carrying
  the repository explicitly, and save the JSON response as the source file.
  "As many as you have access to" means paginate until the API stops, and
  report the count and the oldest item reached.
- **Anything else the prompt names** (a log file, a docs folder, a CI run): read
  it where it lives, or save its fetched content as a source file.

A source that cannot be read is reported with the reason and does not stop the
run while another source remains.
