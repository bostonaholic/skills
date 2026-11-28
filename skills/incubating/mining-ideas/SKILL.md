---
name: mining-ideas
description: Mines a week of notes, memory pages, prompt history, and git commits for repeated manual work, and keeps a ranked ledger note of things to build, where an improvement that keeps showing up rises and one-offs sink. Use when the user asks to mine ideas, run the idea miner, or update the idea ledger.
disable-model-invocation: true
metadata:
  internal: true
---

# Mining ideas

The product is one living ledger note. Each run adds evidence to the ideas it finds again, adds the ideas it finds for the first time, and re-ranks by **Seen**, the number of runs that surfaced each idea. Never invent a need: every idea points at something that happened in the window.

## Inputs

- The user names the vault (an Obsidian or Markdown notes directory), the repository roots to scan, and the window in days. Defaults: the ledger at `<vault>/Notes/Idea Miner.md`, run pages under `<vault>/Notes/idea-miner/`, a 7-day window, run weekly.
- Required tools, checked by the script: `git`, `python3`, `find`.

## Steps

1. **Gather.** Run `scripts/gather.sh --vault <vault> --days <days> <repo>...` and read its output: notes changed in the window, daily notes, memory pages, prompt history, commits per repository and worktree, and the skills that already exist. Read commit bodies (`git show --stat <sha>`) for anything that looks like repeated work. Read the ledger in full.
2. **Find repeated work.** A finding is a job that showed up more than once in the window: manual, repetitive, or judgment work an agent could take over. For a theme that recurs, grep the vault and memory directories for more context. A single incident is not a finding.
3. **Match each finding to the ledger** by the rules in [ledger format](references/ledger-format.md): a hit when it is the same improvement as an existing idea (same job, same place to build it), otherwise a new idea. Never split one improvement into two ideas, and never count one finding twice in a run.
4. **Check what is already built.** Compare every idea, existing ones included, against the skills list and the repositories' scripts. One that now exists becomes `built`, with the commit or path as its last evidence line. One an existing skill covers becomes an upgrade to that skill, never a new skill.
5. **Rewrite the ledger** exactly as [ledger format](references/ledger-format.md) says: fields, ranking, statuses, run-log line. Append evidence; never rewrite past lines. Then write the dated run page. Change no other file.
6. **Report.** Start with "If you build one thing this week, build this:" and the top open idea with its acceptance criteria. Then the top five rows of the ranking with Seen counts, marking which moved this run (hit, new, built, went quiet). A quiet window gets one line saying so; the ledger statuses and run log still update. End with the seed paths and the two files written.

## Guards

- Every claim cites its source: a commit hash, a memory file name, a note path, or a prompt timestamp.
- New skills come first in a tie. An upgrade names the skill it extends.
- Wrap every angle-bracket placeholder such as `<name>` in backticks in both files; a Markdown renderer treats a bare one as an HTML tag and drops it.
