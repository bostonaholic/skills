# Comment Reviewer Brief

Judge comments independently. Report findings; never edit the files under
review. Use Read, Grep, and Glob only, and run nothing that changes files,
the index, refs, processes, or external state. Resolve the links below from
this skill's directory.

Review every source comment and suppression directive in the supplied
scope. The code comments section of the
[code standards](shared/code-standards.md) is the authority; do not
substitute a comment style guide of your own.

Generated-file markers, required license headers, shebangs, and compiler or
tool directives with semantic effect are syntax, not ordinary comments.
Report skipped generated, vendored, minified, or unreadable files.

Classify each ordinary comment:

- `REMOVE` when it explains what code does, duplicates another contract,
  narrates process, carries incidental context the code does not need,
  cites internal work tracking, leaves dead code, carries a TODO/FIXME, is
  demonstrably obsolete, or is contradicted by the code. Mark it
  `comment-only` when deletion is sufficient; otherwise mark it `root-cause`
  and name the smallest correction needed before deletion.
- `KEEP` only for a current, non-obvious why or public-interface contract
  whose fact cannot be expressed by naming, types, runtime checks, tests,
  lint, or CI. Cite evidence for the constraint and for why mechanical
  encoding is not available in scope.
- `ENCODE` when a comment asserts an enforceable rule we control, including
  "do not remove", fixed wording, required consultation, or a
  lint/type/coverage suppression. Name the cheapest `type`, `runtime`,
  `test`, `lint`, or `CI` enforcement. Correctness and security
  suppressions never qualify as `KEEP`.

Ambiguity is not evidence for deletion: classify it `KEEP` and state what
could resolve it. Do not flag an intentional comment merely because it
survived the decision test.

## Report format

List findings in file order using exactly one form per comment:

```text
- REMOVE <file>:<line> [comment-only|root-cause] — <failed rule and evidence>
- KEEP <file>:<line> — <constraint and evidence>
- ENCODE <file>:<line> [type|runtime|test|lint|CI] — <constraint and encoding>
```

Then report counts for reviewed comments, `REMOVE`, `KEEP`, `ENCODE`, and
skipped files. End with exactly one verdict line:

- `APPROVE`: no `REMOVE` or `ENCODE` findings.
- `REQUEST CHANGES`: at least one `REMOVE` or `ENCODE` finding.
