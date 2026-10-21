#!/usr/bin/env bash
#
# Run the file inventory and every detection grep over an untrusted clone.
# It only reads: find, file, awk, and grep. It never runs the clone's code and
# never follows a symlink.
#
#   usage: scan-patterns.sh CLONE [--include-dir DIR]...
#
#   CLONE          the clone's root directory
#   --include-dir  scan inside DIR too, one of node_modules, vendor, or dist.
#                  Repeatable. By default the greps skip those directories
#
# Writes one hit per line to stdout, tab-separated:
#
#   SECTION<TAB>CHECK<TAB>HIT
#
#   SECTION  inventory, autorun, network, filesystem, exec, obfuscation,
#            secrets, or privileges, in that order
#   CHECK    the check's ID, in a fixed order within its section
#   HIT      for a grep, ./file:line:match, the match cut to MATCH_BYTES bytes;
#            for an inventory or file check, ./path (a symlink adds -> target)
#
# Hits within one check are sorted by path, then line. No hits prints nothing.
# The inventory skips only .git; every grep also skips node_modules, vendor,
# and dist unless named with --include-dir, and skips binary files.
#
# Exit codes:
#
#   0   every check ran, with or without hits
#   1   a required tool is missing, or a grep failed (stderr names it)
#   64  usage error: no CLONE, CLONE is not a directory, or a bad option

set -euo pipefail

usage() {
  echo "usage: scan-patterns.sh CLONE [--include-dir node_modules|vendor|dist]..." >&2
  exit 64
}

