---
type: llm
---

PASS if the reply serves the request, also when `reviewing-code` handles it. A reply that gives the steps, or says this session cannot run them, passes. FAIL if the reply applies `auditing-repo-security`'s procedure or output template: a `# Security audit:` heading, an A-F letter grade with a score out of 100, a `**Safe to run?**` verdict, a phase table naming Pre-run and auto-run, Dependencies, Install scripts, and Pattern scan, findings headed with a point deduction such as `(-10)`, or a `Not run: stopped after a critical finding.` line. Reviewing the diff for vulnerabilities, such as the shell command built from `req.query.name` in src/routes/export.js, and suggesting fixes is not that procedure.
