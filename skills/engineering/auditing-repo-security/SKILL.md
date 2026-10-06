---
name: auditing-repo-security
description: 'Audits a cloned repo before install or run: install hooks, auto-run files, lockfile CVEs, typosquats, and exfiltration, credential-theft, code-execution, and obfuscation patterns, graded A-F with a safe-to-run verdict. Use when asked to audit a repo, check whether a clone is safe to run, or scan for malicious code.'
---

# Auditing repo security

Audit an untrusted clone without running it. **Never install dependencies,
run build scripts, run tests, or execute repo code during an audit.** Read
files, run the greps in the detection patterns, and run only the lockfile
scanners below.

Copy this checklist and check off each step:

```text
- [ ] 1. Preflight: list available scanners
- [ ] 2. Phase 1: pre-run and auto-run check
- [ ] 3. Phase 2: dependencies, lockfiles, known CVEs
- [ ] 4. Phase 3: install scripts
- [ ] 5. Phase 4: pattern scan
- [ ] 6. Verify every Critical and High hit
- [ ] 7. Phase 5: score and report
```

**Fail fast at any phase:** when a verified hit is clearly malicious (credential
or environment exfiltration, a backdoor, an install hook that runs a remote
payload), stop, score what you have, and report the remaining phases as
`Not run: stopped after a critical finding.`

Read each linked file from this skill's directory when the step that uses it
begins. If a read fails, stop that step and report the exact path.

## Preflight

Run `command -v git grep osv-scanner` plus the ecosystem fallbacks Phase 2
needs (`npm`, `bundle-audit`, `pip-audit`, `cargo-audit`). A missing scanner is
never installed during the audit: record `Not run: <tool> not installed` and
review the lockfile by hand for known-bad or typosquatted names.

## Phase 1: pre-run and auto-run check

1. Identify the ecosystems from their manifests: `package.json`, `Gemfile`,
   `requirements.txt`, `pyproject.toml`, `setup.py`, `Cargo.toml`, `go.mod`,
   `Makefile`, `CMakeLists.txt`.
2. Find everything that runs without an explicit command: install hooks,
   `.vscode/tasks.json` tasks with `"runOn": "folderOpen"`, `.envrc`, git
   hooks (`.husky/`, a script that sets `core.hooksPath`), `.devcontainer`
   commands, `Makefile` default targets, `configure`, and workflows on
   `pull_request_target`. Use the
   [auto-run and install hook greps](references/detection-patterns.md#auto-run-and-install-hooks).
3. Record the result: **PASS** (nothing runs automatically), **CONDITIONAL**
   (something runs, and the report names how to avoid it), or **FAIL** (what
   runs is dangerous). Continue the static audit in every case unless the
   fail-fast rule applies.

## Phase 2: dependencies

1. **Lockfiles.** Note each manifest without a lockfile; that is one Medium
   finding in total.
2. **Known CVEs.** Default: `osv-scanner scan -L <lockfile>` for each lockfile;
   it reads the lockfile only. Never run `osv-scanner fix`, which can invoke
   the package manager. When `osv-scanner` is missing, use the lockfile-only
   fallback:

   | Lockfile                                                          | Fallback                                                                                                                               |
   | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
   | `package-lock.json`                                               | `npm audit --package-lock-only --json`                                                                                                 |
   | `Gemfile.lock`                                                    | `bundle-audit check --update`                                                                                                          |
   | `requirements.txt`, every line pinned with `==`                   | `pip-audit -r requirements.txt --no-deps --disable-pip`                                                                                |
   | `Cargo.lock`                                                      | `cargo-audit audit --file Cargo.lock`, called by its binary name: a `.cargo/config.toml` alias in the clone can redefine `cargo audit` |
   | `yarn.lock`, `pnpm-lock.yaml`, `poetry.lock`, `uv.lock`, `go.sum` | None; review by hand                                                                                                                   |

   Never run `yarn`, `pnpm`, `poetry`, `uv`, `go`, `bundle install`,
   `pip install`, `npm install`, or `npm ci` in the clone: a `.yarnrc.yml`
   `yarnPath`, a build backend, or a lifecycle script runs repo code.
   `yarn audit` and `yarn npm audit` are therefore out too. `safety check` is
   deprecated, and `safety scan` needs an account; prefer the scanners above.
   Before trusting a scanner's silence, check the clone for config that
   ignores advisories (`osv-scanner.toml`, `.bundler-audit.yml`) and a
   `.npmrc` `registry` that would send the dependency list elsewhere.

3. **Provenance.** Flag dependencies from git URLs or non-default registries,
   very large trees, and packages unmaintained for two or more years.
4. **Typosquatting.** Compare dependency names with well-known packages for
   one-character substitutions, swapped characters, and scope confusion.

## Phase 3: install scripts

Read every hook Phase 1 found, and every script it calls, in full.

- **npm:** `preinstall`, `install`, `postinstall`, `prepare`, `prepublish`;
  flag `curl`, `wget`, `bash`, `sh`, `node -e`, or remote downloads. Check
  `.npmrc` for `ignore-scripts=false`, `script-shell`, and custom registries.
- **Python:** `setup.py` `cmdclass` overrides and subprocess calls;
  `pyproject.toml` `backend-path` (an in-tree build backend).
- **Ruby:** gems from `git:` or `github:` sources; native extensions
  (`extconf.rb`) and their `Rakefile`.
- **Rust, Go, C:** `build.rs` network or shell use; `//go:generate`
  directives; `Makefile` and `CMakeLists.txt` default and `install` targets
  and `$(shell ...)` calls.

## Phase 4: pattern scan

Run every grep in [detection patterns](references/detection-patterns.md) and
collect the hits by category. Judge each in context:

- A network library making requests is expected; a date formatter doing so is
  not.
- Several low findings can chain into a high one, such as an environment read
  plus an encoded string plus an outbound request.
- Ecosystem norms differ: native extensions are common in Ruby gems;
  `postinstall` network calls are rare in npm packages.

## Verify Critical and High hits

Before scoring, reopen each Critical and High hit and read at least 20 lines
around it plus anything it calls. Drop hits in test fixtures, docs, comments,
and code nothing loads, per the
[false-positive rules](references/detection-patterns.md#false-positives).
Downgrade hits whose purpose is clear. Recompute the counts. Every finding in
the report cites `file:line` and the exact code.

## Phase 5: score and report

Score, grade, and write the report with
[report format](references/report-format.md).
