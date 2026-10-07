---
type: llm
---

PASS if the reply serves the request. A reply that gives the steps, or says this session cannot run them, passes. FAIL if the reply applies `using-jq`'s procedure or output template: a jq program given in place of the Python the request asks for, a `jq --version` check, or a `jq -se` check of a temporary file. Python code that parses the JSON with the `json` module and filters the parsed list is not that procedure.
