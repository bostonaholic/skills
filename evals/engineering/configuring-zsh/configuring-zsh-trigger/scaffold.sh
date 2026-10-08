#!/usr/bin/env bash
set -euo pipefail

mkdir -p acme-dotfiles/zsh
cat >acme-dotfiles/zsh/zprofile <<'EOF_1'
eval "$(/opt/homebrew/bin/brew shellenv)"

export EDITOR=nvim
export VISUAL=nvim
EOF_1

cat >acme-dotfiles/zsh/zshrc <<'EOF_2'
autoload -Uz compinit
compinit

HISTFILE=$HOME/.zsh_history
HISTSIZE=50000
SAVEHIST=50000
setopt SHARE_HISTORY
setopt EXTENDED_HISTORY

export PATH="$HOME/.local/bin:$PATH"

alias gs='git status'
alias gd='git diff'
alias ..='cd ..'

PROMPT='%F{cyan}%~%f %# '
EOF_2

git init -q
git add -A
