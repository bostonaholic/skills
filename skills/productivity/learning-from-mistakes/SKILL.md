---
name: learning-from-mistakes
description: Codifies the latest correction or mistake in the conversation as a short imperative rule in the project or global CLAUDE.md or AGENTS.md, after the user approves it. Use when the user asks to learn from a mistake, remember a lesson for next time, add a rule to CLAUDE.md, or not repeat a behavior. Not for a whole session; use running-retros.
---

# Learn From Mistake

Turn the most recent mistake or correction in the conversation into a rule in
the instructions file the agent reads, so the lesson persists across sessions.

## Steps

1. **Identify the mistake**: Find the most recent correction, mistake, or
   suboptimal behavior in the conversation and summarize what went wrong in one
   sentence. If none is clear, ask the user which correction to codify and wait.

2. **Draft a rule**: One or two imperative sentences ("Do X", "Never Y"),
   specific enough to change behavior, not a platitude.

3. **Choose the target file**:
   - **Project**, for lessons about this project's codebase, conventions, or
     tooling: the instructions file at the repository root from
     `git rev-parse --show-toplevel` (outside a repository, ask where to write).
     Use `CLAUDE.md` in Claude Code and `AGENTS.md` in Codex.
   - **Global**, for lessons that apply across projects: `~/.claude/CLAUDE.md`
     in Claude Code, `~/.codex/AGENTS.md` in Codex. In another host, ask which
     file it reads.
   - If the chosen file is a symlink, edit the file it resolves to. If it only
     imports another file (a line such as `@AGENTS.md`), edit the imported file.

4. **Check for overlap**: Read the target file. If the rule already exists,
   stop and say where. If a related rule exists, refine it instead of adding a
   duplicate.

5. **Confirm**: Show the drafted rule (or the old and new text of a refined
   rule), the target file path, and the section it goes in. Wait for approval,
   and apply any edits the user asks for.

6. **Write**: Add the approved rule to that section, or to a new
   `## Learned Rules` section when no section fits.

7. **Verify**: Re-read the file and confirm the rule appears once, exactly as
   approved. Report the file path and the rule.
