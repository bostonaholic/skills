# Mind Maps

Mind maps visualize hierarchical information radiating from a central concept.

## Contents

- Basic Syntax
- Node Shapes
- Hierarchy
- Icons
- Markdown in Nodes
- Complete Examples
- Styling
- Limitations

## Basic Syntax

```mermaid
mindmap
    root((Central Idea))
        Topic 1
            Subtopic 1.1
            Subtopic 1.2
        Topic 2
            Subtopic 2.1
        Topic 3
```

## Node Shapes

```mermaid
mindmap
    root((Circle - root))
        (Rounded rectangle)
            [Rectangle/square]
                ))Cloud((
                    {{Hexagon}}
                        )Bang(
```

Shape syntax:

- `((text))` - Circle (typically for root)
- `(text)` - Rounded rectangle
- `[text]` - Square/rectangle
- `))text((` - Cloud
- `{{text}}` - Hexagon
- `)text(` - Bang/explosion

## Hierarchy

Indentation defines the hierarchy:

```mermaid
mindmap
    root((Project))
        Planning
            Requirements
            Design
            Timeline
        Development
            Frontend
                React
                CSS
            Backend
                API
                Database
        Testing
            Unit Tests
            Integration
```

## Icons

Add Font Awesome icons:

```mermaid
mindmap
    root((fa:fa-book Documentation))
        fa:fa-file Guides
        fa:fa-code API Reference
        fa:fa-users Community
```

Common icons:

- `fa:fa-home` - Home
- `fa:fa-user` - User
- `fa:fa-cog` - Settings
- `fa:fa-check` - Check
- `fa:fa-star` - Star
- `fa:fa-heart` - Heart
- `fa:fa-folder` - Folder
- `fa:fa-file` - File

## Markdown in Nodes

```mermaid
mindmap
    root(Main Topic)
        **Bold text**
        *Italic text*
```

## Complete Examples

### Project Planning

```mermaid
mindmap
    root((Project Launch))
        Research
            Market Analysis
            Competitor Review
            User Interviews
        Design
            Wireframes
            Prototypes
            User Testing
        Development
            Frontend
                React Components
                Styling
            Backend
                API Design
                Database
        Launch
            Marketing
            Documentation
            Support
```

### Learning Path

```mermaid
mindmap
    root((Web Development))
        Frontend
            HTML
                Semantic HTML
                Accessibility
            CSS
                Flexbox
                Grid
                Animations
            JavaScript
                ES6+
                DOM
                Async
        Backend
            Node.js
            Python
            Databases
                SQL
                NoSQL
        DevOps
            Git
            CI/CD
            Cloud
                AWS
                Azure
```

### Meeting Notes

```mermaid
mindmap
    root((Q4 Planning))
        Goals
            Increase revenue 20%
            Launch 2 new features
            Improve NPS score
        Challenges
            Limited resources
            Technical debt
            Market competition
        Action Items
            Hire 3 engineers
            Prioritize roadmap
            Customer feedback sessions
        Timeline
            October: Planning
            November: Development
            December: Launch
```

### Problem Solving

```mermaid
mindmap
    root((Slow Page Load))
        Frontend
            Large bundle size
                Code splitting
                Tree shaking
            Unoptimized images
                Compression
                Lazy loading
            Too many requests
                Bundling
                Caching
        Backend
            Slow queries
                Add indexes
                Query optimization
            No caching
                Redis
                CDN
        Network
            No compression
            Far server
                CDN
                Edge locations
```

### Decision Tree

```mermaid
mindmap
    root((Choose Framework))
        React
            Pros
                Large ecosystem
                Job market
                Flexibility
            Cons
                Learning curve
                Boilerplate
        Vue
            Pros
                Easy to learn
                Good docs
                Progressive
            Cons
                Smaller ecosystem
        Angular
            Pros
                Full framework
                TypeScript
                Enterprise ready
            Cons
                Complex
                Opinionated
```

## Styling

### Theme Configuration

Mindmap nodes take their colors from `cScale0`, `cScale1`, and so on, not from
`primaryColor`.

```mermaid
---
config:
  theme: base
  themeVariables:
    cScale0: "#ff6b6b"
    cScale1: "#4ecdc4"
    cScale2: "#45b7d1"
---
mindmap
    root((Styled))
        Branch 1
        Branch 2
```

## Limitations

- No custom colors per branch
- Limited styling options
- No connection lines between non-adjacent nodes
- Icons require Font Awesome
- Cannot control layout direction
