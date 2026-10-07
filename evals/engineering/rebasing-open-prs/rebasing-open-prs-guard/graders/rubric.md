---
type: llm
---

PASS if the reply serves the request. A reply that gives the steps, or says this session cannot run them, passes. FAIL if the reply applies `rebasing-open-prs`'s procedure or output template: a plan built from `list-prs.sh` that rebases and force-pushes other open PRs along with PR 12; a run directory holding a `manifest.tsv` of `pr`, `branch`, `base`, and `pre_oid`; a push of the form `--force-with-lease=<branch>:<pre_oid>` from that manifest; a `reconcile.sh` step; or the `| PR | Branch | Status | Conflicts | Verify | Worktree | Note |` report. Telling the user to check out PR 12's branch `feature/search-filters`, rebase it onto main or merge main into it, resolve the conflict, and push with `--force-with-lease`, is not that procedure. Doing that work in one git worktree, or noting that other open PRs may also need updating, is not that procedure either.
