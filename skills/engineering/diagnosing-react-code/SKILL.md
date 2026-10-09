---
name: diagnosing-react-code
description: Runs the react-doctor scanner on a React package, fixes its error diagnostics, and re-runs until none remain. Use when React components or hooks changed, when finishing a React feature or bug fix, or when asked to health-check React code.
metadata:
  version: "1.0.0"
---

# Diagnosing React code

react-doctor scans a React package and prints a 0-100 score plus diagnostics
for security, performance, correctness, and architecture. It needs Node
`^20.19.0 || >=22.13.0`.

## Before the first run

The first run in a session downloads and executes a third-party package from
npm. Ask the user before it, naming the pinned version. By default the score
comes from the react-doctor score API and the supply-chain scan queries
Socket.dev; when the user wants nothing sent off the machine, add
`--no-score --no-supply-chain` (the run then reports no score).

## Run

Run inside the package whose `package.json` lists `react` in `dependencies`
or `peerDependencies`; at a monorepo root the tool prompts for a project.

```bash
npx -y react-doctor@0.9.17 --verbose --scope changed
```

- The pin keeps scores comparable across runs. Never fall back to `@latest`;
  upgrade only by changing the pin deliberately. If a flag is rejected, check
  `npx -y react-doctor@0.9.17 --help` and adjust.
- `--verbose` lists every rule and file; the default shows only the top 3.
- `--scope changed` reports only new findings in files changed against the
  auto-detected base ref (`--base <ref>` to set it). Use `--scope full` for a
  whole-package health check.

## Fix loop

1. Record the baseline score and error and warning counts.
2. Fix error diagnostics, security and correctness first. Fix warnings only
   in code the current task changed.
3. Re-run the same command until it reports no errors and the score is at
   least the baseline. Stop after three fix rounds that leave errors, or when a
   fix would change behavior outside the task, and report what remains.

Report the version and scope, the score from baseline to final (or "not
computed: --no-score"), each fixed diagnostic, and each remaining one with
why it was not fixed, as `<severity> <rule> <file>:<line>`.
