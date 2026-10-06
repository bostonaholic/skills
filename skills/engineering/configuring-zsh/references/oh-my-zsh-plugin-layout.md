# Custom oh-my-zsh plugin layout

Read this when a dotfiles repo keeps personal shell code in a custom oh-my-zsh
plugin: a `<name>.plugin.zsh` file in the repo, linked to
`${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/plugins/<name>/<name>.plugin.zsh` and
enabled by `<name>` in the `plugins=(...)` list in `.zshrc`.

## What goes where

| Change                                                | File                                         |
| ----------------------------------------------------- | -------------------------------------------- |
| Aliases and shell functions                           | The plugin file                              |
| `compdef` for the plugin's own functions              | The plugin file                              |
| Interactive-only variables (`LESS`, `LS_COLORS`)      | The plugin file                              |
| Completion functions (`_name`)                        | A file named `_name` in the plugin directory |
| Theme, `plugins=(...)`, `zstyle`, `setopt`, framework | `.zshrc`                                     |
| `FPATH` additions for other completion sources        | `.zshrc`, above `source $ZSH/oh-my-zsh.sh`   |
| Exported variables and `PATH`                         | `.zprofile`                                  |

oh-my-zsh adds each enabled plugin directory to `fpath`, runs `compinit`, then
sources the plugin files, so `compdef` works inside a plugin file and `_name`
files in the plugin directory autoload.

## Rules

- Keep `.zshrc` for framework configuration; personal aliases and functions go
  in the plugin file.
- A new plugin needs a directory and file with the same name, an entry in
  `plugins=(...)`, and a link registered in the repo's symlink manifest.
- If the repo has tests for its alias guard (search its test directory for the
  guard variable), add each new command-shadowing alias to them and run them.

## Validate

```sh
zsh -n <plugin file>
zsh -ic 'whence -v <function>; alias <alias>'
```
