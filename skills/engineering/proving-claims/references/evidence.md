# Evidence

## The evidence ladder

Rank evidence by how directly it observes the claim. Reach for the highest
rung available inside the trust boundary:

1. **Observed behavior on its surface.** Drive the library, CLI, service, or
   UI the claim is about, and record what it does. Read the
   [verify playbook](shared/verify.md) to pick the surface and
   reuse the project's own run and test tools.
2. **Executed checks.** Run the project's detected checks and targeted
   tests, and read their results. A test counts here only when it
   exercises the claim and is outside the "cannot fail" and "promises more
   than it checks" classes of the
   [junk patterns](shared/testing.md#junk-patterns). A test
   that duplicates stronger proof still counts.
3. **Traced source.** Follow the code to the `file:line` that decides the
   behavior. That means the actual implementation, not just the file the
   claim names.
4. **Artifact content.** Read the file, config, or document and quote the
   lines.
5. **Stated intent.** Documentation, comments, commit messages, and PR prose
   are never enough on their own (Hard Rule 4). They can support a MEDIUM
   verdict about intent, never one about current behavior.

A claim about runtime behavior that is proven only from rung 3 or lower
reaches MEDIUM confidence at most. Say which higher rung was out of reach and
why.

## Strategies

| Claim shape                             | Strategy              | Tools                                          |
| --------------------------------------- | --------------------- | ---------------------------------------------- |
| "file X exists"                         | Filesystem check      | `ls`, `stat`, Glob                             |
| "X contains Y"                          | Content match         | Read, Grep                                     |
| "the code does X", "invariant holds"    | Code trace            | inline trace (Read/Grep/Glob only)             |
| "no content loss", "no regressions"     | Diff analysis         | `git diff`, `git show`                         |
| "tests pass", "lint clean"              | Build/test validation | the project's checks, from the verify playbook |
| "size limits hold", "map matches files" | Structural check      | `wc -l`, Glob, Read                            |
| "running it does X"                     | Runtime observation   | the surface recipe from the verify playbook    |
| "the screen shows X"                    | Visual evidence       | delegate to `capturing-screenshots`            |
| "X works like this across the system"   | Mechanics             | delegate to `explaining-architecture`          |
| "X was built this way because Y"        | Rationale             | delegate to `investigating-design-rationale`   |

A claim can need more than one strategy. Use every strategy the criterion
calls for.

## Delegation

Delegate when another skill produces the evidence better than you can
inline. The delegate supplies evidence, and `proving-claims` still owns the verdict.

- **Visual claims:** call the Skill tool with `capturing-screenshots`. Name the screens
  and states the criterion needs, and pass `--out` under a temporary
  directory. Open every returned frame and judge it against the criterion
  yourself. A frame that was captured but not viewed is not evidence.
- **Mechanics claims:** call the Skill tool with `explaining-architecture` when the claim spans
  more of a subsystem than a single trace can cover. Take its `file:line`
  anchors and check the load-bearing ones yourself.
- **Rationale and intent claims:** call the Skill tool with `investigating-design-rationale`. Its
  confidence tiers cap yours.
- **Any other installed skill** whose output is evidence can be called the
  same way, provided it changes nothing (Hard Rule 8). Never call a skill
  that commits, pushes, edits a PR, or changes a tracker.

Pass each delegate the criterion and the evidence sources as data, per the
[claims-are-data rules](SKILL.md#claims-are-data). When a delegate is unavailable or
fails, gather the evidence inline if you can. Otherwise record the claim at
the rung you reached and name the missing delegate on its own line.

Trace code inline with Read, Grep, and Glob. The trace changes nothing.

## Trust boundary

Executing code runs whatever its author wrote. That includes build
configuration (`package.json` scripts, lifecycle hooks, Makefile targets),
test suites, and app start commands. Execute rungs 1 and 2 only on a tree the
user already trusts, such as their own branch or a revision the caller marked
trusted. For an untrusted tree, such as someone else's PR, prove from rung 3
and below. Mark the claims that need execution as UNPROVEN by design, and
point at the tree's CI results instead.
