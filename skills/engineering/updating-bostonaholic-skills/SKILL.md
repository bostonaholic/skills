---
name: updating-bostonaholic-skills
description: Updates every existing install of the bostonaholic skills collection on this machine to the latest release tag, across Claude Code, Codex, the Cursor plugin clone, and the Antigravity, OpenCode, Cursor, and Grok Bot skill copies. Use when the user explicitly asks to update the bostonaholic skills. Never infer from an outdated skill or a version mismatch. Not for installing; use INSTALL.md.
disable-model-invocation: true
---

# Updating bostonaholic skills

Brings each existing install up to the latest release, after one confirmation.
It never installs into a harness that lacks the collection, and never adds a
skill to a copy directory that did not hold it.

`<skill-dir>` is this skill's directory. The script needs `node` and `git`
(check with `command -v node git`); it uses `claude` and `codex` where installed.

## Rules

- **Confirm once.** Show the whole plan. No answer is no change.
- **Apply only the confirmed id.** A changed plan exits 3 and runs nothing.
- **Stop at blockers.** Exit 4 means a harness needs the user's action first.
- **Never delete a skill.** A retired or unrecognized copy is only reported.
- **`npx skills` installs are out of scope.** Point the user at
  `npx skills@latest update` from the repository's INSTALL.md.

## Steps

- Run `node "<skill-dir>/scripts/update.mjs" plan` and show its whole output;
  it changes nothing.
  - Exit 4: report each `Blocked` line, say what
    [blockers and failures](references/blockers-and-failures.md) advises, stop.
  - `Nothing to do.`: report the `left:` lines and stop.
- Ask the user to confirm the plan, or run `apply` with `DRY_RUN=true` first.
- Run `node "<skill-dir>/scripts/update.mjs" apply <plan-id>` with the confirmed `Plan id`.
  - Exit 3: the machine changed; run the plan again and confirm again.
  - Exit 1: it names the failed step and the steps not run; report the stderr
    and what the reference advises, and do not retry blindly.
- Run the plan again and expect `Nothing to do.`. A Claude Code or Codex step
  that still shows a gap means its marketplace serves an older version than
  the release; report that gap.
- Report each step run, each `left:` line, and the backup directory.
- Tell the user which harnesses to restart:
  - Claude Code: a new session, or `/reload-plugins`.
  - Codex: a new thread.
  - Antigravity, OpenCode, Cursor (plugin and skills): restart the app.
  - Grok Bot: no restart is documented; confirm under Settings > Plugins > Yours.
