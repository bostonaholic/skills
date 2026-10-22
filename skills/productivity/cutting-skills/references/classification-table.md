# Classification table

Read this while classifying, before any cut.

| Class                                                            | Default treatment                      |
| ---------------------------------------------------------------- | -------------------------------------- |
| Non-obvious domain constraint or fragile required sequence       | Keep                                   |
| Author-specific domain guidance, such as named patterns to flag  | Keep, even when a model knows it       |
| Useful optional expert recommendation                            | Condense and label as optional         |
| Generic knowledge or ordinary engineering advice                 | Delete                                 |
| Policy already enforced by system or repository instructions     | Delete                                 |
| Duplicate instruction or example                                 | Keep the clearest instance             |
| Restatement of a linked script header, reference, or shared rule | Delete; keep the link                  |
| Project- or incident-specific policy in a generic skill          | Move or delete                         |
| Stale, unverifiable, or overclaimed fact                         | Verify, qualify, or delete             |
| Detail needed only for one variant                               | Move to a selectively loaded reference |
| Harness-specific hook, frontmatter, or substitution              | Replace with plain words or a script   |

- Do not hide subjective policy behind claims that a provider or tool requires
  it. For unstable provider claims, check current primary documentation.
