# Ledger format

The ledger is one Markdown note. Its parts, in order: frontmatter and an intro paragraph (keep both as they are), `## Ranking`, `## Ideas`, `## Run log`.

## Ranking table

Columns: `#`, `Idea`, `Seen`, `First`, `Last`, `Status`. `Idea` links the idea's section (`[[#name]]`). Sort by Seen descending, then Last descending, and renumber `#`. Rows with status `merged`, `built`, or `dropped` sit at the bottom with `—` for `#`.

## Idea sections

One `### <name>` per idea under `## Ideas`, with exactly these fields in this order:

- **Build:** skill, agent, workflow, or code; a one-line spec (name, when it runs, what it does). Deterministic steps are scripts. An upgrade names the skill it extends.
- **Who else:** whether other people have the same problem.
- **Requirements:** 2 to 5 bullets: what must be true for someone to research and build it. Inputs it reads, where it lives (repository, path), what it must not do, dependencies on existing skills or scripts. Enough for an agent to start without asking.
- **Acceptance criteria:** 2 to 5 bullets, each a check a reviewer can run or observe: a command and its expected exit or output, a file that exists with named content, or a behavior on a named fixture. Given/when/then or a runnable assertion. Nothing vague.
- **Evidence:** one `- YYYY-MM-DD: ...` line per run that surfaced the idea, citing commit hashes, memory file names, note paths, or prompt timestamps.

## Matching rules

- Hit: the finding is the same improvement as an existing idea (same job, same place to build it, even in other words). Seen += 1, Last = today, append one evidence line. Refine Build, Requirements, or Acceptance criteria in place when the new evidence changes them.
- New: Seen 1, First = Last = today, all five fields filled.
- Merge: two existing ideas turn out to be one improvement. Keep the one with the higher Seen, add the other's Seen and evidence lines to it, and set the other's status to `merged → <name>`.
- A rerun on a day that already has a run page adds evidence lines marked `(rerun)` and leaves Seen unchanged.

## Statuses

- `open`: seen this run or in one of the last two runs.
- `quiet`: not seen in the last two runs. Keep the section and its Seen count; it returns to `open` when seen again.
- `built`: a skill, script, or check now exists. Last evidence line names the commit or path.
- `merged → <name>` and `dropped`: as above. Never delete a section.

## Run log

Append one line per run: `- YYYY-MM-DD: +<new ideas>; hits on <ideas>; built <ideas or none>.` Add the status changes made this run after the period.

## Run page

`<vault>/Notes/idea-miner/YYYY-MM-DD.md` with frontmatter `tags: [idea-miner]` and `date:`. Body: sources read, each hit and new idea with its evidence, one-offs dropped with the reason, and seed paths.
