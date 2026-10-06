# Input and result

## Contents

- Resolve the PR once
- The entries file
- Normalizing caller strings
- Refusals
- The result

## Resolve the PR once

`$ARGUMENTS` carries the whole invocation: an optional `<pr-number-or-url>`
and an optional `--entries <path>`. With no PR token, the current branch's PR
is resolved. Run `scripts/resolve-pr.sh` first: it splits the arguments,
validates the PR token alone, resolves the PR in one call, and writes each
derived value into the run's own directory. Bind the values the inline `gh`
commands below and in [verify](references/verify.md) expand:

```bash
RUN_DIR="$(mktemp -d)"                     # every temporary this run writes
printf 'RUN_DIR=%s\n' "$RUN_DIR"           # later commands reuse this literal path
"<skill-dir>/scripts/resolve-pr.sh" "$ARGUMENTS" "$RUN_DIR" || exit
PR_URL="$(cat "$RUN_DIR/pr-url")"          # the canonical URL, on the base repo
PR_HOST="$(cat "$RUN_DIR/pr-host")"
OWNER="$(cat "$RUN_DIR/owner")"
REPO="$(cat "$RUN_DIR/repo")"
NUMBER="$(cat "$RUN_DIR/number")"
REPO_SPEC="$(cat "$RUN_DIR/repo-spec")"    # gh's own [HOST/]OWNER/REPO form
```

`|| exit` keeps the script's own status. Exit 1 is a refusal (a malformed or
unresolvable argument, or no PR for the current branch) and names the reason
on stderr; report it with `outcome: refused`. Exit 2 is a fault (a missing
`gh`, or a bad run directory); report it as a fault.

`$RUN_DIR` is this run's whole state: every script reads its inputs from it and
writes its outputs back into it, so its literal path is the one value that has
to survive from one command to the next, and the path the file-writing tool
writes into. A command that lost the others re-binds them by re-running the
six `cat` lines above against the same `$RUN_DIR`. Never re-run the
`mktemp -d` and `resolve-pr.sh` lines: they resolve the PR a second time into
a fresh directory and leave everything this run produced behind in the old
one.

**`repo-spec` carries the host, and every later call uses it.** Every inline
`gh pr view` and `gh pr edit` takes `--repo "$REPO_SPEC"`, never
`--repo "$OWNER/$REPO"`, which resolves against whichever host `gh` considers
default and so names a github.com repository on an Enterprise PR. The
read-back's `gh api` takes the host through `--hostname "$PR_HOST"`
([verify](references/verify.md)). `pr-host` is the value the harvest's
attachment allowlist is derived from
([upload and body edit](references/upload-and-body-edit.md)).

`gh pr view` returns the URL on the **base** repository, which is the PR a fork
contribution is edited on. Every later call carries `--repo "$REPO_SPEC"`, so
no command depends on the remote set of the current checkout.

A merged, closed, or draft PR is in scope. Edit it and say which state was
edited.

## The entries file

One input, one file, JSON. A calling skill writes it from its capture manifest. A
session with no `--entries` flag writes the same JSON itself under
`$(mktemp -d)` from the request — the paths exactly as the user gave them, and
`root` set to the directory those images already live in, never to the
directory the JSON was just written to.

```json
{
  "root": "/Users/dev/Desktop/shots",
  "entries": [
    { "path": "/Users/dev/Desktop/shots/login.png", "caption": "login", "state": "default" },
    { "path": "/Users/dev/Desktop/shots/login-error.png", "caption": "login-error", "state": "error", "note": "seeded" }
  ],
  "notes": ["2 states skipped — see manifest"]
}
```

Per entry: `path` and `caption` are required, `state` and `note` are optional.
One top-level `notes` list carries caller-supplied discrepancy lines. Captions
need not be unique.

**When the request names no caption for a path, the caption is that file's
basename with its extension removed.** Never describe the image instead: a
guessed description is a claim in a public body. Ask only when the basename is
empty after normalization.

Write the file with `jq`, never by pasting the paths into a JSON string: a path
is caller text, and a quote or a backslash in one rewrites the document rather
than filling a slot in it ([external-data rules](shared/external-data.md)). This is the whole
step; each entry's caption is that entry's own path, basename-only and
extension-stripped:

```bash
ENTRIES_DIR="$(mktemp -d)"
ENTRIES_FILE="$ENTRIES_DIR/entries.json"
CAPTURE_ROOT=/Users/dev/Desktop/shots          # where the images ALREADY live
jq -n --arg root "$CAPTURE_ROOT" '{
  root: $root,
  entries: ($ARGS.positional | map({
    path: .,
    caption: (split("/") | last | sub("\\.[^.]+$"; ""))
  })),
  notes: []
}' --args "$CAPTURE_ROOT/login.png" "$CAPTURE_ROOT/login-error.png" >"$ENTRIES_FILE"
printf '%s\n' "$ENTRIES_FILE" >"$RUN_DIR/entries-file"   # what `upload.sh` reads
```

The last line is what makes this path reachable: `resolve-pr.sh` writes an
empty `entries-file` when the invocation carried no `--entries`, and
`upload.sh` reads that file rather than a variable.

