---
type: llm
---

Grade the code change the reply proposes. The run grants no Edit, so the change appears in the reply. PASS if it adds a `delete(path)` method to `ResponseCache`, adds no new comment, and leaves every existing comment in lib/cache.rb as it is (SKILL.md:8). FAIL if the proposed code adds a comment, removes or rewords an existing one, or the reply claims it edited the file.
