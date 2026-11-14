---
name: writing-commit-messages
description: Writes a git commit message for staged changes with a 50/72 subject and body, a Conventional Commits type, footers, and issue citations, keeping any subject, type, or body line the caller fixes byte for byte. Use when the user says "write a commit message", or when the user explicitly asks for a commit message. Never infer from staged changes or a request to commit.
effort: low
---

# Writing commit messages

- Read the staged diff (`git diff --cached`) and the recent subjects
  (`git log --oneline -10`) before you write.
- A caller can fix the subject, the type, or a body line, such as a plan
  citation. Use each fixed part byte for byte, even when it breaks a rule
  below, and apply the rules only to the parts you write.
- Write the message per [commit messages](references/messages.md), and the
  prose per the [writing standards](shared/writing.md).
- When asked to commit, write the message to a file with the file-writing
  tool, then run `git commit -F <message-file>`, never a bare `git commit`.
  Never run `git add -p` or `git add -i`: they open a prompt.
- Report the full message.
