# The two skill rules

Read this when classifying a skill, and again before Validate. Every cut leaves
the skill meeting both.

## Agent-agnostic

A skill is a `SKILL.md` plus scripts: `scripts/`, `references/`, `shared/`,
and `agents/openai.yaml` metadata, nothing else.

- No harness-specific hooks: no `hooks` frontmatter, hook files, or plugin
  wiring the skill depends on.
- Frontmatter holds `name` and `description`, plus only invocation metadata
  other harnesses ignore (`argument-hint`, `effort`,
  `disable-model-invocation`, `user-invocable`) or the specification's
  `license`, `compatibility`, and `metadata`.
- No harness substitutions in `SKILL.md`: `$ARGUMENTS`, `$ARGUMENTS[N]`, `$1`
  and other positional arguments, `${CLAUDE_SKILL_DIR}`, `${CLAUDE_PLUGIN_ROOT}`
  or any `${CLAUDE_*}`, and `` !`command` `` preprocessing. One harness expands
  them before the model reads the skill; every other harness shows them raw.
  Say what the argument stands for in plain words ("The request names the
  diff"), and name the skill's own directory as `<skill-dir>`.
- Work a harness would do with a hook moves into a script the skill tells the
  agent to run.

## Short prompt

- The `SKILL.md` body is at most 100 lines.
- It is checklist-shaped: steps and rules are list items, numbered only where
  order or a gate matters, and no prose paragraph runs over 50 words.
- Detail goes in `references/`, linked from the step that needs it with when
  to read it.
