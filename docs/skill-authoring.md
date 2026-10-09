# Skill authoring

Every active skill follows Anthropic's
[skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices).
This page catalogs the practices this collection applies with stable IDs for commits, reviews, and
lint output. Never renumber an ID or reuse one. Before you add a row, run `git log -S'| <ID> ' --oneline -- docs/skill-authoring.md` in a full clone. If it prints a commit, that ID was used before. Try the next number. Rules marked **lint** are enforced by `npm run lint:skills`
(`scripts/lint-skills.mjs`), which runs in CI. The rest are review criteria.

## Contents

- Description form
- A. Metadata
- B. Concision and freedom
- C. Structure and progressive disclosure
- D. Workflows and feedback loops
- E. Content
- F. Scripts and tools
- G. Evaluation and iteration
  - Running the evals
    - Quick start
    - Layout
    - Flags for every command
    - Free load check
    - Recorded runs
    - Verdicts
    - Before and after a skill edit
    - Traces and the G3 review
- Checks

## Description form

The description is the only part of a skill loaded before it runs, so it
carries all routing. Write it in this order, in the third person:

```text
<Verbs> <what it does>. Use when <triggers and key terms>. [Never infer from <near miss>.] [Not for <nearby task>; use <other skill>.]
```

Aim for 300 characters or fewer. Keep every explicit-only guard and exclusion.
Keep `agents/openai.yaml` `short_description` and `default_prompt` aligned
with it.

## A. Metadata

| ID  | Rule                                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------- |
| A1  | `name` is at most 64 characters of lowercase letters, digits, and hyphens, with no `anthropic` or `claude`. **lint** |
| A2  | `name` starts with a gerund (`reviewing-code`), so the collection follows one pattern. Avoid vague names. **lint**   |
| A3  | `description` is non-empty, at most 1,024 characters, with no XML tags. **lint**                                     |
| A4  | `description` is third person: it opens with a verb such as "Reviews" and never says I or you. **lint**              |
| A5  | `description` says what the skill does and when to use it, with a `Use when` clause. **lint**                        |
| A6  | `description` names specific key terms and triggers, plus exclusions for nearby skills.                              |

## B. Concision and freedom

Tell the model what you care about, then stay out of its way: a skill holds
only what a frontier model would otherwise get wrong.

