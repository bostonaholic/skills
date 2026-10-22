#!/usr/bin/env bash
#
# List every line under ROOT that may call a Ruby constant: literal references
# in any file (code, specs, config/routes.rb, config/*.yml, job config,
# gemspecs, exe/), require lines that load its file, and dynamic constant
# lookups that could build its name at run time.
#
#   usage: find-callers.sh CONSTANT [ROOT]
#
#   CONSTANT  a Ruby constant path such as Point or AcmeMaps::Point; a leading
#             :: is dropped
#   ROOT      the directory to search (default: .)
#
# Requires `grep`, `sed`, `awk`, `sort`, `tr`, `mktemp`, and `rm` on PATH.
#
# Writes one line per hit to stdout, sorted by kind, then path, then line:
#
#   <kind>\t<file>:<line>\t<text>
#
#   file   relative to ROOT
#   kind   one of:
#     dynamic    calls constantize, safe_constantize, or const_get. Whether
#                the name it builds can be CONSTANT is for the reader to decide
#     reference  names CONSTANT as a whole word, bare or in a string. For a
#                namespaced CONSTANT, the last segment alone (Point for
#                AcmeMaps::Point) also counts, since code inside the
#                namespace names it that way
#     require    a require or require_relative of a path ending in the
#                snake_case file name of the last segment (point, point.rb)
#
# A line matching several kinds is listed once under each.
#
# Exit codes:
#
#   0  at least one hit
#   1  no hits
#   2  usage error: wrong argument count, CONSTANT not a constant path, or
#      ROOT not a directory
#   3  a required tool is missing
#   4  grep failed, for example on an unreadable file

set -euo pipefail

# The skill file that explains each exit code, relative to the skill directory.
doc_file=SKILL.md

# Prints `see <absolute path of doc_file>`. It resolves the physical path with
# builtins only, so a symlinked scripts directory or a PATH without dirname
# still names the real file, and a failed resolution never changes the exit.
see_doc() {
  local dir=. real
  if [[ ${BASH_SOURCE[0]} == */* ]]; then dir=${BASH_SOURCE[0]%/*}; fi
  real=$(CDPATH='' cd -P -- "$dir" && pwd -P) || real=$dir
  echo "see ${real%/*}/$doc_file" >&2
}

die() {
  echo "$2" >&2
  see_doc
  exit "$1"
}

if [[ $# -lt 1 || $# -gt 2 ]]; then
  die 2 "usage: $0 CONSTANT [ROOT]"
fi

for tool in grep sed awk sort tr mktemp rm; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    die 3 "error: missing required tool: $tool"
  fi
done

constant=${1#::}
root=${2:-.}

# Ruby constants start with an uppercase ASCII letter; segments join with ::.
if [[ ! $constant =~ ^[A-Z][A-Za-z0-9_]*(::[A-Z][A-Za-z0-9_]*)*$ ]]; then
  die 2 "error: not a Ruby constant path: $1"
fi
if [[ ! -d $root ]]; then
  die 2 "error: not a directory: $root"
fi

short=${constant##*::}
# ActiveSupport's underscore: HTTPClient -> http_client, FooBar -> foo_bar.
snake=$(printf '%s' "$short" |
  sed -E 's/([A-Z]+)([A-Z][a-z])/\1_\2/g; s/([a-z0-9])([A-Z])/\1_\2/g' |
  tr '[:upper:]' '[:lower:]')

name_flags=(-e "$constant")
if [[ $short != "$constant" ]]; then
  name_flags+=(-e "$short")
fi

# Version control, dependencies, logs, and caches hold no caller the project
# owns, and logs and caches can be large enough to bury the real hits.
exclude_flags=(
  --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=vendor
  --exclude-dir=log --exclude-dir=tmp --exclude-dir=coverage
)

hits=$(mktemp)
trap 'rm -f "$hits"' EXIT

# Run grep from ROOT so paths print relative to it, and prefix each hit with
# KIND. grep exits 1 for no match, which is not an error here.
search() {
  local kind=$1 status=0 out
  shift
  out=$(cd "$root" && grep -rnI "${exclude_flags[@]}" "$@" .) || status=$?
  if ((status > 1)); then
    die 4 "error: grep failed searching for $kind hits under $root"
  fi
  if [[ -n $out ]]; then
    printf '%s\n' "$out" | awk -v kind="$kind" '
      {
        # Split "./path:line:text" at the first ":<digits>:".
        if (!match($0, /:[0-9]+:/)) next
        file = substr($0, 1, RSTART - 1)
        sub(/^\.\//, "", file)
        lineno = substr($0, RSTART + 1, RLENGTH - 2)
        text = substr($0, RSTART + RLENGTH)
        printf "%s\t%s\t%s\t%s\n", kind, file, lineno, text
      }' >>"$hits"
  fi
}

search dynamic -E 'constantize|const_get'
search reference -wF "${name_flags[@]}"
search require -E "require(_relative)?[[:space:](]+[\"']([^\"']*/)?${snake}(\\.rb)?[\"']"

if [[ ! -s $hits ]]; then
  exit 1
fi

LC_ALL=C sort -t "$(printf '\t')" -k1,1 -k2,2 -k3,3n "$hits" |
  awk -F '\t' -v OFS='\t' '{
    kind = $1; loc = $2 ":" $3
    $1 = ""; $2 = ""; $3 = ""
    text = substr($0, 4)
    print kind, loc, text
  }'
