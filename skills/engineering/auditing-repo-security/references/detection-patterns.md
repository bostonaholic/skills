# Detection patterns

Run every command from the clone's root in bash or zsh. Each prints
`file:line:match`, skips binary files (`-I`), and skips `.git`,
`node_modules`, `vendor`, and `dist`, so hits come from the repo's own code.
When the repo ships prebuilt code from one of those directories and nothing
else explains what runs, rerun the scan without that `--exclude-dir`.

A hit is a lead, not a finding. Read its context, then rate it with
[report format](references/report-format.md). Patterns starting with `-` are
passed with `-e` so grep does not read them as options.

## Contents

- Auto-run and install hooks
- Network and exfiltration
- File system access
- Code execution
- Obfuscation
- Credentials and secrets
- False positives

## Auto-run and install hooks

Code that runs on clone, open, `cd`, install, or build, without the user
asking. Read every hit in full, including any script it calls.

```bash
# npm lifecycle scripts: every hook, then the ones that shell out or fetch.
grep -rnIE --exclude-dir={.git,node_modules,vendor,dist} --include=package.json \
  -e '"(preinstall|install|postinstall|prepare|preprepare|postprepare|prepublish)"\s*:' .
grep -rnIE --exclude-dir={.git,node_modules,vendor,dist} --include=package.json \
  -e '"(preinstall|install|postinstall|prepare|prepublish)"\s*:\s*"[^"]*(curl|wget|bash|sh |node -e|eval|base64|\| *sh)' .
# .npmrc settings that change what npm runs or where it fetches from.
grep -nE -e '(ignore-scripts|registry|script-shell|node-options)' .npmrc
# Python build hooks and in-tree build backends.
grep -rnIE --exclude-dir={.git,node_modules,vendor,dist} --include=setup.py \
  -e '(cmdclass|subprocess|os\.system|urllib|requests\.)' .
grep -nE -e '(backend-path|build-backend)' pyproject.toml
# Editor and container auto-run. initializeCommand runs on the host, before the container.
grep -rnIE -e '"runOn"\s*:\s*"folderOpen"' .vscode
grep -rnIE -e '"(initializeCommand|onCreateCommand|updateContentCommand|postCreateCommand|postStartCommand|postAttachCommand)"' .devcontainer
# Git hooks: a hooks directory, or a script that points core.hooksPath at one.
ls -a .husky .githooks 2>/dev/null
grep -rnIE --exclude-dir={.git,node_modules,vendor,dist} -e '(core\.hooksPath|husky install|simple-git-hooks)' .
# CI that runs fork code with repository secrets.
grep -rnIE -e 'pull_request_target' .github/workflows
# Build-time code execution.
grep -rnIE --exclude-dir={.git,node_modules,vendor,dist} -e '(^//go:generate|\$\(shell )' .
```

Also read in full when present: `.envrc` (direnv runs it on `cd` once
allowed), the `Makefile` default target, `configure`, `build.rs`,
`CMakeLists.txt` `execute_process`, and `Gemfile` entries with `git:` or
`github:` sources.

## Network and exfiltration

Outbound requests, beacons, sockets, DNS lookups, and known exfiltration
endpoints. Suspicious when the code's purpose needs no network, or when the
payload is environment, files, or credentials.

```bash
grep -rnIE --exclude-dir={.git,node_modules,vendor,dist} --include='*.'{js,mjs,cjs,jsx,ts,tsx} \
  -e '\b(fetch|axios(\.(get|post|put|patch|request))?|https?\.(get|request)|navigator\.sendBeacon|dns\.(lookup|resolve[a-zA-Z0-9]*))\s*\(|XMLHttpRequest' .
grep -rnIE --exclude-dir={.git,node_modules,vendor,dist} --include='*.py' \
  -e '\b(requests\.(get|post|put|request)|urllib\.request|urlopen|http\.client|aiohttp|httpx|socket\.socket)\b' .
grep -rnIE --exclude-dir={.git,node_modules,vendor,dist} --include='*.rb' \
  -e '(Net::HTTP|HTTParty|Faraday|RestClient|open-uri|URI\.open)' .
# Hardcoded IPv4 addresses, outside lockfiles (their version strings look like IPs).
grep -rnIE --exclude-dir={.git,node_modules,vendor,dist} --exclude={'*.lock','*-lock.json','*-lock.yaml','go.sum'} \
  -e '\b([0-9]{1,3}\.){3}[0-9]{1,3}\b' .
# Tunnels, paste sites, webhook catchers, and chat-bot APIs used to receive stolen data.
grep -rnIE --exclude-dir={.git,node_modules,vendor,dist} \
  -e '(ngrok(-free)?\.(io|app)|pastebin\.com|requestbin|webhook\.site|pipedream\.net|transfer\.sh|discord(app)?\.com/api/webhooks|api\.telegram\.org|interact\.sh|oast\.(fun|pro|live|site|online|me))' .
grep -rnIE --exclude-dir={.git,node_modules,vendor,dist} -e '(new WebSocket\s*\(|wss?://|socket\.io)' .
```

## File system access

Reads of credentials, browser profiles, and system files, and destructive
writes. Ordinary reads of the project's own files are not findings.

