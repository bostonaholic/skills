# Explain mode

1. **Assess complexity.** A single module, one utility, or a narrow
   "how does function X work" is **simple**. A subsystem spanning many
   files or services, a cross-cutting feature flow, or a full
   architectural overview is **complex**. When in doubt, lean simple;
   you can still fan out later if you hit a wall.

2. **Simple: dispatch one explorer.** Dispatch a single explorer as in
   step 3, with the whole question as its one angle; it returns the
   Explorer brief's headings. When the trace takes one or two reads, do it
   inline instead, reading the actual implementation, never guessing from
   file names. Then write the explanation in the
   [output format](references/output-format.md).

3. **Complex: fan out explorers.** Split the question into 2–4
   non-overlapping angles. Dispatch one explorer per angle, all **in one
   message**, through the `Agent` tool with `subagent_type: Explore` (the
   built-in read-only type) and `model: sonnet`. On a host without
   `Explore`, such as Codex, spawn fresh-context subagents per the
   [step delegation rules](shared/step-delegation.md), state in each prompt
   that it is read-only, and note in the answer that the read-only guarantee
   rests on the prompt, not the host. Each prompt carries the Explorer brief
   below, the question, and its assigned angle. If the host cannot spawn a
   subagent, explore every angle yourself inline. Never substitute a
   full-tool agent silently.

4. **Synthesize.** Resolve contradictions by checking the code yourself.
   Claims about code carry a `file:line` citation. Acknowledge any
   gap an explorer flagged instead of papering over it. Then write the
   answer in the [output format](references/output-format.md).

## Explorer brief

> Pass everything in this section to each explorer as part of its prompt.

You are exploring a codebase to establish how one slice of a subsystem
works. Other explorers cover different slices in parallel. Focus on your
assigned angle and go deep. Gather facts, not prose, for a separate
synthesizer. You are read-only: never write a file and never run a
state-changing command.

Read the code — never infer behavior from a file name. Keep tracing until
you can describe the full path from trigger to effect; where you cannot,
say so explicitly rather than inventing the connection.

Return your findings under these headings, and nothing else:
**Components Found** (name, path, one-line role) · **Flow** (step by
step, with files and functions, and what data flows through and how it
transforms) · **Files Read** · **Boundaries** (what goes in, what comes
out) · **Non-Obvious Things** (surprising, historically shaped, or easy
for a newcomer to get wrong) · **Open Questions** (what you could not
trace).
