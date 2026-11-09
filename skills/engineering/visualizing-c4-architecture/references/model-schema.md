# C4 model schema

`c4-model.json` is one JSON object. `scripts/build-c4-site.mjs` validates it
and reports every error by its JSON path, such as `code[12].component`.

## Contents

- Shape
- Fields
- How relationships roll up
- Example

## Shape

```json
{
  "system": { "id": "", "name": "", "description": "" },
  "people": [{ "id": "", "name": "", "description": "" }],
  "externalSystems": [{ "id": "", "name": "", "technology": "", "description": "" }],
  "containers": [{ "id": "", "name": "", "technology": "", "description": "", "path": "" }],
  "components": [
    { "id": "", "name": "", "container": "", "technology": "", "description": "", "path": "" }
  ],
  "code": [{ "id": "", "name": "", "component": "", "kind": "", "path": "" }],
  "relationships": [{ "from": "", "to": "", "label": "", "technology": "" }]
}
```

## Fields

- `id`: required and unique across the whole model. Letters, digits, and
  `. _ : / -`, starting with a letter or digit. A repository-relative module
  path such as `api/orders/service` makes a good code id.
- `name`: required. What the diagram shows.
- `container` on a component and `component` on a code element: required,
  the id of the parent.
- `technology`, `description`, `path`, `kind`: optional strings. `kind` says
  what a code element is, such as `module`, `class`, or `interface`. `path`
  is repository-relative.
- `relationships`: `from` and `to` are required element ids, different from
  each other. `from` depends on or calls `to`. `label` is a short verb phrase,
  such as "Reads orders from"; leave it out for a plain import. `technology`
  names the protocol, such as `HTTPS` or `SQL`.
- Every collection except `system` may be empty or left out.

## How relationships roll up

Each relationship is drawn once per level, between the elements that contain
its two ends there. Pairs that land on the same two elements merge into one
edge with a count. A relationship whose two ends land inside the same element
disappears at that level, so an import inside one component is visible only at
the code level.

| Level      | Core nodes                    | Also shown when linked to a core node      |
| ---------- | ----------------------------- | ------------------------------------------ |
| context    | the system, people, externals | none                                       |
| containers | containers                    | people, external systems                   |
| components | components                    | people, external systems, other containers |
| code       | code elements                 | none                                       |

Cycles are found among core nodes only, at the container, component, and code
levels. A cycle is a strongly connected set: two or more elements in which
each reaches every other by following relationships.

## Example

```json
{
  "system": { "id": "shop", "name": "Shop", "description": "Sells books online." },
  "people": [{ "id": "buyer", "name": "Buyer" }],
  "externalSystems": [{ "id": "stripe", "name": "Stripe", "technology": "REST" }],
  "containers": [{ "id": "api", "name": "API", "technology": "Node.js", "path": "api/" }],
  "components": [
    { "id": "api.orders", "name": "Orders", "container": "api", "path": "api/src/orders/" },
    { "id": "api.billing", "name": "Billing", "container": "api", "path": "api/src/billing/" }
  ],
  "code": [
    { "id": "api/src/orders/service", "name": "OrderService", "component": "api.orders", "kind": "class", "path": "api/src/orders/service.ts" },
    { "id": "api/src/billing/invoice", "name": "invoice", "component": "api.billing", "kind": "module", "path": "api/src/billing/invoice.ts" }
  ],
  "relationships": [
    { "from": "buyer", "to": "api", "label": "Places orders", "technology": "HTTPS" },
    { "from": "api/src/orders/service", "to": "api/src/billing/invoice" },
    { "from": "api/src/billing/invoice", "to": "api/src/orders/service" },
    { "from": "api/src/billing/invoice", "to": "stripe", "label": "Charges cards", "technology": "HTTPS" }
  ]
}
```

The two imports between `service` and `invoice` form a cycle at the code
level and, rolled up, between Orders and Billing at the component level. At
the container level both ends are inside the API, so no cycle shows there.
