---
name: learning-from-mistakes
description: Codifies the latest correction or mistake in the conversation as a short imperative rule in the project or global CLAUDE.md or AGENTS.md, after the user approves it. Use when the user asks to learn from a mistake, remember a lesson for next time, add a rule to CLAUDE.md, or not repeat a behavior. Not for a whole session; use running-retros.
---

# Learn From Mistake

Turn the most recent mistake or correction in the conversation into a rule in
the instructions file the agent reads, so the lesson persists across sessions.
If no correction is clear, ask which one to codify.

- **The rule**: one or two imperative sentences ("Do X", "Never Y"), specific
  enough to change behavior. A platitude ("be careful with tests") fails.
- **Target file**:
  - Project lessons (this codebase, its conventions or tooling) go in the
    instructions file at the root from `git rev-parse --show-toplevel`:
    `CLAUDE.md` in Claude Code, `AGENTS.md` in Codex. Outside a repository, ask
    where to write.
  - Lessons that apply across projects go in `~/.claude/CLAUDE.md` in Claude
    Code or `~/.codex/AGENTS.md` in Codex. In another host, ask which file it
    reads.
  - If the file is a symlink, edit the file it resolves to. If it only imports
    another file (a line such as `@AGENTS.md`), edit the imported file.
- **Overlap**: if the rule already exists, stop and say where. If a related
  rule exists, refine it instead of adding a duplicate.
- **Approval**: show the rule (or the old and new text of a refined rule), the
  file path, and the section: an existing section that fits, or else a new
  `## Learned Rules` section. Never propose any other new heading. Write nothing
  until the user approves.
