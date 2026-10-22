# Filing issues

Each Backlog item becomes an issue on **whatever tracker this repository already
names**: never a tracker this skill picked, and never a local file a tool
outside the plugin would have to read.

## Resolve the tracker, in this order

1. **The repository's own router.** `AGENTS.md`, `CLAUDE.md`, or the
   instructions this session loaded name the tracker and the board, and that
   answer wins. Where the router states field rules, obey them; where it states
   none, the issue carries title and body only.
2. **An authenticated `gh` with issues enabled**, when the router named no
   tracker: `gh auth status` succeeds and
   `gh repo view --json hasIssuesEnabled -q .hasIssuesEnabled` prints `true`.
3. **Print-only**, when neither resolved. Print the items verbatim and mark
   them unfiled in the report.

When the tracker is a GitHub repository, save its `owner/name` before asking:
the router's named repository written with the file-writing tool, or
`gh repo view --json nameWithOwner -q .nameWithOwner > "<run cache>/repo.txt"`.

## One question per issue

Creation is public and irreversible, so ask **one question per issue**, not one
for the class. Each question presents the repository (`owner/name`) and the
exact title and body it would create. Approving one issue never creates
another, and approving the file-write class never creates any.

Each body paraphrases: it carries the learning, the file path, turn index, or
source URL behind it, and the layer the check would live at. It never quotes a
source line into a public tracker.

## File an approved issue

Run `bash "<skill-dir>/scripts/file-issue.sh" "<run cache>" <n>`. On exit 0,
record the URL from its `url:` line for the report. Exit 1, 2, or 3 leaves the
item unfiled, with its stderr as the reason. Any other `gh issue` call
carries `--repo` explicitly.

## When filing fails

An unauthenticated tracker, a repository with issues disabled, a refused
repository check, or a failed `gh issue create` does not stop the run: print the
remaining item bodies verbatim so nothing is lost, and mark them **unfiled** in
the report with the reason.
