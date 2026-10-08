<!-- Canonical file: shared/step-delegation.md at the repository root. Edit it there, then run npm run sync-shared. -->

# Step delegation

This skill explicitly authorizes subagents. Run each step it marks as delegated in its own subagent with fresh context, and run every other step in this session.
User instructions and the host's permission settings take precedence over this file.

## Steps that stay inline

Delegate by default. Keep a step in the orchestrating session only when it:

- asks the user anything or waits on approval;
- writes shared state: commits, pushes, merges, PR or tracker writes, deletions, or edits to files another running step reads;
- needs this conversation's history;
- takes one or two tool calls, so the brief costs more than the work;
- is one pass of a tight edit and re-run loop. Delegate the whole loop as one unit when it needs nothing from this session.

## Dispatch

- Claude Code: call the `Agent` tool. Use `subagent_type: Explore` for read-only steps and `general-purpose` for steps that write files. Pass the `model` tier alias the step names; otherwise omit it.
- Codex: call `spawn_agent` without forking the parent conversation (`fork_turns: "none"` or `fork_context: false`, whichever the host offers).
- Other hosts: use the host's subagent tool with the same brief.

Launch independent steps, or one subagent per independent item, in the same turn. Keep at most 4 in flight, the Codex default thread limit. Run dependent steps in order and pass each one only the reports it declares as inputs. Subagents never spawn further subagents.

## Brief

The prompt is the only context a subagent receives. Give it:

1. the objective, in one sentence;
2. the inputs: absolute paths, refs, IDs, and predecessor reports;
3. the absolute paths of this skill's files the step reads, which it reads before working;
4. its boundaries: read-only, or the exact files it may write;
5. when to stop;
6. the step's output contract.

Give no hypothesis, preferred answer, or narration of earlier steps.

## Report

The subagent returns at most 500 words unless the step names another limit: findings with `file:line` and paths, not file contents. It writes a larger artifact to a file and returns that path. It lists open questions and never asks the user.

Check each report against the step's output contract. On a missing or malformed report from a read-only step, dispatch once more with the error named. If that also fails, run the step inline with the same brief and report the fallback. Never re-dispatch a writer: inspect the files and state it may have changed, then report. Never repair a report and then trust it.

## Fallback

When the host has no subagent tool or forbids one, run delegated steps inline in order and say so once. A step the skill marks as required independent review never falls back inline: stop and report that no independent reviewer could run.
