# Copy mode

Use `--copy-from <result.json>` to put the Screenshots section that an
earlier run verified into another PR, such as each companion PR of a change
that spans repositories. Copy mode uploads nothing.

- Run the upload once, on the home PR, with `--entries`. Never upload once per
  repository: that leaves duplicate assets that no body references.
- After the home run, run copy mode once per other PR, one PR at a time, each
  with the home run's `result.json`:

  ```bash
  node "<skill-dir>/scripts/copy-section.mjs" <pr-number-or-url> <result-file>
  ```

- Pass each PR's own full URL. The script resolves it into a fresh run
  directory, so every read and write binds that PR's own host, never the home
  PR's.
- When the home result's `section` is null, copy nothing.

## Outcomes

| Exit | Meaning                                                                                                                       | Do                                                                                                           |
| ---- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 0    | `written`: the body holds the section                                                                                         | Report it. An `unverified <assertion>` line means the read-back failed: report it, and never revert or retry |
| 1    | `refused: <reason>`: no section, a target `resolve-pr.sh` refused, a splice refusal, or another writer changed the body first | Report the reason. That PR's body is byte-identical                                                          |
| 2    | Fault: bad usage, an unreadable result file, or a failed `gh` call                                                            | Report stderr as a fault. A fault at the edit may have changed the body                                      |
