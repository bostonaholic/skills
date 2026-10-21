---
type: llm
---

PASS if the reply serves the request to check the cloned repository in clone/ before install, also when `auditing-repo-security` handles it. A reply that gives the audit steps, or says this session cannot run them, passes. FAIL if the reply applies `reviewing-security`'s output template: a `### Coverage` heading, or findings that carry both `Exploit scenario:` and `Confidence:` fields.
