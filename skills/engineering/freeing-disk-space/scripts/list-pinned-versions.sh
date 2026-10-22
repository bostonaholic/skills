#!/usr/bin/env bash
#
# List the toolchain versions that projects under a workspace pin, so no
# pinned version is uninstalled. Read-only.
#
#   usage: list-pinned-versions.sh WORKSPACE
#
#   WORKSPACE  a directory holding projects, such as ~/code
#
# Reads .ruby-version (ruby), .node-version and .nvmrc (node),
# .python-version (python), .tool-versions (each tool it names), and
# rust-toolchain and rust-toolchain.toml (rust), up to three levels below
# WORKSPACE. Blank lines and # comments are skipped; versions are printed as
# written.
#
# Writes one tab-separated line per pinned version to stdout, sorted by tool
# and then version, and nothing when no project pins a version:
#
#   tool  version  count
#
#   count  how many version files pin that version
#
# Exit codes:
#
#   0   every version file was read
#   64  usage error: not exactly one argument, or WORKSPACE is not a directory
#   69  a required tool is missing

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

if [[ $# -ne 1 ]]; then
  die 64 "usage: $0 WORKSPACE"
fi
workspace=$1
if [[ ! -d $workspace ]]; then
  die 64 "error: not a directory: $workspace"
fi

for tool in awk find sort uniq; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    die 69 "error: missing required tool: $tool"
  fi
done

# Three levels reach WORKSPACE/owner/project/.ruby-version as well as
# WORKSPACE/project/.ruby-version, without walking into dependency trees.
max_depth=3

# Print "tool<TAB>version" once per version a file pins.
read -r -d '' parse <<'AWK' || true
function emit(tool, version) {
  if (!((tool, version) in seen)) {
    seen[tool, version]
    print tool "\t" version
  }
}
FNR == 1 { delete seen; n = split(FILENAME, parts, "/"); base = parts[n] }
{ sub(/\r$/, ""); sub(/#.*/, ""); gsub(/^[ \t]+|[ \t]+$/, "") }
$0 == "" { next }
base == ".tool-versions" { for (i = 2; i <= NF; i++) emit($1, $i); next }
base == ".ruby-version" { emit("ruby", $0); next }
base == ".node-version" || base == ".nvmrc" { emit("node", $0); next }
base == ".python-version" { for (i = 1; i <= NF; i++) emit("python", $i); next }
# rust-toolchain.toml, and the TOML form of rust-toolchain, name the version
# in a channel key; the legacy rust-toolchain is the bare channel.
/^channel *= *"[^"]*"/ { v = $0; sub(/^channel *= *"/, "", v); sub(/".*/, "", v); emit("rust", v); next }
base == "rust-toolchain" && !/[=[]/ { emit("rust", $0) }
AWK

find "$workspace" -maxdepth "$max_depth" -type f \( \
  -name .ruby-version -o -name .node-version -o -name .nvmrc -o \
  -name .python-version -o -name .tool-versions -o \
  -name rust-toolchain -o -name rust-toolchain.toml \) \
  -exec awk "$parse" {} + |
  LC_ALL=C sort |
  uniq -c |
  awk '{ count = $1; sub(/^ *[0-9]+ /, ""); print $0 "\t" count }'
