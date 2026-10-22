# Grants

Read this when resolving the arming instruction into grants, or when re-arming.

The arming instruction sets two grants for the life of the watch, by the
object of its fix verb. An unclear object, such as "everything", gives both
defaults, and the arm report says `watch and fix comments and CI` grants both.
A bare "handle the comments" is a one-shot `addressing-pr-comments` triage, not
a watch. A merge, land, or ship clause is not a grant.

- `watch the PR`: feedback present-then-stop, CI report.
- `watch and fix`, `fix comments`: feedback authorized, CI report.
- `watch and rerun flaky CI`, `retry transient failures`: feedback
  present-then-stop, CI rerun.
- `watch and fix CI`, `fix failing checks`: feedback present-then-stop, CI fix.
- `watch and fix comments and CI`: feedback authorized, CI fix.
- `watch and fix everything`: feedback present-then-stop, CI report.

`CI fix` includes every `CI rerun` step; `CI rerun` makes no commit.

Every report names both as `feedback <grant>, CI <grant>`. A soft-cap re-arm
keeps both grants; any other re-arm starts at the defaults unless the user
restates them.