| ID  | Rule                                                                                                                                                                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | Assume the agent is capable. Cut what it already knows; every paragraph must justify its tokens.                                                                                                                                 |
| B2  | Match freedom to fragility: heuristics for open tasks, exact commands for fragile or ordered operations.                                                                                                                         |
| B3  | Don't depend on one host's quirks.                                                                                                                                                                                               |
| B4  | Keep verbatim any exact format, value, or edge case the user cares about. A model drops a loose summary of one: in [#81](https://github.com/bostonaholic/skills/pull/81), three such cuts each failed their eval until restored. |

## C. Structure and progressive disclosure

| ID  | Rule                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | The SKILL.md body stays under 500 lines. Split detail into references before reaching it. **lint**                                          |
| C2  | SKILL.md is an overview that routes to references, each with a clause saying when to read it.                                               |
| C3  | Every file in the skill's `references/` and `shared/` is linked from SKILL.md as a markdown link, so no file sits two levels deep. **lint** |
| C4  | A file over 100 lines opens with a `## Contents` section listing its sections. **lint**                                                     |
| C5  | File names describe their content; directories group by domain; paths use forward slashes. **lint** (slashes)                               |

## D. Workflows and feedback loops

| ID  | Rule                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Number steps only where order or a gate matters.                                                                                                                               |
| D3  | Quality-critical output has a feedback loop: validate, fix, repeat, and proceed only when validation passes.                                                                   |
| D4  | Decision points are explicit. Large branches live in separate files read only on that branch.                                                                                  |
| D5  | Batch, destructive, or outward-facing operations follow plan, validate, execute, with a verifiable intermediate artifact.                                                      |
| D6  | Use subagents only where independence or context isolation is the point (for example an independent reviewer), and say so in one sentence; never prescribe dispatch mechanics. |

## E. Content

| ID  | Rule                                                                                                                                                                                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | No time-sensitive or machine-specific facts.                                                                                                                                                                                                                         |
| E2  | One term per concept across a skill and its references.                                                                                                                                                                                                              |
| E3  | Output templates state their strictness: exact, or a default to adapt.                                                                                                                                                                                               |
| E4  | Concrete input and output examples where style matters.                                                                                                                                                                                                              |
| E5  | Offer one default with an escape hatch, not a menu of options.                                                                                                                                                                                                       |
| E6  | Document only what exists. Delete placeholders for removed rules, rules marked not applicable, and notes about absent or removed features that change nothing the reader does. Keep a condition or limit that directs an action ("omit it when there is no ticket"). |

## F. Scripts and tools

| ID  | Rule                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------- |
| F1  | Scripts handle error conditions and report them by name instead of leaving them to the agent.        |
| F2  | No unexplained constants: every limit, timeout, and count says why it has that value.                |
| F3  | Deterministic operations live in scripts with documented usage, output, and exit codes.              |
| F4  | Instructions say whether to run a script ("Run `scripts/x.mjs`") or read it ("See `scripts/x.mjs`"). |
| F5  | Required tools and packages are listed with a check command. Never assume one is installed.          |
| F6  | MCP tools are named in full as `ServerName:tool_name`.                                               |
| F7  | Inputs that render as images are checked visually.                                                   |

## G. Evaluation and iteration

| ID  | Rule                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| G1  | Each skill has at least three evaluations, built before large edits and scored against a run without the skill. Cases live in `evals/`. See [Running the evals](#running-the-evals). |
| G2  | Evaluations run on Haiku, Sonnet, and Opus. See [Running the evals](#running-the-evals).                                                                                             |
| G3  | Skills improve from observed use: watch which files the agent reads, misses, or rereads, then revise. Read kept traces as [Running the evals](#running-the-evals) describes.         |

### Running the evals

The eval suite in `evals/` runs on demand with `claude plugin eval`. The
cases and the verdict script match the CLI in Claude Code 2.1.289. Each run
costs money, so the suite never joins `npm test` or CI. Every case runs in
two arms: with the plugin's skills (the with-arm) and without them (the
without-arm), each `--runs` times. The report gives each arm's score and the
difference between them.

#### Quick start

`npm run eval` wraps the commands on this page with their required flags.
It runs the `readonly` and `bash` tags as separate commands, writes each
to `evals/results/<timestamp>-<model>-<tag>/`, and runs the verdict script
on each result. It exits 1 if any case fails or is incomplete.

```sh
npm run eval -- --check                   # free load check plus grader regex compile
npm run eval                              # whole suite, Sonnet, --runs 1, recorded-run caps
npm run eval -- reviewing-code            # one skill's cases, --runs 3, before-and-after cap
npm run eval -- reviewing-code-core --model opus
npm run eval -- reviewing-code --dry-run  # print the claude commands only
```

Every default has a flag that overrides it: `--runs 1|3`, `--max-cost-usd
<usd>` (per command), `-j <n>`, `--judge-model <model>`, `--tag
readonly|bash`, `--threshold <0..1>`, `--no-scaffold`, `--no-keep-temp`, and
`--publish`. `npm run eval -- --help` lists them with their defaults.
Arguments after a second `--` go to every `claude` command, so an agent
session passes `npm run eval -- <target> -- --trust-plugin`. The sections
below explain each default and the triage the wrapper does not do.

#### Layout

Each active skill has three cases in `evals/<category>/<skill>/`:

- `<skill>-trigger`: a realistic request. The skill fires and does its work.
- `<skill>-guard`: a near miss. The skill does not fire, or it refuses or
  stops.
- `<skill>-core`: the rule the skill exists to enforce.

The case name is the directory name. `--case '<skill>-*'` selects one skill,
and `--case '<skill>-core'` selects one case. A case directory holds
`prompt.md` and one grader per file in `graders/`. Saved command output is
inline in the `prompt.md` `append_system_prompt`. A case that needs
repository files also holds `case.yaml` and a `scaffold.sh` that writes them
into the run's workspace. Never use `context.add_dirs`: the CLI mounts that
directory outside the workspace and denies reads of it.

The CLI ends `prompt.md` frontmatter at the first `---` anywhere after the
opening line, not at a line that is exactly `---`. A diff line such as
`--- a/<file>`, a Markdown table separator, or a horizontal rule inside the
frontmatter cuts it there. In the recorded runs, diff fixtures cut 11 cases,
and part of each fixture reached the model as the user prompt. A `---` in the
prompt body, after the frontmatter, is harmless.

If a fixture holds `---`, move the whole `append_system_prompt` field to
`case.yaml` under `execution.append_system_prompt` and delete it from
`prompt.md`. When both files set the field, the `prompt.md` value replaces the
`case.yaml` value. A case with no scaffold can hold a `case.yaml` with only
`schema_version`, `name`, and `execution`. The
[free load check](#free-load-check) did not catch any of the 11 cuts, because
a cut that leaves valid YAML loads cleanly. After a paid run, check each
case's `promptMarkdown` in `aggregate-result.json`: it should hold only the
intended prompt body and no fixture text.

Every case carries one of two run tags:

- `readonly`: no Bash, Edit, or Write. The `agent` and `no-agent` tags split
  these cases by whether the skill dispatches subagents, so you can run them
  as two commands with separate caps.
- `bash`: the command line grants Edit and two read-only `git` patterns.
  Edit can write the workspace's git config, and `git status` or `git diff`
  then runs any command that config names, such as `core.fsmonitor`, inside
  the Bash sandbox. Run `bash` cases, like `--scaffold`, only on this repository's
  own reviewed cases.

A case of a skill that calls `gh` also carries `github-mock`. Its prompt
holds saved `gh` output in place of live GitHub, so `--tag github-mock`
selects the cases that stand in for GitHub.

Every run has the `Agent` tool, whatever `allowed_tools` lists. The `no-agent`
tag only selects cases and does not withhold `Agent`. The harness refuses
Bash, Edit, and Write at every subagent depth when the run does not grant
them. `max_turns` counts top-level turns only, so `timeout_seconds` is the
only bound on a subagent tree.

Results go to `evals/results/<timestamp>/`, which git ignores. The folder
holds `aggregate-result.json` and `report.html`.

#### Flags for every command

- `--max-cost-usd <cap>`. The CLI checks the cap before each run starts, so
  runs already in flight finish and spend can pass the cap by up to `-j`
  in-flight runs. Every cap on this page can be overshot that way. A run
  that passes the cap skips its `llm` graders and sets `skippedPaidGraders`.
- `--no-publish`. The report holds prompts, fixtures, and traces, and the CLI
  publishes it unless you pass this flag.
- `--scaffold` on every command that runs cases. It runs each case's
  `scaffold.sh`, which writes the case's repository files. Pass it only for
  scaffold scripts written in this repository.
- `--trust-plugin` when an agent session starts the command. That session has
  no terminal to answer the plugin trust prompt.
- `--threshold 0` on every command that runs cases. The CLI also scores a run
  that ended with an error, so at any `--runs` value the exit code never gives
  the case verdict. The default threshold of 1.0 turns any low score into
  exit 1.
- `--judge-model haiku` and `-j 4` on recorded runs.
- `--keep-temp` on recorded runs and whenever you will read traces. Without
  it, the CLI deletes each run's directory when the run ends.

#### Free load check

Before a paid run, load the cases at no cost:

```sh
claude plugin eval . --tag readonly --runs 1 --max-cost-usd 0 --no-publish
claude plugin eval . --tag bash --runs 1 --max-cost-usd 0 --no-publish
```

A `--max-cost-usd 0` command validates the selected cases and starts no run.
It validates `prompt.md` for every case, and graders and `case.yaml` only for
selected cases. It does not catch an invalid regex. Before the run, compile
each grader `pattern` and `input_match` with `new RegExp()` in Node.

The check passes when no output line reports `failed to load` and the exit
code is not 1. At the $0 cap the command always exits 2, the cap-hit code,
so run the two commands separately and never chain them with `&&`.

These warnings are expected and do not fail the check:

- `cost ceiling $0 hit; skipping remaining cases`, and a summary line marked
  `partial (cost ceiling hit)`.
- One `its scaffold_script is not run without --scaffold` line for each case
  that has a `scaffold.sh`.
- In the `bash` check, a `not granted (missing --allow-tools grant ...)` line
  and `grader ... cannot pass with the granted tools` lines, because the
  load check passes no `--allow-tools`.

#### Recorded runs

Run one model at a time. The `readonly` caps are Haiku $25, Sonnet $85, and
Opus $100. The `bash` caps are Haiku $5, Sonnet $10, and Opus $20. The Opus
`bash` cap is below the $30 of a before-and-after command because the `bash`
tag holds few cases and runs each once, while a before-and-after command runs
each case three times. These commands show the Sonnet row:

```sh
claude plugin eval . --tag readonly --runs 1 --threshold 0 --model sonnet \
  --judge-model haiku -j 4 --scaffold --keep-temp --max-cost-usd 85 --no-publish
claude plugin eval . --tag bash --runs 1 --threshold 0 --model sonnet \
  --judge-model haiku -j 4 --scaffold --keep-temp \
  --allow-tools Edit "Bash(git status:*)" "Bash(git diff:*)" \
  --max-cost-usd 10 --no-publish
```

Grant no other tool. Never grant `gh`, `git push`, or network access. The CLI
runs Bash in a sandbox. On one maintainer machine running Claude Code
2.1.289, the sandbox refused every `bash` run. The error said the Docker
credential store (`~/.docker` or `$DOCKER_CONFIG`) held a symbolic link, and
that machine's `~/.docker/cli-plugins/` held symlinks. The CLI documentation
does not describe this check, so treat it as observed on one machine. If a
`bash` run ends with that error, the verdict script prints `fail` (0/N
passing), because the error names no limit. Record those cases as not run
instead.

After the Sonnet recorded run, rerun each failing case alone at `--runs 3` on
Sonnet. Use the command for the case's tag from step 2 of
[Before and after a skill edit](#before-and-after-a-skill-edit), with
`--model sonnet`, `--case '<skill>-<kind>'`, `-j 1`, and
`--max-cost-usd 5`. With `-j 1`, a rerun can pass $5 by at most the one run
in flight when it reaches the cap. Stop when the summed `costUsd` of all
reruns reaches $30. The last rerun can take that sum past $30. A case not
rerun keeps its `--runs 1` result, marked "single run".

If the unspent Sonnet cap is at least three times the `costUsd` of the
`--runs 1` pass, run the whole `readonly` suite at `--runs 3` on Sonnet
instead of the per-case reruns. Run it after fixing the case bugs that the
`--runs 1` failures expose. It gives every case that completes a `--runs 3`
verdict. In the recorded run, the `--runs 1` pass cost $20.18 and the
`--runs 3` pass $59.63. A case fixed after the `--runs 3` pass still needs
its own `--runs 3` rerun from the $30 rerun budget.

#### Verdicts

The eval command's exit code gives no per-case verdict. After every eval
command, run the verdict script on its results file, with the same `--runs`
value:

```sh
node scripts/eval-verdict.mjs --runs 3 evals/results/<timestamp>/aggregate-result.json
```

It prints one line per case, sorted by name:
`<case> <passing>/<counted> excluded <n> <pass|fail|incomplete>`. It reads
only with-arm runs. `scripts/eval-verdict.mjs` defines the rules, and its
header states them:

- The script excludes a run when `skippedPaidGraders` is true, because the
  cost cap left its `llm` graders unjudged. It also excludes a run whose
  error matches `/(usage|rate)[ -]limit/i`.
- A counted run passes only when its `error` is null or absent and every
  `graders[]` entry has `scored: false` or `passed: true`. Any other error,
  such as a timeout or a scaffold failure, fails the run even when its graders
  pass.
- A case with fewer counted runs than `--runs` is `incomplete` and has no
  verdict. A cap can stop a case before it starts. That case has no line, and
  it counts as incomplete. Compare the printed case names against the cases
  the command selected. Each selected case with no line is incomplete.
- At `--runs 1`, a case passes on 1/1 and fails on 0/1.
- At `--runs 3`, a case passes with two or three passing runs and fails with
  zero or one.

Read the error of every failed run. If an error names a limit in other words,
the pattern missed it. Widen the pattern in the script, add a test, and rerun
the script on the saved results file.

A timeout can be an API stall, not skill behavior. In a stalled run's trace,
a stream cut-off ("response above was cut off mid-stream"), `api_retry`
events, or no model output at all is followed by nothing until the timeout.
In the recorded runs, 57 Opus runs timed out, the stalled ones often after a
single message. If a timed-out run's trace shows a stall, rerun the case alone
with the same model and flags, paid from that model's cap; Sonnet reruns come
from the $30 rerun budget. The recorded Opus reruns lowered `-j` to 2. The
rerun's result replaces the stalled one, and a case that times out again
keeps the failure. The verdict script still counts every timeout as a failed
run, so this triage is by hand.

Rerun an incomplete case alone with `--case '<skill>-<kind>'` and the same
model and flags. Wait for any limit to reset first. Rerun it at most twice.
The rerun's result replaces the incomplete one. A rerun of a recorded run gets
only the unspent part of that run's cap.

With `--threshold 0`, the eval command's exit 1 means a load, filter, start,
or trust error. Its exit 2 means a cap hit or a rejected credential, with
partial results. The verdict script also exits 2, with one stderr line and no
stdout, for these causes:

- a bad argument: a `--runs` value other than 1 or 3, or anything but
  `--runs <n> <file>`
- an unreadable or non-JSON file
- a `schemaVersion` other than 1
- `cases` missing or not an array
- a `cases` entry, a present `arms`, a with-arm run, or a `graders[]` entry
  that is not an object
- a present `arms.with` that is not an array
- a run `error` that is neither null, absent, nor a string
- a present `skippedPaidGraders`, `scored`, or `passed` that is not a boolean
- a case with more with-arm runs than `--runs`
- a counted run with no error and a missing or empty `graders` list

The script checks the whole file for these causes before it prints a line.

#### Before and after a skill edit

Run these steps on each model. Caps per command are Haiku $5, Sonnet $10, and
Opus $30.

1. List the skills to run: the edited skill, its callers, and its siblings.
   - A caller is a skill whose `Calls:` list in the README catalog names the
     edited skill. `scripts/catalog.mjs` builds that list from each "call the
     Skill tool with `<name>`" line. Add the callers of each caller until no
     new caller appears.
   - A sibling is a skill whose `description:` names the edited skill, or a
     skill that the edited skill's `description:` names. Find the first kind
     with
     `grep -l '^description:.*<name>' skills/{engineering,productivity}/*/SKILL.md`.
     Read the edited skill's `description:` for the second kind. A widened
     description can take a sibling's requests, and the sibling's `trigger`
     case then fails.
2. Before the edit, run both commands for the edited skill and for each
   caller, with `--case '<skill>-*'`. Add `--keep-temp` for a caller. For a
   sibling, run only the `readonly` command.

   ```sh
   claude plugin eval . --tag readonly --case '<skill>-*' --runs 3 --threshold 0 \
     --model <model> --judge-model haiku -j 4 --scaffold --max-cost-usd <cap> --no-publish
   claude plugin eval . --tag bash --case '<skill>-*' --runs 3 --threshold 0 \
     --model <model> --judge-model haiku -j 4 --scaffold \
     --allow-tools Edit "Bash(git status:*)" "Bash(git diff:*)" \
     --max-cost-usd <cap> --no-publish
   ```

   Keep two commands, because one command would grant Bash and Edit to the
   `readonly` cases. If the skill has no `bash` case, the second command exits
   1 with "No eval cases found".

3. Run the verdict script on each results file.
4. Make the edit, then run the same commands and the verdict script again.
5. Compare the per-case verdicts of every case, caller and sibling cases
   included. A case that passed before and fails after blocks the edit. A
   case still incomplete after its reruns also blocks the edit.
6. Read the kept traces of each caller's cases. A caller case covers the
   edited skill only when its trace shows a `Skill` call to that skill. If no
   case of a caller shows that call, list "caller path not exercised" for that
   caller. That result does not block the edit.

#### Traces and the G3 review

With `--keep-temp`, each run's trace stays at the `tracePath` in
`aggregate-result.json`, as stream-json lines in `trace.jsonl`. Kept run
directories are read-only. Never run git inside them. The trace shows
messages from first-level subagents. Nested subagents show only progress
events, so their file reads are not visible.

For G3, read the with-arm traces of each skill after a recorded run. Look for
these patterns:

- A reference file the skill links that the agent never opens.
- A file the agent reads more than once.
- A file the agent reaches with Grep instead of through its link.

Revise the skill for each finding, and test the edit with the before and
after commands.

## Checks

```sh
npm run lint:skills
uv run scripts/validate-skills.py skills/engineering/*/SKILL.md skills/productivity/*/SKILL.md
npm test
```

`validate-skills.py` checks the Agent Skills specification. `lint:skills`
checks the rules marked **lint** above.
