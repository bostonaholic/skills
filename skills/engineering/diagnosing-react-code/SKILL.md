---
name: diagnosing-react-code
description: Runs the react-doctor scanner on a React package, fixes its error diagnostics, and re-runs until none remain. Use when React components or hooks changed, when finishing a React feature or bug fix, or when asked to health-check React code.
metadata:
  version: "1.0.0"
---

# Diagnosing React code

react-doctor scans a React package and prints a 0-100 score plus diagnostics in
categories such as security, performance, correctness, and architecture.

## Requirements

- Node `^20.19.0 || >=22.13.0` and `npx`. Check with
  `node --version && command -v npx`. If either is missing, stop and report it.
- Network access: `npx` downloads the package from npm, the score comes from the
  react-doctor score API, and the supply-chain scan queries Socket.dev. When the
  user wants nothing sent off the machine, add `--no-score --no-supply-chain`;
  the run then reports diagnostics without a score.
- The first run in a session downloads and executes a third-party package. Ask
  the user before it, naming the pinned version below.

## Run

Run from the package whose `package.json` lists `react` in `dependencies` or
`peerDependencies`. In a monorepo, run inside that package; at the workspace
root the tool prompts for a project.

```bash
npx -y react-doctor@0.9.17 --verbose --scope changed
```

- `-y` before the package name lets `npx` install it without a prompt.
- `@0.9.17` pins the version so scores compare across runs. To upgrade, check
  `npm view react-doctor version` and change the pin deliberately.
- `--verbose` lists every rule and file; the default shows only the top 3 rules.
- `--scope changed` reports only new findings in files changed against the base
  ref, which the tool auto-detects (set it with `--base <ref>`). For a
  whole-package health check, use `--scope full`. It replaces the deprecated
  `--diff` flag.

If a flag is rejected, run `npx -y react-doctor@0.9.17 --help` and adjust the
command. Never fall back to `@latest`.

## Fix loop

1. Baseline: run once and record the score and the error and warning counts.
2. Fix error diagnostics in this order: security, correctness (state, effects,
   hooks), performance, then architecture and maintainability. Fix warnings only
   in code the current task changed.
3. Re-run the same command.
4. Repeat steps 2 and 3 until the run reports no errors and the score is at
   least the baseline. Stop after three fix rounds that leave errors, or when a
   fix would change behavior outside the task, and report what remains.

## Report

Use this shape; fill every line:

```text
react-doctor 0.9.17, scope: <changed|full>
Score: <baseline> -> <final> (or "not computed: --no-score")
Fixed: <severity> <rule> <file>:<line>, one per line, or "none"
Remaining: <severity> <rule> <file>:<line> <reason not fixed>, one per line, or "none"
```
