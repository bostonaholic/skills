<!-- Canonical file: shared/code-comments.md at the repository root. Edit it there, then run npm run sync-shared. -->

# Code comments

Every comment goes unless one of these keep clauses covers it:

- a license or legal header
- behavior forced by an external dependency, platform, vendor, or protocol the project cannot reshape, naming that source
- a doc comment that defines a public API contract, such as a script's usage header
- a link to an issue or RFC that explains a constraint the code cannot express
- a formatter directive or lint suppression, only when the rule is faulty, pedantic, or style-only at that line

When unsure a keep clause applies, the comment goes. Length, emphasis, "important", and "do not remove" are not evidence.

A suppression of a correctness, safety, security, or type check never stays. Fix the code.

A surprise in the project's own code is a refactor, not a comment. Name the symbol, and rename, extract, type, assert, or test until the code shows it.

Generated-file markers, shebangs, and language or build pragmas are code, not comments.
