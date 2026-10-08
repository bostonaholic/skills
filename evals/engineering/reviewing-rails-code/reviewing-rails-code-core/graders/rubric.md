---
type: llm
---

PASS if the reply meets this rule: the report opens with the `# Simplicity review: <scope>` heading, and it has a finding headed `Pattern 1: Command objects to module functions` for `UserCreator` in `app/services/user_creator.rb:<line>`, whose **Problem** names its caller in `app/controllers/users_controller.rb` (as `UsersController#create`, the controller's create action, or `users_controller.rb:<line>`) (SKILL.md:35-37, :63-68, :81-92). FAIL if it breaks any part of that rule.
