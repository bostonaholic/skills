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

Before each write, run
`bash "<skill-dir>/scripts/check-edit-target.sh" "$(git rev-parse --show-toplevel)" "<target>" "<pre-image>"`
with the target `write-target.mjs` printed and the plan's pre-image (a blob id,
or `absent` for a creation). Write only on `apply` (exit 0). On
`skip: <reason>` (exit 3), skip that item and report the reason; this skill
overwrites nothing it did not create. Exit 1 is an error: skip the item and
report the stderr line.

After each write, re-read the file and confirm it carries the approved text.
Report any item that does not as skipped, with what the file holds instead.

## Where a write may land

Run `scripts/write-target.mjs` on every target rather than resolving it by
hand: a skill name or file path comes from source text, so it is untrusted. A target
that is a skill goes by **name**; every other target goes by **repo-relative
path**.

**The value never appears in a command as a literal.** Write it into the run
cache with the file-writing tool, then pass the file:

```sh
node "<skill-dir>/scripts/write-target.mjs" "$(git rev-parse --show-toplevel)" --name-file "<run cache>/name-<n>.txt"
node "<skill-dir>/scripts/write-target.mjs" "$(git rev-parse --show-toplevel)" --path-file "<run cache>/path-<n>.txt"
```

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