`--args` binds each path as a positional value, so `jq` never parses one. Add a
`caption`, a `state`, or a `note` the request supplied by binding each with its
own `--arg`; add each discrepancy line to `notes` the same way.

What `root` bounds is scope, not trust; the check that survives a hostile
entries file is the per-entry validation in step 5 of
[upload and body edit](references/upload-and-body-edit.md).

## Normalizing caller strings

**Every caller-supplied string that reaches a PR body is normalized once, at
read, by the same function.** The rule is over the _class_, not over a field: a
new field that renders is normalized because it is caller text, and the list
below is the current membership rather than the reason. No backstop in
`scripts/splice.mjs` replaces the normalization.

Normalize: strip newlines, trim, collapse whitespace runs, then
backslash-escape `\`, `!`, `[`, `]`, `<`, and `>`. `\` is escaped first, so no
escape can be undone by a caller-supplied backslash.

**`state` also loses its parentheses.** It renders inside the `(<state>)`
parenthetical, which `scripts/splice.mjs` recognizes by a grammar admitting one
level of nesting, so an unbalanced or deeper `state` makes the next run's
`--check` refuse a section this skill itself wrote. Remove `(` and `)` from
`state` after the whitespace collapse. Escaping would not do: a backslash
leaves the character in place, and the grammar still sees it.

The members, all of them caller data:

| String                                  | Where it renders                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| Each entry's `caption`                  | Bold body text in the section                                                   |
| Each entry's `state`                    | The `(<state>)` parenthetical beside the caption                                |
| Each line of the top-level `notes` list | One marked blockquote (`> _note:_`) body line each, resolved and degraded alike |
| Each entry's `path`                     | The degraded form, and any failure line                                         |
| Each failure `reason`                   | The `Not uploaded:` line                                                        |

**A path renders as its basename, never in full.** A PR body is public and an
absolute path leaks the operator's directory layout and username. Keep the
absolute path in `result.json` and in the operator report, and render
`<basename>` in the body. For the same reason **a failure `reason` written into
the body must carry no filesystem path**; a reason that names one is reported
to the operator and rendered in the body as the failure class alone.

A caption that is empty after normalization fails its entry. A `notes` line
that is empty after normalization is dropped. The caption is never alt text:
the alt is `screenshot-<NN>`, the entry's index, and holds no caller text at
all.

## Refusals

Each refusal below mutates nothing: no asset is attached and no body is
written, so `outcome` is `refused`.

- `resolve-pr.sh` (exit 1) refuses a malformed PR number or URL, an
  unresolvable PR, no PR for the current branch, and a bare PR number with no
  local checkout (ask for the full PR URL).
- `upload.sh` (exit 1) refuses each of these before its first `gh` call:
  - an `--entries` path that does not exist or is not readable;
  - invalid JSON (reported with the parser's own message), or a top-level
    value that is not an object with an `entries` array;
  - **zero entries**: there is nothing to attach and nothing to write;
  - **an entry lacking `path` or `caption`**, named by its zero-based index.
    The whole run refuses rather than dropping the entry, because a silently
    shortened list is indistinguishable from a caller that meant to send
    fewer images;
  - a missing, relative, or unresolvable top-level `root`. Containment cannot
    be checked against a root that does not resolve.

## The result

Write `result.json` beside the entries file, and restate it as prose in the
run's report.

| Field                     | Value                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| `owner`, `repo`, `number` | The resolved PR, as bound above                                                               |
| `outcome`                 | One of the six values below                                                                   |
| `assets`                  | Array **in entries order** of `{caption, path, url}`, `url` null when that entry did not land |
| `failures`                | Array of `{caption, path, reason}`                                                            |
| `body_written`            | Whether a body write landed                                                                   |
| `operator_note`           | The operator-facing note, or null. Never written into a PR body                               |
| `section`                 | The exact markdown written, or null                                                           |

`outcome` values:

| Value                  | Means                                                                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `uploaded`             | Every entry landed, the body was written, the read-back passed                                                                   |
| `partial`              | At least one entry landed and at least one failed                                                                                |
| `degraded`             | Nothing landed; the body carries the note and the captured file names as plain text                                              |
| `unverified`           | The body was written and the read-back did not pass                                                                              |
| `uploaded-not-written` | The assets landed and no body was written — the lost-update guard, and any splice refusal or fault reached after the attach step |
| `refused`              | Nothing changed anywhere: no asset landed and no body was written                                                                |

**`section` is null unless a write landed at least one URL and the read-back
passed.** That is the field a caller copies into other PR bodies, so
anything weaker must not travel.

`uploaded-not-written` covers both post-attach halts — the lost-update guard,
and a `scripts/splice.mjs` refusal or fault after the attach step, whose
`operator_note` carries the reason and the manual edit that clears it (step 6
of [upload and body edit](references/upload-and-body-edit.md)). A splice
refusal on a run where **nothing** landed is `refused` instead — nothing
changed anywhere.

For `uploaded-not-written`, `body_written: false` and `section: null`. The
assets are live and are named in `assets`, and the appended tails the attach
step left already render them — under an alt text the host derives from the
file it received, which this skill does not pin and does not clear on this
path. Report each tail verbatim in `operator_note`, so the report tells the
operator exactly what is on the PR right now.
