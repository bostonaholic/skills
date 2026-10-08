# Applying edits

## Contents

- Read the plan this conversation printed
- Per item: the precondition that makes the undo true
- Where a write may land
- How a skill edit is authored

## Read the plan this conversation printed

Apply the plan file in the run cache whose absolute path **this conversation
printed**. Never read a plan file from a directory this conversation did not
print. With no printed path (a fresh session, or a compaction that lost it),
stop and ask for the absolute plan path rather than guessing at one.

Apply only the items the approval answer named. Nothing is written for an item
the answer left out.

## Per item: the precondition that makes the undo true

One approval question covers the whole file-write class only because of this
precondition: every write is a new file (undone by deleting it) or an edit to a
tracked, clean file (undone by `git restore -- <path>`), so neither undo can
reach the user's own work. Never skip it.

**An edit** is applied only while its target is tracked and clean:

```sh
git ls-files --error-unmatch -- "<path>"   # not tracked -> skip this item
git status --porcelain -- "<path>"         # non-empty -> skip this item
git hash-object -- "<path>"                # differs from the plan's pre-image -> skip this item
```

An item that fails any check is **skipped** with the reason reported, never
written. A changed blob id covers a target that already carries the edit and a
target that changed some other way.

**A creation** is applied only while its named path does not exist. A path that
does exist skips that item and reports it, because this skill overwrites
nothing it did not create.

After each write, re-read the file and confirm it carries the approved text.
Report any item that does not as skipped, with what the file holds instead.

## Where a write may land

Run `scripts/write-target.mjs` on every target rather than resolving it by
hand: a skill name or file path comes from source text, so it is untrusted. A target
that is a skill goes by **name**; every other target goes by **repo-relative
path**.

**The value never appears in a command as a literal.** Write it into the run
cache with the file-writing tool, then read it back and hold it to a character
allowlist before it reaches anything else. For a skill name:

```sh
NAME="$(cat "<run cache>/name-<n>.txt")"   # substitution output is not re-parsed
LC_ALL=C                     # in a UTF-8 locale the bracket set is collation-dependent
case "$NAME" in
  ''|-*|*[!a-z0-9-]*)
    echo "refusing: a proposed name must be a skill name, lowercase and hyphenated" >&2
    exit 1 ;;
esac
node "<skill-dir>/scripts/write-target.mjs" "$(git rev-parse --show-toplevel)" "${NAME:?}"
```

For any other file, the same read-back with an allowlist of plain path
characters:

```sh
TARGET="$(cat "<run cache>/path-<n>.txt")"
LC_ALL=C
case "$TARGET" in
  ''|-*|/*|*[!A-Za-z0-9._/-]*)
    echo "refusing: a proposed path must be plain and repo-relative" >&2
    exit 1 ;;
esac
node "<skill-dir>/scripts/write-target.mjs" "$(git rev-parse --show-toplevel)" --path "${TARGET:?}"
```

The script also refuses `..`, `.`, and empty segments, and any path whose
resolved real path leaves the repository. Reference the value only as `"$NAME"`
or `"$TARGET"` within that same command.

- **A refused name or path** drops only that one item, named in the report,
  while the others proceed.
- **An edit** lands at the script's `edit target`, under its `edit root`: the
  skills root the running host loads. The script finds the skill at
  `<edit root>/<name>/` or one category level down at
  `<edit root>/<category>/<name>/`, and refuses the name when more than one of
  those holds it; that refusal drops only that item, named in the report with
  the paths the script printed.
- **A shadowed copy** is a copy of the same skill under the other skills root
  (`<repo>/skills/` or `<repo>/.claude/skills/`), printed as `shadowed copy:`
  lines. The report names each one and leaves it untouched.
- **A skill creation** only ever targets the script's `create target`,
  `.claude/skills/<name>/SKILL.md` under the repository, and only when that
  path does not exist. Adding a skill to a distributed plugin's own `skills/`
  directory is a release decision, so it goes to Backlog instead. Create a
  missing parent directory as part of the write.
- **Every resolved real path must stay inside the repository**, so a symlinked
  directory cannot carry a write out of it.
- **A path target** is any file inside the repository: an edit to a tracked
  file, or a new file such as one of several `CODING_STANDARDS` split files.
- **Never write** `~/.claude/**` (a plugin update overwrites cached skills) or
  a sibling repository.

## How a skill edit is authored

A non-skill file follows its own existing structure and the repository's
writing guidance; the rules below apply to `SKILL.md` targets only.

Follow the repository's own skill-authoring guidance when it has one, such as a
repo skill whose directory name matches `create-*skill*`. Otherwise call the
Skill tool with `skill-creator`. If that skill is missing, apply these rules:

- `name` and `description` always.
- The description starts with one concise semantic use condition; add a second
  only for distinct intent. Do not quote exact requests or repeat `/<name>`.
- `argument-hint` **and** `effort` together when the skill is user-invocable.
- `user-invocable: false` and **no** `effort` otherwise.
- No other frontmatter field.
