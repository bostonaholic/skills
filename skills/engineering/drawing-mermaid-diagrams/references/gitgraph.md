# Git Graph Diagrams

Git graphs visualize Git repository history showing branches, commits,
merges, and tags.

## Contents

- Basic Syntax
- Orientation
- Commits
- Branches
- Checkout/Switch
- Merge
- Cherry-pick
- Configuration
- Complete Examples
- Styling

## Basic Syntax

```mermaid
gitGraph
    commit
    commit
    branch develop
    checkout develop
    commit
    commit
    checkout main
    merge develop
    commit
```

## Orientation

```mermaid
gitGraph TB:
    commit
    commit
    branch develop
    commit
```

Options:

- `LR:` - Left to right (default)
- `TB:` - Top to bottom
- `BT:` - Bottom to top

## Commits

### Basic Commit

```mermaid
gitGraph
    commit
    commit
    commit
```

### Commit with ID

```mermaid
gitGraph
    commit id: "initial"
    commit id: "add-feature"
    commit id: "fix-bug"
```

### Commit with Tag

```mermaid
gitGraph
    commit
    commit tag: "v1.0.0"
    commit
    commit tag: "v1.1.0"
```

### Commit Types

```mermaid
gitGraph
    commit
    commit type: HIGHLIGHT
    commit type: REVERSE
    commit type: NORMAL
```

Types:

- `NORMAL` - Solid circle (default)
- `REVERSE` - Crossed solid circle
- `HIGHLIGHT` - Filled rectangle

### Full Commit Syntax

```mermaid
gitGraph
    commit id: "feat-123" type: HIGHLIGHT tag: "v2.0"
```

## Branches

### Creating Branches

```mermaid
gitGraph
    commit
    branch develop
    commit
    branch feature
    commit
```

### Branch with Special Characters

```mermaid
gitGraph
    commit
    branch "feature/auth"
    commit
    branch "bugfix/login-error"
    commit
```

### Branch Order

```mermaid
gitGraph
    commit
    branch develop order: 1
    commit
    branch feature order: 2
    commit
    checkout main
    commit
```

Lower order numbers appear closer to main.

## Checkout/Switch

```mermaid
gitGraph
    commit
    branch develop
    checkout develop
    commit
    checkout main
    commit
```

`switch` and `checkout` are interchangeable.

## Merge

### Basic Merge

```mermaid
gitGraph
    commit
    branch develop
    commit
    commit
    checkout main
    merge develop
```

### Merge with Options

```mermaid
gitGraph
    commit
    branch develop
    commit
    checkout main
    merge develop id: "merge-1" tag: "release" type: REVERSE
```

## Cherry-pick

```mermaid
gitGraph
    commit id: "init"
    branch develop
    commit id: "feat-1"
    commit id: "feat-2"
    checkout main
    cherry-pick id: "feat-1"
```

### Cherry-pick with Parent

```mermaid
gitGraph
    commit id: "init"
    branch develop
    commit id: "feat-1"
    checkout main
    branch release
    checkout main
    merge develop id: "merge"
    checkout release
    cherry-pick id: "merge" parent: "init"
```

## Configuration

### Via Frontmatter

```mermaid
---
config:
  gitGraph:
    showBranches: true
    showCommitLabel: true
    mainBranchName: master
    mainBranchOrder: 0
    parallelCommits: false
---
gitGraph
    commit
    branch develop
    commit
```

### Via Init Directive

```mermaid
---
config:
  gitGraph:
    showBranches: true
    showCommitLabel: true
---
gitGraph
    commit
    commit
```

### Configuration Options

| Option              | Default | Description               |
| ------------------- | ------- | ------------------------- |
| `showBranches`      | true    | Show branch labels        |
| `showCommitLabel`   | true    | Show commit IDs           |
| `mainBranchName`    | "main"  | Name of main branch       |
| `mainBranchOrder`   | 0       | Position of main branch   |
| `parallelCommits`   | false   | Align commits on same row |
| `rotateCommitLabel` | true    | Rotate commit labels      |

## Complete Examples

### Feature Branch Workflow

```mermaid
gitGraph
    commit id: "init"
    branch develop
    checkout develop
    commit id: "dev-setup"

    branch feature/auth
    checkout feature/auth
    commit id: "auth-1"
    commit id: "auth-2"

    checkout develop
    merge feature/auth tag: "auth-complete"

    branch feature/api
    checkout feature/api
    commit id: "api-1"
    commit id: "api-2"

    checkout develop
    merge feature/api

    checkout main
    merge develop tag: "v1.0.0"
```

### Hotfix Workflow

```mermaid
gitGraph
    commit id: "v1.0" tag: "v1.0.0"
    branch develop
    commit id: "feat-1"

    checkout main
    branch hotfix
    commit id: "fix-1" type: HIGHLIGHT

    checkout main
    merge hotfix tag: "v1.0.1"

    checkout develop
    merge hotfix
    commit id: "feat-2"

    checkout main
    merge develop tag: "v1.1.0"
```

### Release Branch Workflow

```mermaid
gitGraph
    commit id: "init"
    branch develop
    commit id: "feat-1"
    commit id: "feat-2"

    branch release/1.0
    checkout release/1.0
    commit id: "bump-version"
    commit id: "final-fixes"

    checkout main
    merge release/1.0 tag: "v1.0.0" type: HIGHLIGHT

    checkout develop
    merge release/1.0
    commit id: "feat-3"
```

### Parallel Development

```mermaid
---
config:
  gitGraph:
    parallelCommits: true
---
gitGraph
    commit
    branch team-a order: 1
    branch team-b order: 2

    checkout team-a
    commit id: "a-1"
    checkout team-b
    commit id: "b-1"

    checkout team-a
    commit id: "a-2"
    checkout team-b
    commit id: "b-2"

    checkout main
    merge team-a
    merge team-b tag: "merged"
```

## Styling

### Theme Variables

```mermaid
---
config:
  theme: base
  themeVariables:
    git0: "#ff6b6b"
    git1: "#4ecdc4"
    git2: "#45b7d1"
    git3: "#96ceb4"
    gitBranchLabel0: "#ffffff"
    gitBranchLabel1: "#ffffff"
    commitLabelColor: "#ffffff"
    commitLabelBackground: "#333333"
---
gitGraph
    commit
    branch develop
    commit
    branch feature
    commit
```

Available variables:

- `git0` through `git7` - Branch colors
- `gitBranchLabel0` through `gitBranchLabel7` - Branch label colors
- `commitLabelColor` - Commit label text color
- `commitLabelBackground` - Commit label background
- `tagLabelColor` - Tag text color
- `tagLabelBackground` - Tag background
- `tagLabelBorder` - Tag border color