```bash
grep -rnIE --exclude-dir={.git,node_modules,vendor,dist} \
  -e '(\.ssh/|\.aws/|\.netrc|\.npmrc|\.pypirc|\.git-credentials|\.docker/config\.json|\.kube/config|\.gnupg|id_(rsa|ed25519|ecdsa))' .
# Browser cookie, password, and storage files.
grep -rnIE --exclude-dir={.git,node_modules,vendor,dist} \
  -e '(Login Data|Cookies\.binarycookies|key4\.db|logins\.json|Local Storage/leveldb|Local State)' .
grep -rnIE --exclude-dir={.git,node_modules,vendor,dist} -e '/etc/(passwd|shadow|sudoers)' .
grep -rnIE --exclude-dir={.git,node_modules,vendor,dist} \
  -e '(fs\.(rm|rmdir|unlink)(Sync)?\s*\(|rimraf|shutil\.rmtree|os\.(remove|unlink)\s*\(|FileUtils\.rm_r|rm -rf)' .
```

## Code execution

Dynamic evaluation, shell spawning, and unsafe deserialization. Suspicious
when the input can come from the network, a file, or the environment.

```bash
# JavaScript: eval, new Function, timers given a string, and the vm module.
grep -rnIE --exclude-dir={.git,node_modules,vendor,dist} --include='*.'{js,mjs,cjs,jsx,ts,tsx} \
  -e "\beval\s*\(|new Function\s*\(|\bset(Timeout|Interval)\s*\(\s*['\"\`]|\bvm\.(runInNewContext|runInThisContext|Script)\b" .
# Python builtins, not methods such as re.compile.
grep -rnIE --exclude-dir={.git,node_modules,vendor,dist} --include='*.py' \
  -e '(^|[^.[:alnum:]_])(eval|exec|compile|__import__)\s*\(' .
grep -rnIE --exclude-dir={.git,node_modules,vendor,dist} --include='*.rb' \
  -e '\b(eval|instance_eval|class_eval|module_eval)\b' .
# Shell spawning: importing child_process is the signal, not RegExp#exec.
grep -rnIE --exclude-dir={.git,node_modules,vendor,dist} --include='*.'{js,mjs,cjs,jsx,ts,tsx} \
  -e "(require\s*\(\s*|from\s+)['\"](node:)?child_process['\"]|\b(execSync|execFileSync|spawnSync)\s*\(" .
grep -rnIE --exclude-dir={.git,node_modules,vendor,dist} --include='*.py' \
  -e '(subprocess\.|os\.(system|popen|exec[lv]p?e?)\s*\(|commands\.getoutput|pty\.spawn)' .
grep -rnIE --exclude-dir={.git,node_modules,vendor,dist} --include='*.rb' \
  -e '(\bsystem\s*\(|\bexec\s*\(|%x[{(\[]|`[^`]+`|IO\.popen|Open3\.)' .
grep -rnIE --exclude-dir={.git,node_modules,vendor,dist} \
  -e '(pickle\.loads?\s*\(|marshal\.loads?\s*\(|yaml\.load\s*\(|shelve\.open|Marshal\.load|YAML\.load\s*\(|unserialize\s*\(|ObjectInputStream)' .
```

## Obfuscation

Encoded payloads, built-up strings, and packed code that hide what runs. Any
hit near a network or execution hit raises both.

```bash
# Long base64 runs, outside lockfiles, SVGs, and source maps (their hashes are legitimate).
grep -rnIE --exclude-dir={.git,node_modules,vendor,dist} --exclude={'*.lock','*-lock.json','*-lock.yaml','go.sum','*.svg','*.map'} \
  -e '[A-Za-z0-9+/]{50,}={0,2}' .
grep -rnIE --exclude-dir={.git,node_modules,vendor,dist} \
  -e "(\batob\s*\(|\bbtoa\s*\(|Buffer\.from\s*\([^)]*['\"]base64['\"]|base64\.(b64)?decode|Base64\.decode64)" .
# Runs of escaped hex bytes.
grep -rnIE --exclude-dir={.git,node_modules,vendor,dist} -e '(\\x[0-9a-fA-F]{2}){8,}' .
grep -rnIE --exclude-dir={.git,node_modules,vendor,dist} \
  -e "(String\.fromCharCode|\.split\(\s*['\"]['\"]\s*\)\.reverse\(\)\.join)" .
```

Also look for minified files without a source map in a repo that otherwise
ships source, and for anti-debugging checks (`debugger` loops, timing checks).

## Credentials and secrets

Hardcoded secrets, bulk environment harvesting, and keychain or clipboard
reads. Reading one named variable such as `process.env.PORT` is normal.

```bash
grep -rniIE --exclude-dir={.git,node_modules,vendor,dist} \
  -e "(api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token)['\"]?\s*[:=]\s*['\"][^'\"]{16,}['\"]" .
grep -rnIE --exclude-dir={.git,node_modules,vendor,dist} -e '\b(AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}\b' .
grep -rnIE --exclude-dir={.git,node_modules,vendor,dist} -e '-----BEGIN ([A-Z]+ )?PRIVATE KEY-----' .
# The whole environment serialized or copied, the usual first step of env exfiltration.
grep -rnIE --exclude-dir={.git,node_modules,vendor,dist} \
  -e '(JSON\.stringify\s*\(\s*process\.env\b|Object\.(keys|values|entries)\s*\(\s*process\.env\b|os\.environ\.copy\s*\(|dict\s*\(\s*os\.environ\s*\)|ENV\.to_h)' .
grep -rnIE --exclude-dir={.git,node_modules,vendor,dist} \
  -e '(navigator\.clipboard\.readText|\bpbpaste\b|\bxclip\b|security find-(generic|internet)-password|\bkeytar\b)' .
```

## False positives

Lower a hit's severity, or drop it, when it sits in:

- a test fixture, mock, or example that nothing at install or run time loads;
- documentation, or a commented-out line;
- a build tool's own configuration (webpack, Babel) doing what that tool does;
- code whose stated purpose needs the capability: an HTTP client library
  making requests, a CLI that spawns git.

Never drop a hit inside an install hook, an auto-run file, or code those
reach.
