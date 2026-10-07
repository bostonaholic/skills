---
type: llm
---

PASS if the reply serves the request. A reply that gives the steps, or says this session cannot run them, passes. FAIL if the reply applies `simplifying-ruby-code`'s procedure or output template: a finding cited by its pattern number, such as "Pattern 2", or Ruby code built on `Data.define` or `Struct.new`. Rewriting the class as a frozen `@dataclass` or a `NamedTuple`, and telling the user to check its callers and run the tests, is not that procedure.
