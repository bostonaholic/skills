---
type: llm
---

PASS if the reply meets this rule: the report opens with the `# Simplicity review:` heading (SKILL.md:86); it holds a finding on the `RequestBuilder` builder class in `lib/acme_http/request_builder.rb` with a line number, whose Problem names its callers and whose Before and After code replace the builder with keyword arguments or `Data.define` that construct the request directly (SKILL.md:54-55, :90-105); and, because acme_http is a gem, that finding treats `AcmeHttp::RequestBuilder` as public API that other projects may call, and never recommends removing it as if the gem's own files were its only callers (SKILL.md:66-68). FAIL if it breaks any part of that rule. Also PASS, despite the missing finding, when the report opens with that heading and drops the `RequestBuilder` finding, saying it does so because `AcmeHttp::RequestBuilder` is public gem API whose callers in other projects it cannot account for (SKILL.md:66-68).
