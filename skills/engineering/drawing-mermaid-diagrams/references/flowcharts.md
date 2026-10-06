# Flowcharts

Flowcharts are composed of nodes (geometric shapes) and edges (arrows or lines).

## Contents

- Basic Syntax
- Graph Direction
- Node Shapes
- Links/Edges
- Subgraphs
- Special Characters
- Comments
- Styling
- Click Events
- Multiple Nodes Declaration
- Icon Support

## Basic Syntax

```mermaid
flowchart TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
    C --> E[End]
    D --> E
```

## Graph Direction

- `TB` or `TD` - Top to bottom (default)
- `BT` - Bottom to top
- `LR` - Left to right
- `RL` - Right to left

```mermaid
flowchart LR
    A --> B --> C
```

## Node Shapes

```mermaid
flowchart TD
    A[Rectangle]
    B(Rounded rectangle)
    C([Stadium/pill])
    D[[Subroutine]]
    E[(Database/cylinder)]
    F((Circle))
    G>Asymmetric/flag]
    H{Diamond/rhombus}
    I{{Hexagon}}
    J[/Parallelogram/]
    K[\Parallelogram alt\]
    L[/Trapezoid\]
    M[\Trapezoid alt/]
    N(((Double circle)))
```

## Links/Edges

### Arrow Types

```mermaid
flowchart LR
    %% Arrow
    A --> B
    %% Open link (no arrow)
    C --- D
    %% Dotted link
    E -.- F
    %% Dotted arrow
    G -.-> H
    %% Thick arrow
    I ==> J
    %% Invisible link
    K ~~~ L
    %% Multi-directional
    M <--> N
    %% Circle endpoints
    O o--o P
    %% Cross endpoints
    Q x--x R
```

### Link Text

```mermaid
flowchart LR
    A -->|text| B
    C -- text --> D
    E -.->|dotted text| F
    G ==>|thick text| H
```

### Link Length

Add extra dashes/dots to make links longer:

```mermaid
flowchart TD
    A ---> B
    C ----> D
    E -.....-> F
```

## Subgraphs

```mermaid
flowchart TB
    subgraph one [Title One]
        A1 --> A2
    end
    subgraph two [Title Two]
        B1 --> B2
    end
    subgraph three [Title Three]
        C1 --> C2
    end
    one --> two
    three --> two
    two --> C2
```

### Subgraph Direction

```mermaid
flowchart LR
    subgraph TOP
        direction TB
        A --> B
    end
    subgraph BOTTOM
        direction LR
        C --> D
    end
    TOP --> BOTTOM
```

## Special Characters

Use quotes for special characters in node text:

```mermaid
flowchart LR
    A["Text with (parentheses)"]
    B["Text with 'quotes'"]
    C["Text with #quot;double#quot;"]
```

### Entity Codes

- `#quot;` - Double quote
- `#39;` - Single quote
- `#lt;` - Less than
- `#gt;` - Greater than
- `#amp;` - Ampersand

## Comments

```mermaid
flowchart LR
    %% This is a comment
    A --> B
```

A `%%` comment must sit on its own line. A trailing comment after a statement
(`A --> B %% note`) is a parse error.

## Styling

### Inline Styling

```mermaid
flowchart LR
    A:::someclass --> B
    classDef someclass fill:#f9f,stroke:#333,stroke-width:2px
```

### Style Definitions

```mermaid
flowchart LR
    A --> B --> C

    classDef default fill:#fff,stroke:#333
    classDef highlight fill:#ff0,stroke:#f00,stroke-width:4px
    classDef special color:#fff,fill:#333

    class A highlight
    class B,C special
```

### Link Styling

```mermaid
flowchart LR
    A --> B --> C
    linkStyle 0 stroke:#ff0,stroke-width:4px
    linkStyle 1 stroke:#0ff,stroke-width:2px,stroke-dasharray:5 5
```

## Click Events

```mermaid
flowchart LR
    A --> B
    click A "https://example.com" "Tooltip text"
    click B callback "Tooltip for B"
    click A call callback() "Call function"
```

## Multiple Nodes Declaration

```mermaid
flowchart LR
    A & B --> C & D
```

Equivalent to:

```mermaid
flowchart LR
    A --> C
    A --> D
    B --> C
    B --> D
```

## Icon Support

```mermaid
flowchart TD
    A@{ icon: "fa:home", form: "square", label: "Home", pos: "t", h: 60 }
    B@{ icon: "fa:user" }
    A --> B
```

Icon options:

- `icon` - FontAwesome icon (fa:iconname)
- `form` - Shape: square, circle, rounded
- `label` - Text label
- `pos` - Label position: t, b, l, r
- `h` - Height in pixels
