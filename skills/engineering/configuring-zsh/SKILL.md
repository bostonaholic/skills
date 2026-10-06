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

# Zsh Configuration Placement

## 1. Find the file to edit

Startup files usually live in a dotfiles repo and are symlinked into `$HOME`.
Write to the repo file, not the link: many editors and write tools replace a
symlink with a regular file.

```sh
zsh -c 'print -r -- ${ZDOTDIR:-$HOME}'
for f in ~/.zshenv ~/.zprofile ~/.zshrc ~/.zlogin ~/.zlogout; do
  [ -e "$f" ] && printf '%s -> %s\n' "$f" "$(readlink "$f" || echo 'regular file')"
done
```

If `ZDOTDIR` is set, the files other than `.zshenv` live there. When the links
point into a repo, find how the repo creates them (a symlink manifest, an
install script, or a stow layout) before adding a new startup file; register
the new file there and ask before running the repo's installer.

If the repo links a `<name>.plugin.zsh` into
`${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/plugins/<name>/`, read
[oh-my-zsh plugin layout](references/oh-my-zsh-plugin-layout.md) and follow its
placement for aliases, functions, and completions.

Read each linked file from this skill's directory when the step that uses it
begins. If a read fails, stop that step and report the exact path.

## 2. Choose the startup file

Zsh reads `.zshenv` (every shell, including scripts and most agent shells),
then `.zprofile` (login shells), then `.zshrc` (interactive shells), then
`.zlogin` (login shells); `.zlogout` runs when a login shell exits. macOS
terminal apps open login shells; most Linux terminals open non-login
interactive shells.

| Change                                                                  | File                                                                         |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `PATH` entries and exported variables for programs (`EDITOR`, `XDG_*`)  | `.zprofile`                                                                  |
| Variables every shell needs, including scripts (`ZDOTDIR`, guard flags) | `.zshenv`                                                                    |
| `setopt`, `unsetopt`, `zstyle`, prompt, framework and plugin list       | `.zshrc`                                                                     |
| `FPATH` additions                                                       | `.zshrc`, before `compinit` (with oh-my-zsh, before sourcing `oh-my-zsh.sh`) |
| Aliases, functions, `compdef` for them, interactive variables (`LESS`)  | `.zshrc` after `compinit`, or the custom plugin file                         |
| Commands to run after login completes                                   | `.zlogin`                                                                    |
| Cleanup on logout                                                       | `.zlogout`                                                                   |

- Put `PATH` in `.zprofile`, not `.zshenv` or `.zshrc`: macOS `/etc/zprofile`
  runs `path_helper`, which moves entries set in `.zshenv` behind the system
  paths, and `.zshrc` never runs for programs started outside an interactive
  shell.
- Keep `.zshenv` fast and silent; it runs for every script.
- Edit an existing file when it is there; create a new startup file only when
  no existing one runs in the needed context.
- Before adding an alias or function, check that an enabled plugin does not
  already define it: `zsh -ic 'whence -v <name>'`.

### Aliases that shadow commands

An alias that replaces a standard command (`ls`, `cat`, `grep`, `rm`, `cd`)
breaks scripts and agents that shell out through this config. Agent harnesses
may capture aliases from an interactive shell and replay them, so a check for
interactivity alone does not protect them. If the config already has a guard
for shadowing aliases, put the new alias behind it. Otherwise ask the user
before adding one, and suggest a guard that also checks agent markers such as
`CLAUDECODE`. Aliases with new names (`lg`, `gti`) need no guard.

## 3. Validate

Run until every check passes:

1. `zsh -n <file>` for each edited file; fix any syntax error and rerun.
2. Confirm the change in the shell type it targets:
   - `.zshenv`: `zsh -c 'print -r -- $VAR'`
   - `.zprofile`: `zsh -lc 'print -r -- $VAR; print -r -- $PATH'`
   - `.zshrc` or plugin: `zsh -ic 'alias <name>; whence -v <function>'`
   - All together: `zsh -lic '...'`
3. For a guarded alias, rerun the check with a marker the guard tests (for
   example `CLAUDECODE=1 zsh -ic 'alias <name>'`) and confirm it prints
   nothing.
4. Tell the user to open a new terminal; running shells keep the old config.