[[ $# -ge 1 ]] || usage
clone=$1
shift
if [[ ! -d $clone ]]; then
  echo "error: not a directory: $clone" >&2
  exit 64
fi

# Installed and generated code: hits there are rarely the repo's own, so the
# greps skip them unless the inventory shows the repo ships code from them.
skipped=(node_modules vendor dist)
while [[ $# -gt 0 ]]; do
  case $1 in
    --include-dir)
      [[ $# -ge 2 ]] || usage
      case $2 in
        node_modules | vendor | dist) ;;
        *)
          echo "error: --include-dir takes node_modules, vendor, or dist, not: $2" >&2
          exit 64
          ;;
      esac
      kept=()
      for dir in "${skipped[@]}"; do
        [[ $dir == "$2" ]] || kept+=("$dir")
      done
      skipped=(${kept[@]+"${kept[@]}"})
      shift 2
      ;;
    *) usage ;;
  esac
done

for tool in grep find file awk sort readlink; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "error: missing required tool: $tool" >&2
    exit 1
  fi
done

cd "$clone"

# A hit in minified code can be a whole bundle on one line; the model reopens
# the file for context, so the first 400 bytes identify the hit.
MATCH_BYTES=400

grep_skip=(--exclude-dir=.git)
for dir in ${skipped[@]+"${skipped[@]}"}; do
  grep_skip+=("--exclude-dir=$dir")
done
js=(--include='*.js' --include='*.mjs' --include='*.cjs' --include='*.jsx' --include='*.ts' --include='*.tsx')
py=(--include='*.py')
rb=(--include='*.rb')
# Lockfile version strings look like IPs and their hashes like base64.
no_locks=(--exclude='*.lock' --exclude='*-lock.json' --exclude='*-lock.yaml' --exclude=go.sum)

# Print each stdin line as SECTION<TAB>CHECK<TAB>line, sorted by path then line.
emit() {
  LC_ALL=C sort -t: -k1,1 -k2,2n |
    LC_ALL=C awk -v s="$1" -v c="$2" -v max="$MATCH_BYTES" 'NF { print s "\t" c "\t" substr($0, 1, max) }'
}

# grep exits 1 for no match, which is not an error; 2 is.
scan() {
  local section=$1 check=$2 out rc=0
  shift 2
  out=$(grep -HnIE "$@") || rc=$?
  if ((rc > 1)); then
    echo "error: grep failed for $section/$check" >&2
    exit 1
  fi
  printf '%s\n' "$out" | emit "$section" "$check"
}

# Recursive grep over the clone, skipping .git and the skipped directories.
scan_tree() {
  local section=$1 check=$2
  shift 2
  scan "$section" "$check" -r "${grep_skip[@]}" "$@" .
}

# Grep one file or directory only when it exists and is not a symlink, so a
# link to the user's own config is never read.
scan_path() {
  local section=$1 check=$2 target=$3
  shift 3
  [[ -e $target && ! -L $target ]] || return 0
  scan "$section" "$check" -r "$@" "./$target"
}

# --- inventory: what the greps cannot see ---------------------------------

find . -mindepth 1 -path ./.git -prune -o -name '.*' -print | emit inventory hidden
find . -path ./.git -prune -o -type l -print | while IFS= read -r link; do
  printf '%s -> %s\n' "$link" "$(readlink "$link")"
done | emit inventory symlink
find . -path ./.git -prune -o -type f -perm -u+x -print | emit inventory executable
find . -path ./.git -prune -o -type f -size +0 -exec file --mime-encoding {} + |
  awk '/:[[:space:]]*binary$/ { sub(/:[[:space:]]*binary$/, ""); print }' | emit inventory binary
# Hand-written code rarely has a 500-character line. awk, not grep: BSD grep
# rejects a repetition count over 255.
find . -path ./.git -prune -o -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.cjs' -o -name '*.py' -o -name '*.rb' -o -name '*.sh' \) \
  -exec awk 'length > 500 { print FILENAME; nextfile }' {} + | emit inventory minified

# --- autorun: code that runs on clone, open, cd, install, or build ---------

scan_tree autorun npm-lifecycle --include=package.json \
  -e '"(preinstall|install|postinstall|prepare|preprepare|postprepare|prepublish)"\s*:'
scan_tree autorun npm-lifecycle-shell --include=package.json \
  -e '"(preinstall|install|postinstall|prepare|prepublish)"\s*:\s*"[^"]*(curl|wget|bash|sh |node -e|eval|base64|\| *sh)'
scan_tree autorun npmrc --include=.npmrc -e '(ignore-scripts|registry|script-shell|node-options)'
scan_tree autorun setup-py --include=setup.py -e '(cmdclass|subprocess|os\.system|urllib|requests\.)'
scan_tree autorun pyproject-backend --include=pyproject.toml -e '(backend-path|build-backend)'
scan_path autorun vscode-folder-open .vscode -e '"runOn"\s*:\s*"folderOpen"'
scan_path autorun devcontainer-command .devcontainer \
  -e '"(initializeCommand|onCreateCommand|updateContentCommand|postCreateCommand|postStartCommand|postAttachCommand)"'
for hooks in .husky .githooks; do
  if [[ -d $hooks && ! -L $hooks ]]; then
    find "./$hooks" -type f -print
  fi
done | emit autorun git-hooks-dir
scan_tree autorun git-hooks-path -e '(core\.hooksPath|husky install|simple-git-hooks)'
scan_path autorun ci-fork-trigger .github/workflows -e '(pull_request_target|workflow_run)'
scan_tree autorun build-exec -e '(^//go:generate|\$\(shell )'
scan_tree autorun cmake-execute-process --include=CMakeLists.txt -e 'execute_process'
scan_tree autorun gemfile-git-source --include=Gemfile -e '\b(git|github)\s*:'
# Files that run on cd, make, or build and have no single pattern to grep.
find_skip=(-name .git)
for dir in ${skipped[@]+"${skipped[@]}"}; do
  find_skip+=(-o -name "$dir")
done
find . -type d \( "${find_skip[@]}" \) -prune -o -type f \
  \( -name .envrc -o -name Makefile -o -name configure -o -name build.rs \) -print |
  emit autorun read-in-full

# --- network: outbound requests and exfiltration endpoints -----------------

scan_tree network js-request "${js[@]}" \
  -e '\b(fetch|axios(\.(get|post|put|patch|request))?|https?\.(get|request)|navigator\.sendBeacon|dns\.(lookup|resolve[a-zA-Z0-9]*))\s*\(|XMLHttpRequest'
scan_tree network py-request "${py[@]}" \
  -e '\b(requests\.(get|post|put|request)|urllib\.request|urlopen|http\.client|aiohttp|httpx|socket\.socket)\b'
scan_tree network rb-request "${rb[@]}" -e '(Net::HTTP|HTTParty|Faraday|RestClient|open-uri|URI\.open)'
scan_tree network ipv4 "${no_locks[@]}" -e '\b([0-9]{1,3}\.){3}[0-9]{1,3}\b'
# Tunnels, paste sites, webhook catchers, and chat-bot APIs used to receive stolen data.
scan_tree network exfil-endpoint \
  -e '(ngrok(-free)?\.(io|app)|pastebin\.com|requestbin|webhook\.site|pipedream\.net|transfer\.sh|discord(app)?\.com/api/webhooks|api\.telegram\.org|interact\.sh|oast\.(fun|pro|live|site|online|me))'
scan_tree network websocket -e '(new WebSocket\s*\(|wss?://|socket\.io)'

# --- filesystem: credential, browser, and system files; destructive writes --

scan_tree filesystem credential-path \
  -e '(\.ssh/|\.aws/|\.netrc|\.npmrc|\.pypirc|\.git-credentials|\.docker/config\.json|\.kube/config|\.gnupg|id_(rsa|ed25519|ecdsa))'
# The leading quote or slash skips process.env.
scan_tree filesystem dotenv-path -e "['\"\`/]\.env(\.[[:alnum:]_-]+)?\b"
scan_tree filesystem browser-store \
  -e '(Login Data|Cookies\.binarycookies|key4\.db|logins\.json|Local Storage/leveldb|Local State)'
scan_tree filesystem system-file -e '/etc/(passwd|shadow|sudoers)'
scan_tree filesystem destructive-delete \
  -e '(fs\.(rm|rmdir|unlink)(Sync)?\s*\(|rimraf|shutil\.rmtree|os\.(remove|unlink)\s*\(|FileUtils\.rm_r|rm -rf)'

# --- exec: dynamic evaluation, shell spawning, unsafe deserialization -------

scan_tree exec js-eval "${js[@]}" \
  -e "\beval\s*\(|new Function\s*\(|\bset(Timeout|Interval)\s*\(\s*['\"\`]|\bvm\.(runInNewContext|runInThisContext|Script)\b"
# Python builtins, not methods such as re.compile.
scan_tree exec py-eval "${py[@]}" -e '(^|[^.[:alnum:]_])(eval|exec|compile|__import__)\s*\('
scan_tree exec rb-eval "${rb[@]}" -e '\b(eval|instance_eval|class_eval|module_eval)\b'
# Loading child_process is the signal, not RegExp#exec.
scan_tree exec js-child-process "${js[@]}" \
  -e "((require|import)\s*\(\s*|from\s+)['\"\`](node:)?child_process['\"\`]|\b(execSync|execFileSync|spawnSync)\s*\("
scan_tree exec py-shell "${py[@]}" -e '(subprocess\.|os\.(system|popen|exec[lv]p?e?)\s*\(|commands\.getoutput|pty\.spawn)'
scan_tree exec rb-shell "${rb[@]}" -e '(\bsystem\s*\(|\bexec\s*\(|%x[{(\[]|`[^`]+`|IO\.popen|Open3\.)'
scan_tree exec deserialize \
  -e '(pickle\.loads?\s*\(|marshal\.loads?\s*\(|yaml\.load\s*\(|shelve\.open|Marshal\.load|YAML\.load\s*\(|unserialize\s*\(|ObjectInputStream)'

# --- obfuscation: encoded payloads and built-up strings --------------------

# SVGs and source maps carry legitimate long base64 runs.
scan_tree obfuscation base64-run "${no_locks[@]}" --exclude='*.svg' --exclude='*.map' -e '[A-Za-z0-9+/]{50,}={0,2}'
scan_tree obfuscation base64-decode \
  -e "(\batob\s*\(|\bbtoa\s*\(|Buffer\.from\s*\([^)]*['\"]base64['\"]|base64\.(b64)?decode|Base64\.decode64)"
scan_tree obfuscation hex-escape -e '(\\x[0-9a-fA-F]{2}){8,}'
scan_tree obfuscation char-code -e "(String\.fromCharCode|\.split\(\s*['\"]['\"]\s*\)\.reverse\(\)\.join)"

# --- secrets: hardcoded keys, environment harvesting, keychain reads -------

scan_tree secrets hardcoded-key -i \
  -e "(api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token)['\"]?\s*[:=]\s*['\"][^'\"]{16,}['\"]"
scan_tree secrets aws-key -e '\b(AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}\b'
scan_tree secrets private-key -e '-----BEGIN ([A-Z]+ )?PRIVATE KEY-----'
# The whole environment serialized or copied: the usual first step of env exfiltration.
scan_tree secrets env-dump \
  -e '(JSON\.stringify\s*\(\s*process\.env\b|Object\.(keys|values|entries)\s*\(\s*process\.env\b|os\.environ\.copy\s*\(|dict\s*\(\s*os\.environ\s*\)|ENV\.to_h)'
scan_tree secrets env-spread \
  -e '(\.\.\.\s*process\.env\b|Object\.assign\s*\([^)]*\bprocess\.env\s*[,)]|\*\*\s*os\.environ\b)'
scan_tree secrets clipboard-keychain \
  -e '(navigator\.clipboard\.readText|\bpbpaste\b|\bxclip\b|security find-(generic|internet)-password|\bkeytar\b)'

# --- privileges: containers that reach the host, CI secrets, root ----------

scan_tree privileges container-host \
  -e '(--privileged|privileged"?\s*:\s*true|--cap-add|cap_add|"capAdd"|docker\.sock|(network_mode|pid|ipc)"?\s*:\s*"?host|--(net|network|pid|ipc)[= ]host)'
scan_path privileges ci-secrets .github/workflows \
  -e '((echo|printf).*\$\{\{\s*secrets\.|toJSON\(\s*secrets\s*\)|permissions:\s*write-all)'
scan_tree privileges privilege-bits -e '(\bsudo\b|\bchmod\b.*(\+s\b|\b[2-7][0-7]{3}\b)|\bsetcap\b)'
