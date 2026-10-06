# Execution

## Step 1 — open the run cache

Create the run's cache directory first and print its absolute path:

```bash
RUN_DIR="$(mktemp -d "${TMPDIR:-/tmp}/running-retros.XXXXXXXX")" \
  || { echo "cannot create the run cache — stopping" >&2; exit 1; }
echo "run cache: $RUN_DIR"
```

A cache that cannot be created stops the run rather than falling back to
memory. With a prompt, write it to `<run cache>/prompt.md` now. The printed path is **this run's fallback marker**: the host records
command output inline in the transcript, so the path appears in this session's
records and in no other file on disk. Step 2 searches for it on a host that
exports no session id of its own.

A **run** is one invocation plus every later turn that answers its approval
question, named by the one directory whose absolute path this conversation
printed. Shell state does not survive between invocations, so later commands
take that absolute path literally rather than reading `$RUN_DIR` again. The
cache is disposable and is **never deleted**, so the report stays auditable
after the run ends.

## Step 2 — resolve and normalize this session's transcript

Run this step when the sources include this session: always without a
prompt, and with one that names it or names no source. Otherwise skip to
step 3; the marker printed in step 1 is unused.

```bash
node "<skill-dir>/resources/resolve-transcript.mjs" "<the printed run cache path>"
```

Substitute `<skill-dir>` with this skill's own directory. Never interpolate a
host variable into it: `${CLAUDE_PLUGIN_ROOT}` exists on Claude Code alone, so
a command carrying it breaks on every other host.

The script writes `transcript.jsonl` into the run cache. **The lenses read
only that normalized file**, in consecutive chunks until its end. Do not select
only recent records or truncate long entries to fit a single tool response or
context window. Track the last record read when continuing across chunks.
There is no per-span, record-count, or aggregate-size limit on the normalized
transcript.

The script reads Claude Code's `~/.claude/projects/<project-slug>/<session-id>.jsonl`,
Codex's `${CODEX_HOME:-~/.codex}/sessions/<YYYY>/<MM>/<DD>/rollout-<timestamp>-<thread-id>.jsonl`,
or OpenCode's SQLite database at `$OPENCODE_DB` (default
`${XDG_DATA_HOME:-~/.local/share}/opencode/opencode.db`). **Conductor is not a
store**: a Conductor session resolves as whichever backend it runs, and Cursor
Agent fails as `unsupported-host`. The session is identified by the host's
exported id (`CLAUDE_CODE_SESSION_ID`, `CODEX_THREAD_ID`), re-checked against
the file's header; only where a host exports none does the run fall back to a
**fixed-string** search for the marker. **Neither path returns a transcript's
content**: the marker search returns file names only, and the header check
returns only the id it read. So no unmatched session's content reaches a lens,
a proposal, or this context. Nothing takes the newest file, guesses from the
working directory, or picks among candidates. Named failures stop the run
instead:

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

Read the script's counts into the report: the host and whether the session was
resolved by id or by marker, the format, records kept, records dropped per
type, records dropped to the aggregate ceiling, spans truncated, malformed
lines skipped, unrecognized records, and any prior history the file does not
carry. **A partial read is stated, never absorbed.** A Codex thread forked from
another one leaves its earlier turns in the parent's file, which this run does
not read. If a lens cannot finish reading, report its unread record range. Say
so in the summary, and **never substitute your own memory of the session for
the part the transcript did not carry**.

## Step 3 — gather the other sources the prompt names

Each source lands as a file under `<run cache>/sources/`, and each gets one
line in `<run cache>/sources.md`: what it is, where it came from (a path or
URL), how many items it holds, and what was asked for but not read. Gather
read-only, with whatever this host already holds; never authenticate, never
write to a remote, and never widen a source past what the prompt asked.

- **Past agent sessions** — find the files in the host's own store, newest
  first, for the repository this run is in (Claude Code keeps them in
  `~/.claude/projects/<project-slug>/`; Codex in its dated `sessions/` tree,
  matched by the working directory each rollout records). Normalize each with
  `node "<skill-dir>/resources/resolve-transcript.mjs" "<the printed run cache path>" --file "<transcript path>"`,
  which writes `sources/<name>.jsonl` and prints the same counts as step 2.
  Exclude this session's own file unless the prompt asked for it. OpenCode's
  past sessions live in SQLite and are not read; say so.
- **PR review comments, issues, and other tracker text** — fetch with the
  repo's authenticated `gh` (`gh api --paginate`), every call carrying the
  repository explicitly, and save the JSON response as the source file. "As
  many as you have access to" means paginate until the API stops, and report
  the count and the oldest item reached.
- **Anything else the prompt names** (a log file, a docs folder, a CI run) —
  read it where it lives, or save its fetched content as a source file.

A source that cannot be read is reported with the reason and does not stop
the run while another source remains. **A partial read is stated, never
absorbed**, as in step 2.

## Step 4 — run the lenses over the sources

Without a prompt, run the three lens passes below in this session, one after
another, then synthesize their findings. With one, run the single pass the
prompt's question defines.
