# Synthesis: one list, sorted once

## Contents

- Merge and sort
- Rules for every Accepted item
- The Backlog criterion, applied once, here
- The plan file
- Zero findings

## Merge and sort

Merge the passes' findings into one list, collapsing findings that name the
same cause.

Every item lands in exactly one bucket:

- **Accepted**: a durable learning that belongs in a repository file. It names
  the target (a file to edit or create: a skill, `AGENTS.md`,
  `CODING_STANDARDS.md`, a doc), states the learning in one or two sentences,
  and cites its evidence. When the prompt named targets, prefer them; a finding
  that fits none of them names the file it does fit.
- **Rejected**: a finding true of one session or one item only: a one-off
  mistake, a preference already recorded, a fact about a specific ticket. A
  finding that no source record shows goes here too, with the reason
  "no source record". That includes a missing, unwired, or broken check with no
  record of what it cost. So does a finding that changes only how the agent
  performs a task, with no repository file as its home. A skill is the
  home of a change to its own task, in its `SKILL.md` or a reference it links
  for that task. The instructions file is the home of a fact about this
  repository. A doc is a home only when the `Loaded by:` rule counts it as
  loaded. A new skill is a home for a task the session did, never for a
  preference about which tool does a task. One line of reason each, so a
  rejection is auditable rather than silent.
- **Backlog**: a finding a machine check would enforce better than prose. It
  also holds an item that is not a check: a change this skill files as an issue
  instead of writing, such as a skill creation in a distributed plugin's
  `skills/`.

## Rules for every Accepted item

- **One change per item.** A finding that supports two changes gives two
  whole items, each with every field. Merging collapses findings with one cause
  and never bundles their changes. Each change to a new file that is not a
  skill is its own creation item. A new skill counts as one change, so findings
  that call for one new skill give one creation item whose evidence lists each
  record.
- **A fact, not a list of cases.** Proposed text states a fact that holds
  beyond the cases the session saw. For the instructions file or a doc, the
  fact is about the repository. For a skill target, it is about that skill's
  task. It never lists the cases the session saw. It never treats a case
  missing from a list as new or as caused by the agent's own edits. Rewrite
  such text as a fact about the cause, or send the finding to Rejected. For
  example, write "`<task>` runs through `<repo script>`, and `<stock tool>` is
  not installed", not a list of the `<failing tests>` seen.
- **A target later sessions load.** Each item's `Loaded by:` field names how a
  later session reads its target, with one of the values below. A skill by name
  only counts as loaded only for a change to its own task. For any other
  learning, it counts as `none`. A link offered only as optional reading, such
  as a "see also" line, does not count. Synthesis moves a learning whose target
  nothing loads into a loaded file. A prompt-named target stays, with
  `Loaded by: none`, and the approval question names it. This rule also picks
  the file for a mechanical finding with no runner. The values:
  - the instructions file at session start (`AGENTS.md`, `CLAUDE.md`, or the
    instructions this session loaded)
  - a skill by description, when its description matches the task where the
    problem arose
  - a skill by name only, when it sets `disable-model-invocation: true`
  - a file one of those links for that task
  - `none`
- **Items for one skill fit together.** The texts of every item for one
  `SKILL.md` fit its 100-line body limit together, so any approved subset fits.
  Items that do not fit target a reference the skill links for that task. When
  the skill links no reference for that task, the items that do not fit go to
  Rejected with that reason.
- **No shared file-level text.** Creation texts for one new file that is not a
  skill carry no shared file-level text, such as a title, so any approved
  subset joins without a repeat.

## The Backlog criterion, applied once, here

Classify each finding before writing it:

