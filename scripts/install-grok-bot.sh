#!/bin/sh
# Installs the active skills into a Grok Bot skill library.
#   sh scripts/install-grok-bot.sh [--set all|strategy] [--dest <dir>]
# Copies each active skill's SKILL.md, references/, scripts/, and shared/ from this checkout to
# <dir>/<name>/, replacing any existing <dir>/<name>/ so a rerun updates in place. <dir> defaults
# to $HOME/agent-data/workflows, where Grok Bot reads user skills. Skips skills/deprecated/ and
# each skill's agents/openai.yaml, which only Codex reads. `--set strategy` installs only the
# skills that suit a non-coding strategy bot. Exit 0 on success, 1 when a skill is missing from
# the checkout or nothing was installed, 2 on a usage error.
set -eu

# Skills that need no repository, compiler, or test suite: writing, research, prompts, pricing,
# and backlog grooming. Keep this list in step with the Grok Bot section of INSTALL.md.
STRATEGY_SKILLS="
being-extremely-fucking-brief
composing-agent-prompts
conducting-deep-research
grooming-backlogs
improving-prompts
pricing-creativity
writing-prose
writing-system-prompts
"

usage() {
  echo "usage: sh scripts/install-grok-bot.sh [--set all|strategy] [--dest <dir>]" >&2
  exit 2
}

set_name=all
dest="${HOME:-}/agent-data/workflows"
while [ $# -gt 0 ]; do
  case "$1" in
    --set)
      [ $# -ge 2 ] || usage
      set_name="$2"
      shift 2
      ;;
    --dest)
      [ $# -ge 2 ] || usage
      dest="$2"
      shift 2
      ;;
    *) usage ;;
  esac
done
case "$set_name" in
  all | strategy) ;;
  *) usage ;;
esac
[ -n "$dest" ] || usage

root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"

# Prints "<name> <path>" for every active skill directory.
active_skills() {
  for entry in skills/engineering/*/SKILL.md skills/productivity/*/SKILL.md; do
    [ -f "$entry" ] || continue
    dir=${entry%/SKILL.md}
    echo "${dir##*/} $dir"
  done
}

# Prints the directory of the named active skill, or exits 1 naming it.
find_skill() {
  found=$(active_skills | awk -v name="$1" '$1 == name { print $2 }')
  if [ -z "$found" ]; then
    echo "install-grok-bot.sh: skill $1 is not an active skill in $root" >&2
    exit 1
  fi
  echo "$found"
}

install_skill() {
  name=$1
  src=$2
  target="$dest/$name"
  rm -rf "$target"
  mkdir -p "$target"
  cp "$src/SKILL.md" "$target/SKILL.md"
  for sub in references scripts shared; do
    [ -d "$src/$sub" ] && cp -R "$src/$sub" "$target/$sub"
  done
  echo "installed $name"
}

mkdir -p "$dest"
count=0
if [ "$set_name" = strategy ]; then
  for name in $STRATEGY_SKILLS; do
    src=$(find_skill "$name")
    install_skill "$name" "$src"
    count=$((count + 1))
  done
else
  active_skills | while read -r name src; do
    install_skill "$name" "$src"
  done
  count=$(active_skills | wc -l | tr -d ' ')
fi
if [ "$count" -eq 0 ]; then
  echo "install-grok-bot.sh: found no active skills under $root/skills" >&2
  exit 1
fi
echo "$count skills installed to $dest"
