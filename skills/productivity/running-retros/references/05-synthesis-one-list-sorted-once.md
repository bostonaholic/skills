# Synthesis — one list, sorted once

Merge the passes' findings into one list, collapsing findings that name
the same cause. Every item lands in exactly one bucket:

- **Accepted** — a durable learning that belongs in a repository file. It
  names the target (a file to edit or create: a skill, `AGENTS.md`,
  `CODING_STANDARDS.md`, a doc), states the learning in one or two sentences,
  and cites its evidence. When the prompt named targets, prefer them; a
  finding that fits none of them names the file it does fit.
- **Rejected** — a finding that was true of one session or one item only: a one-off
  mistake, a preference already recorded, a fact about a specific ticket. One
  line of reason each, so a rejection is auditable rather than silent.
- **Backlog** — a finding a machine check would enforce better than prose.

**The Backlog criterion, applied once, here.** Classify the finding before
writing it:

- **Mechanical** — a fixed syntactic pattern, a banned call or API, an import
  shape, a file-location rule: anything restatable as a deterministic predicate
  over files at rest or over a command's exit status, with no judgment about
  intent. It is demoted to Backlog, and the item names the layer that would
  carry the check (`docs/testing.md`).
- **Judgement call** — cross-file consistency, "matches the surrounding
  style," anything that needs intent to decide. It stays Accepted as a file
  edit.

Default to the check over the rule. A finding that is half judgment and half
mechanics is demoted whole.

A prompt that asks for edits to a file such as `CODING_STANDARDS.md` still
has each mechanical finding demoted: the prompt names where judgment lands,
not where a check is skipped.

Then write the **plan file** to `<run cache>/plan.md` and print its absolute
path. It is the artifact the later turns read, so it is self-contained: every
proposed edit in full, the pre-image of every target file, the prompt
path, every source path from `sources.md`, the write-scope rules, the untrusted-content and
paraphrase-only rules, the evidence per item, and the check command to run
after the writes. A later turn needs no memory of what this turn reasoned.

Zero findings is a normal outcome: report "no durable learning found", ask
nothing, and write nothing further. That report is available **only when every
pass read every source whole**. A run that reached zero carrying an
unrun or partly read pass says so instead and names each one, so a reader of
the summary alone can tell a session that taught nothing from a lens that never
did the errand.
