# Review anti-patterns

Flag each of these present in a prompt under review:

| Anti-pattern                       | Problem                                       | Fix                                 |
| ---------------------------------- | --------------------------------------------- | ----------------------------------- |
| Capability laundry list            | Wastes tokens; the model knows what it can do | Cut                                 |
| "Be helpful and friendly"          | Default behavior                              | Cut                                 |
| Marketing language                 | Changes no behavior                           | Cut                                 |
| Defensive disclaimers              | Undermine confidence                          | Cut                                 |
| Rules about default behavior       | Reinforce what is already true                | Cut                                 |
| Vague personality directives       | Not testable                                  | Concrete caps and rules             |
| Nested conditionals for rare cases | Hard to follow                                | Examples instead                    |
| No examples                        | Leaves length, tone, and tool use to chance   | Add 3-10 examples                   |
| Emphatic keywords on many rules    | Over-applied rules; real priorities blur      | Plain imperatives with reasons      |
| Constraints repeated for emphasis  | Noise that dilutes the other rules            | State each constraint once          |
| Forced reasoning-tag formats       | Fragile across models and hosts               | Name the moments to stop and reason |
