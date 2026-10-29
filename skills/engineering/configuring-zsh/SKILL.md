---
name: configuring-zsh
description: Chooses the zsh startup file (.zshenv, .zprofile, .zshrc, .zlogin, or a custom plugin under ZSH_CUSTOM) for a configuration change and edits the dotfiles repo source behind the symlink. Use when the user says "update the zsh config", or when adding or moving environment variables, PATH entries, aliases, functions, setopt or zstyle options, or completions in zsh config.
metadata:
  filePattern:
    - "zsh/*"
    - "**/zshrc"
    - "**/zprofile"
    - "**/zshenv"
    - "**/zlogin"
    - "**/zlogout"
    - "**/.zshrc"
    - "**/.zprofile"
    - "**/.zshenv"
    - "**/.zlogin"
    - "**/*.plugin.zsh"
  bashPattern:
    - "source\\s+\\S*\\.?z(shrc|shenv|profile|login)"
    - "\\b(un)?setopt\\b"
---

# Configuring zsh

## Edit the source, not the symlink

- Startup files usually live in a dotfiles repo and are symlinked into `$HOME`
  (or `$ZDOTDIR`).
- Write to the repo file, not the link: many editors and write tools replace a
  symlink with a regular file.
- Register a new startup file wherever the repo creates its links, and ask
  before running its installer.
- If the repo links a `<name>.plugin.zsh` into
  `${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/plugins/<name>/`, follow the
  [oh-my-zsh plugin layout](references/oh-my-zsh-plugin-layout.md).

## Choose the startup file

- `.zprofile`: `PATH`, tool init that sets it (`eval "$(brew shellenv)"`),
  variables for programs (`EDITOR`). Not `.zshenv`: macOS `path_helper` moves
  its entries behind the system paths. Not `.zshrc`: it never runs for
  programs started outside an interactive shell.
- `.zshenv`: variables every shell needs, including scripts (`ZDOTDIR`, guard
  flags). Keep it fast and silent.
- `.zshrc`: `setopt`, `zstyle`, prompt, framework and plugin list; `FPATH`
  additions before `compinit` (with oh-my-zsh, before sourcing
  `oh-my-zsh.sh`); aliases, functions, their `compdef`, and interactive
  variables (`LESS`) after `compinit`, or in the custom plugin file.

Before adding an alias or function, check that an enabled plugin does not
already define it: `zsh -ic 'whence -v <name>'`.

## Aliases that shadow commands

- An alias that replaces a standard command (`ls`, `cat`, `grep`, `rm`, `cd`)
  breaks scripts and agents that shell out through this config.
- Agent harnesses may replay aliases captured from an interactive shell, so an
  interactivity check alone does not protect them.
- If the config already has a guard for shadowing aliases, put the new alias
  behind it.
- Otherwise ask the user before adding one, and suggest a guard that also
  checks agent markers such as `CLAUDECODE`.
- Aliases with new names (`lg`, `gti`) need no guard.

## Validate

1. `zsh -n <file>` for each edited file.
2. Confirm the change with `zsh -c` for `.zshenv`, `zsh -lc` for `.zprofile`,
   `zsh -ic` for `.zshrc` or a plugin.
3. For a guarded alias, read every marker the guard tests, then confirm the
   definition prints with all of them unset
   (`env -u CLAUDECODE -u AI_AGENT zsh -ic 'alias <name>'`, one `-u` per
   marker) and is gone with one set (`CLAUDECODE=1 zsh -ic 'alias <name>'`).
