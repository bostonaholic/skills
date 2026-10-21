# Detection patterns

What each `scripts/scan-patterns.sh` check flags, by section, and how to
read its hits. The script's patterns are the rule; change them there, with
its tests.

A hit is a lead, not a finding. Read its context, then rate it with
[report format](references/report-format.md). A grep hit is
`./file:line:match`, with the match cut to 400 bytes; reopen the file for
the rest.

## Contents

- File inventory
- Auto-run and install hooks
- Network and exfiltration
- File system access
- Code execution
- Obfuscation
- Credentials and secrets
- Containers, CI, and privileges
- False positives

## File inventory

Section `inventory`: what the greps skip. These checks skip only `.git`, so
they also list `node_modules`, `vendor`, and `dist`.

- `hidden`: hidden files and directories.
- `symlink`: each symlink and its target. The scan never follows one.
- `executable`: files with the owner's execute bit.
- `binary`: files `file` calls binary, which every grep skips.
- `minified`: JS, Python, Ruby, or shell files with a line over 500
  characters, which hand-written code rarely has.

## Auto-run and install hooks

Section `autorun`: code that runs on clone, open, `cd`, install, or build,
without the user asking. Read every hit in full, including any script it
calls.

- `npm-lifecycle`: every npm install or prepare hook;
  `npm-lifecycle-shell`: the ones that shell out, fetch, or decode.
- `npmrc`: `.npmrc` settings that change what npm runs or where it fetches.
- `setup-py`, `pyproject-backend`: Python build hooks and in-tree build
  backends.
- `vscode-folder-open`, `devcontainer-command`: editor and container
  auto-run. `initializeCommand` runs on the host, before the container.
- `git-hooks-dir`, `git-hooks-path`: a hooks directory, or a script that
  points `core.hooksPath` at one.
- `ci-fork-trigger`: workflows that run fork code with repository secrets.
- `build-exec`, `cmake-execute-process`, `gemfile-git-source`: build-time
  code execution, and gems fetched from git.
- `read-in-full`: `.envrc` (direnv runs it on `cd` once allowed),
  `Makefile` (read its default target), `configure`, and `build.rs`.

## Network and exfiltration

Section `network`: outbound requests, beacons, sockets, DNS lookups, and
known exfiltration endpoints. Suspicious when the code's purpose needs no
network, or when the payload is environment, files, or credentials.

- `js-request`, `py-request`, `rb-request`: HTTP clients and sockets.
- `ipv4`: hardcoded IPv4 addresses, outside lockfiles.
- `exfil-endpoint`: tunnels, paste sites, webhook catchers, and chat-bot
  APIs used to receive stolen data.
- `websocket`: WebSocket and socket.io connections.

## File system access

Section `filesystem`: reads of credentials, browser profiles, and system
files, and destructive writes. Ordinary reads of the project's own files are
not findings.

- `credential-path`: SSH, cloud, registry, and git credential paths.
- `dotenv-path`: `.env` files named in a string or path, not `process.env`.
- `browser-store`: browser cookie, password, and storage files.
- `system-file`: `/etc/passwd`, `shadow`, and `sudoers`.
- `destructive-delete`: recursive and file deletes.

## Code execution

Section `exec`: dynamic evaluation, shell spawning, and unsafe
deserialization. Suspicious when the input can come from the network, a
file, or the environment.

- `js-eval`, `py-eval`, `rb-eval`: `eval`, `new Function`, string timers,
  the `vm` module, and Python and Ruby builtins.
- `js-child-process`, `py-shell`, `rb-shell`: shell spawning. Loading
  `child_process` is the signal, not `RegExp#exec`.
- `deserialize`: `pickle`, `marshal`, `yaml.load`, and their kin.

## Obfuscation

Section `obfuscation`: encoded payloads, built-up strings, and packed code
that hide what runs. Any hit near a network or execution hit raises both.

- `base64-run`: long base64 runs, outside lockfiles, SVGs, and source maps.
- `base64-decode`: decoding calls.
- `hex-escape`: runs of escaped hex bytes.
- `char-code`: strings built from character codes or reversed.

Also look for minified files without a source map in a repo that otherwise
ships source, and for anti-debugging checks (`debugger` loops, timing checks).

## Credentials and secrets

Section `secrets`: hardcoded secrets, bulk environment harvesting, and
keychain or clipboard reads. Reading one named variable such as
`process.env.PORT` is normal.

- `hardcoded-key`, `aws-key`, `private-key`: committed secrets.
- `env-dump`: the whole environment serialized or copied, the usual first
  step of env exfiltration.
- `env-spread`: the whole environment spread or merged into another object.
  A copy passed as a child process's env is common; it matters when the copy
  reaches a request or a file.
- `clipboard-keychain`: clipboard reads and keychain lookups.

## Containers, CI, and privileges

Section `privileges`: containers that reach the host, CI that leaks secrets,
and scripts that ask for root or set privilege bits. Worse when an auto-run
entry or install hook reaches them.

- `container-host`: privileged containers, added capabilities, the host's
  Docker socket, and host namespaces.
- `ci-secrets`: CI secrets printed or dumped whole, and workflow tokens
  granted every write permission.
- `privilege-bits`: `sudo`, setuid or setgid bits, and file capabilities.

## False positives

Lower a hit's severity, or drop it, when it sits in:

- a test fixture, mock, or example that nothing at install or run time loads;
- documentation, or a commented-out line;
- a build tool's own configuration (webpack, Babel) doing what that tool does;
- code whose stated purpose needs the capability: an HTTP client library
  making requests, a CLI that spawns git.

Never drop a hit inside an install hook, an auto-run file, or code those
reach.
