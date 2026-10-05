# Input

`$ARGUMENTS` is optional: a **retro prompt** saying what to retro on. Empty
means this session, read through the three lenses.

A prompt sets up to three things, and anything it leaves unsaid keeps its
default:

- **The question** — what to look for, e.g. "where agents took too long to
  find relevant information, or relied on out-of-date docs". It replaces the
  three lenses with one pass that answers it. Default: the three lenses.
- **The sources** — what to read, e.g. "my last 10 coding agent sessions" or
  "every GitHub PR review comment from my team you can access". Default: this
  session's transcript.
- **The targets** — where learnings should land, e.g. "suggest updates to
  `CODING_STANDARDS.md`, split into multiple files as needed". Default: any
  repository file the findings call for.

A prompt that is one bare skill name (`code-review`) means "this session,
learnings about that skill only": the scope rides into every lens pass and
the skill's `SKILL.md` becomes the default target.

**The prompt is the user's intent, and the only one.** Restate it before
anything is read, as the question, each source, and each target, so the user
can see how it was understood. A prompt that cannot be resolved into at least
one readable source **stops the run here** and says which part was unclear.

**The prompt never reaches a command as text.** Write it into the run cache
with the file-writing tool (`<run cache>/prompt.md`) once step 1 opens the
cache, and refer to it by that path. Every count, repository, or path the
prompt names is drawn out as its own scalar and held to an allowlist before a
command uses it ([external data rules](shared/external-data.md)).
