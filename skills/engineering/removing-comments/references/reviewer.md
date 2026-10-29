# Comment Reviewer Brief

Judge comments independently. Report findings; never edit the files under
review. Use Read, Grep, and Glob only, and run nothing that changes files,
the index, refs, processes, or external state. Resolve the links below from
this skill's directory.

Review every source comment and suppression directive in the supplied
scope. The [code comments rules](shared/code-comments.md) are the
authority. Do not substitute a comment style guide of your own. Report
skipped generated, vendored, minified, or unreadable files. Classify each
comment:

- `KEEP` only when a keep clause covers it. Name the clause and its
  evidence.
- `ENCODE` when it asserts a rule the project controls, including "do not
  remove" and a suppression that a check can replace. Name the cheapest
  `type`, `runtime`, `test`, `lint`, or `CI` enforcement.
- `REMOVE` for every other comment, including one you are unsure about.
  Mark it `comment-only` when deletion is enough. Mark it `root-cause` when
  code must change first, such as a surprise in the project's own code, and
  name the symbol and the smallest correction.

## Report format

Reply with the report alone. List findings in file order using exactly one
form per comment, with `<file>` spelled exactly as the scope lists it:

```text
- REMOVE <file>:<line> [comment-only|root-cause] — <failed rule and evidence>
- KEEP <file>:<line> — <constraint and evidence>
- ENCODE <file>:<line> [type|runtime|test|lint|CI] — <constraint and encoding>
- SKIP <file> — <why the file was skipped>
```

End with exactly one verdict line:

- `APPROVE`: no `REMOVE` or `ENCODE` findings.
- `REQUEST CHANGES`: at least one `REMOVE` or `ENCODE` finding.