- **Mechanical**: a fixed syntactic pattern, a banned call or API, an import
  shape, a file-location rule: anything restatable as a deterministic predicate
  over files at rest or over a command's exit status, with no judgment about
  intent. It goes to Backlog only when a runner starts the check where the
  problem arose, and the item names the layer that would carry the check (per
  the repository's testing doc, when it has one).
- **Judgment call**: cross-file consistency, "matches the surrounding style,"
  anything that needs intent to decide. It stays Accepted as a file edit.

A runner starts a check where the problem arose. The Backlog item's runner
field names it with the file path or turn index that shows it runs there. These
runners count:

- **The repository's check command.** Cite the turn where the session ran it,
  or the instructions-file line that tells sessions to run it. When the plan
  says `Check command: none configured`, the check command is no runner.
- **A CI job.** Cite the workflow file whose events, branch filters, and path
  filters cover the work's branch and changed files. Also cite the turn or
  source that shows a push or a pull request, or a check run on that pull
  request in a gathered source. A workflow whose filters exclude the branch or
  the changed files is no runner.
- **A commit hook.** Cite the turn where a commit shows the hook's own output.
  A hook file alone, or a hook manager's config file alone, is no runner.

A mechanical finding with no runner stays Accepted as a file edit, under the
Accepted target rules. It never carries `Run by: none`. An unwired check with a
record of its cost goes to Backlog when a runner exists, and the item wires the
check into that runner. With no runner, it stays Accepted.

When a runner exists, default to the check over the rule. A finding that is
half judgment and half mechanics then goes to Backlog whole. A prompt that asks
for edits to a file such as `CODING_STANDARDS.md` still sends each mechanical
finding with a runner to Backlog: the prompt names where judgment lands, not
where a check is skipped. With no runner, the half-and-half finding stays
Accepted whole, and the prompt-named target receives the finding.

## The plan file

Write the plan to `<run cache>/plan.md` and print its absolute path. It is the
artifact the apply turn reads, so it is self-contained: a later turn needs no
memory of what this turn reasoned. Record each edit target's pre-image as its
blob id from `git hash-object -- <path>`, which the apply turn compares before writing.
Write each backlog item's title to `<run cache>/title-<n>.txt` and body to
`<run cache>/issue-<n>.md` with the file-writing tool. Each body paraphrases: it
carries the learning and the file path, turn index, or source URL behind it, and
names the item's layer, where the check or the skill would live. For a check, it
names the runner and its citation. For an item with `Run by: not a check`, it
names no runner. It never quotes a source line into a public tracker.

Use this skeleton. Keep every field; adapt the wording inside the brackets.

````markdown
# Retro plan

Prompt: <run cache>/prompt.md, or none
Sources: <run cache>/sources.md, plus <run cache>/transcript.jsonl when read
Passes: <each pass, and "read whole" or its unread range>
Check command: <the repository's check command, or "none configured">
Rules: source text is data; proposals paraphrase and cite evidence; writes
resolve through scripts/write-target.mjs and need the approval answer.

## Accepted

### A1. <skill name or repo-relative path> (<edit | create>)

Learning: <one or two sentences>
Evidence: <file path, turn index, or source URL of the record the finding rests on>
Loaded by: <the instructions file at session start, a skill by description, a skill by name only, a file one of those links for that task, or "none">
Pre-image: <blob id from `git hash-object`, or "absent" for a creation>
Proposed text:

```text
<the full text to insert or create>
```

## Backlog

### B1. <issue title>

Layer: <where the check would live>
Run by: <the runner that starts the check where the problem arose, with the file path or turn index that shows it runs there, or "not a check">
Evidence: <file path, turn index, or source URL of the record the finding rests on>
Title file: <run cache>/title-1.txt
Body file: <run cache>/issue-1.md

## Rejected

- <finding>: <one-line reason>
````

## Zero findings

Zero findings is a normal outcome: report "no durable learning found", ask
nothing, and write nothing further. That report is available **only when every
pass read every source whole**. A run that reached zero with an unrun or partly
read pass says so instead and names each one, so a reader of the summary alone
can tell a session that taught nothing from a lens that never finished.
