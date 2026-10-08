---
name: configuring-zsh
description: Chooses the zsh startup file (.zshenv, .zprofile, .zshrc, .zlogin, or a custom plugin under ZSH_CUSTOM) for a configuration change and edits the dotfiles repo source behind the symlink. Use when adding or moving environment variables, PATH entries, aliases, functions, setopt or zstyle options, or completions in zsh config.
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

Startup files usually live in a dotfiles repo and are symlinked into `$HOME`
(or `$ZDOTDIR`). Write to the repo file, not the link: many editors and write
tools replace a symlink with a regular file. Before adding a new startup
file, find how the repo creates its links (a symlink manifest, an install
script, or a stow layout), register the new file there, and ask before
running the repo's installer.

If the repo links a `<name>.plugin.zsh` into
`${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/plugins/<name>/`, follow the
[oh-my-zsh plugin layout](references/oh-my-zsh-plugin-layout.md) for
aliases, functions, and completions.

## Choose the startup file

| Change                                                                                        | File                                                                         |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `PATH`, tool init that sets it (`eval "$(brew shellenv)"`), variables for programs (`EDITOR`) | `.zprofile`                                                                  |
| Variables every shell needs, including scripts (`ZDOTDIR`, guard flags)                       | `.zshenv`                                                                    |
| `setopt`, `zstyle`, prompt, framework and plugin list                                         | `.zshrc`                                                                     |
| `FPATH` additions                                                                             | `.zshrc`, before `compinit` (with oh-my-zsh, before sourcing `oh-my-zsh.sh`) |
| Aliases, functions, `compdef` for them, interactive variables (`LESS`)                        | `.zshrc` after `compinit`, or the custom plugin file                         |

- Put `PATH` in `.zprofile`, not `.zshenv` or `.zshrc`: macOS `/etc/zprofile`
  runs `path_helper`, which moves entries set in `.zshenv` behind the system
  paths, and `.zshrc` never runs for programs started outside an interactive
  shell. Where no `path_helper` runs (most Linux systems), `.zshenv` is also
  safe for `PATH`.
- Keep `.zshenv` fast and silent; it runs for every script.
- Edit an existing file when one runs in the needed context.
- Before adding an alias or function, check that an enabled plugin does not
  already define it: `zsh -ic 'whence -v <name>'`.

## Aliases that shadow commands

An alias that replaces a standard command (`ls`, `cat`, `grep`, `rm`, `cd`)
breaks scripts and agents that shell out through this config. Agent harnesses
may capture aliases from an interactive shell and replay them, so a check for
interactivity alone does not protect them. If the config already has a guard
for shadowing aliases, put the new alias behind it. Otherwise ask the user
before adding one, and suggest a guard that also checks agent markers such as
`CLAUDECODE`. Aliases with new names (`lg`, `gti`) need no guard.

## Validate

Run until every check passes:

1. `zsh -n <file>` for each edited file.
2. Confirm the change in the shell type it targets: `zsh -c` for `.zshenv`,
   `zsh -lc` for `.zprofile`, `zsh -ic` for `.zshrc` or a plugin.
3. For a guarded alias, check both sides of the guard. An agent shell already
   sets markers, so read every marker the guard tests, then:
   - Unset all of them and confirm the new definition prints:
     `env -u CLAUDECODE -u AI_AGENT zsh -ic 'alias <name>'`, with one `-u` per
     marker.
   - Set one and confirm the new definition is gone (it may print nothing or
     an alias from another layer): `CLAUDECODE=1 zsh -ic 'alias <name>'`.
4. Tell the user to open a new terminal; running shells keep the old config.
