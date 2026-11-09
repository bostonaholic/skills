#!/usr/bin/env node
// Validates a C4 model (c4-model.json), rolls its relationships up to each C4 level, finds the
// dependency cycles at the container, component, and code levels, and writes a static site.
// Usage: build-c4-site.mjs <c4-model.json> <out>
//   exit 0  wrote index.html, context.html, containers.html, components.html, code.html,
//           styles.css, app.js, and data.js into <out>; printed the index.html path, then per
//           level the cycle count and one line per cycle: its id, size, and one closed path of ids
//   exit 1  wrote nothing; stderr names an unreadable or non-JSON model, every validation
//           error, or an <out> that is not a directory
//   exit 2  not exactly two arguments; stderr prints the usage line
// Other files in <out> are left alone, so the model can live beside the site it builds.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// The skill file that explains each exit code.
const DOC_PATH = fileURLToPath(new URL("../SKILL.md", import.meta.url));
const SITE_DIR = fileURLToPath(new URL("./site/", import.meta.url));
const USAGE = "usage: build-c4-site.mjs <c4-model.json> <out>";

export const LEVELS = Object.freeze(["context", "containers", "components", "code"]);
const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
// A relationship's labels and technologies are listed on hover; past this many distinct values
// the list stops growing and the count still says how many relationships were merged.
const MAX_LISTED_VALUES = 8;

const PAGES = Object.freeze({
  context: {
    file: "context.html",
    title: "System Context",
    number: 1,
    summary:
      "The software system in its environment: the people who use it and the other systems it depends on.",
  },
  containers: {
    file: "containers.html",
    title: "Containers",
    number: 2,
    summary:
      "The separately deployable or runnable units inside the system, such as apps, services, databases, and queues, and how they talk.",
  },
  components: {
    file: "components.html",
    title: "Components",
    number: 3,
    summary:
      "The major building blocks inside each container and the dependencies between them, including those that cross containers.",
  },
  code: {
    file: "code.html",
    title: "Code",
    number: 4,
    summary:
      "The modules and classes inside each component and the dependencies between them, as found in the source.",
  },
});

const filled = (value) => typeof value === "string" && value.trim() !== "";
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const optionalString = (value) => value === undefined || typeof value === "string";

// Element collections in the model, the type each holds, and the field naming its parent.
const COLLECTIONS = Object.freeze([
  { key: "people", type: "person", parent: null },
  { key: "externalSystems", type: "external", parent: null },
  { key: "containers", type: "container", parent: null },
  { key: "components", type: "component", parent: "container" },
  { key: "code", type: "code", parent: "component" },
]);
const PARENT_TYPE = Object.freeze({ component: "container", code: "component" });

// Returns every validation error in the model, as one sentence each. An empty list means valid.
export function validateModel(model) {
  const errors = [];
  if (!isObject(model)) return ["the model is not a JSON object"];
  const system = model.system;
  if (!isObject(system)) errors.push("system: missing; give it an id and a name");
  else {
    if (!filled(system.id) || !ID.test(system.id)) errors.push("system.id: missing or not an id");
    if (!filled(system.name)) errors.push("system.name: missing");
    if (!optionalString(system.description)) errors.push("system.description: not a string");
  }
  const types = new Map();
  if (isObject(system) && filled(system.id)) types.set(system.id, "system");
  for (const { key, type, parent } of COLLECTIONS) {
    const list = model[key];
    if (list === undefined) continue;
    if (!Array.isArray(list)) {
      errors.push(`${key}: not an array`);
      continue;
    }
    list.forEach((element, index) => {
      const where = `${key}[${index}]`;
      if (!isObject(element)) return errors.push(`${where}: not an object`);
      if (!filled(element.id) || !ID.test(element.id))
        errors.push(`${where}.id: missing or not an id (letters, digits, and . _ : / -)`);
      else if (types.has(element.id)) errors.push(`${where}.id: "${element.id}" is used twice`);
      else types.set(element.id, type);
      if (!filled(element.name)) errors.push(`${where}.name: missing`);
      for (const field of ["description", "technology", "path", "kind"])
        if (!optionalString(element[field])) errors.push(`${where}.${field}: not a string`);
      if (parent && !filled(element[parent])) errors.push(`${where}.${parent}: missing`);
    });
  }
  for (const { key, parent } of COLLECTIONS) {
    if (!parent || !Array.isArray(model[key])) continue;
    model[key].forEach((element, index) => {
      if (!isObject(element) || !filled(element[parent])) return;
      const found = types.get(element[parent]);
      if (found !== PARENT_TYPE[COLLECTIONS.find((c) => c.key === key).type])
        errors.push(
          `${key}[${index}].${parent}: "${element[parent]}" is not a ${parent} id in the model`,
        );
    });
  }
  if (model.relationships !== undefined && !Array.isArray(model.relationships))
    errors.push("relationships: not an array");
  else
    (model.relationships ?? []).forEach((relationship, index) => {
      const where = `relationships[${index}]`;
      if (!isObject(relationship)) return errors.push(`${where}: not an object`);
      for (const end of ["from", "to"])
        if (!filled(relationship[end])) errors.push(`${where}.${end}: missing`);
        else if (!types.has(relationship[end]))
          errors.push(`${where}.${end}: "${relationship[end]}" is not an element id in the model`);
      if (filled(relationship.from) && relationship.from === relationship.to)
        errors.push(`${where}: from and to are the same element`);
      for (const field of ["label", "technology"])
        if (!optionalString(relationship[field])) errors.push(`${where}.${field}: not a string`);
    });
  return errors;
}

// Flattens the model into one record per element, with its type and parent id.
function indexElements(model) {
  const elements = new Map();
  const system = model.system;
  elements.set(system.id, {
    id: system.id,
    name: system.name,
    type: "system",
    description: system.description ?? "",
    parent: null,
  });
  for (const { key, type, parent } of COLLECTIONS)
    for (const element of model[key] ?? [])
      elements.set(element.id, {
        id: element.id,
        name: element.name,
        type,
        description: element.description ?? "",
        technology: element.technology ?? "",
        path: element.path ?? "",
        kind: element.kind ?? "",
        parent: parent ? element[parent] : type === "container" ? system.id : null,
      });
  return elements;
}

// The ancestor of `id` with the given type, the element itself when it has that type, or null.
function ancestorOfType(elements, id, type) {
  for (let element = elements.get(id); element; element = elements.get(element.parent))
    if (element.type === type) return element.id;
  return null;
}

// For each level: which element types are its core nodes, which appear only as neighbors of a
// core node, and where an endpoint of each type lands when the relationship is rolled up.
const PLACEMENT = Object.freeze({
  context: {
    core: new Set(["person", "system", "external"]),
    place: (elements, id) => {
      const type = elements.get(id).type;
      if (type === "person" || type === "external") return id;
      return ancestorOfType(elements, id, "system");
    },
  },
  containers: {
    core: new Set(["container"]),
    place: (elements, id) => {
      const type = elements.get(id).type;
      if (type === "person" || type === "external") return id;
      return ancestorOfType(elements, id, "container");
    },
  },
  components: {
    core: new Set(["component"]),
    place: (elements, id) => {
      const type = elements.get(id).type;
      if (type === "person" || type === "external" || type === "container") return id;
      return ancestorOfType(elements, id, "component");
    },
  },
  code: {
    core: new Set(["code"]),
    place: (elements, id) => (elements.get(id).type === "code" ? id : null),
  },
});

function addListed(list, value) {
  if (filled(value) && !list.includes(value) && list.length < MAX_LISTED_VALUES) list.push(value);
}

// Rolls every relationship up to one level, merging those that land on the same pair.
export function rollUp(elements, relationships, level) {
  const { core, place } = PLACEMENT[level];
  const edges = new Map();
  for (const relationship of relationships) {
    const source = place(elements, relationship.from);
    const target = place(elements, relationship.to);
    if (!source || !target || source === target) continue;
    const sourceCore = core.has(elements.get(source).type);
    const targetCore = core.has(elements.get(target).type);
    if (!sourceCore && !targetCore) continue;
    const key = `${source}\u0000${target}`;
    if (!edges.has(key)) edges.set(key, { source, target, count: 0, labels: [], technologies: [] });
    const edge = edges.get(key);
    edge.count += 1;
    addListed(edge.labels, relationship.label);
    addListed(edge.technologies, relationship.technology);
  }
  return [...edges.values()];
}

// Tarjan's strongly connected components, iterative so a deep import chain cannot overflow the
// stack. Returns only components that hold a cycle: two or more nodes.
export function stronglyConnected(nodes, edges) {
  const adjacent = new Map(nodes.map((id) => [id, []]));
  for (const { source, target } of edges)
    if (adjacent.has(source) && adjacent.has(target)) adjacent.get(source).push(target);
  const index = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const found = [];
  let counter = 0;
  for (const start of nodes) {
    if (index.has(start)) continue;
    const work = [{ id: start, next: 0 }];
    index.set(start, counter);
    low.set(start, counter++);
    stack.push(start);
    onStack.add(start);
    while (work.length) {
      const frame = work[work.length - 1];
      const neighbors = adjacent.get(frame.id);
      if (frame.next < neighbors.length) {
        const next = neighbors[frame.next++];
        if (!index.has(next)) {
          index.set(next, counter);
          low.set(next, counter++);
          stack.push(next);
          onStack.add(next);
          work.push({ id: next, next: 0 });
        } else if (onStack.has(next))
          low.set(frame.id, Math.min(low.get(frame.id), index.get(next)));
        continue;
      }
      work.pop();
      if (work.length) {
        const parent = work[work.length - 1].id;
        low.set(parent, Math.min(low.get(parent), low.get(frame.id)));
      }
      if (low.get(frame.id) !== index.get(frame.id)) continue;
      const component = [];
      let member;
      do {
        member = stack.pop();
        onStack.delete(member);
        component.push(member);
      } while (member !== frame.id);
      if (component.length > 1) found.push(component.sort());
    }
  }
  return found;
}

// The shortest cycle through `start` that stays inside `members`, found by breadth-first search.
// It is one concrete loop to read; the component's full membership is listed beside it.
export function shortestCycle(start, members, edges) {
  const inside = new Set(members);
  const adjacent = new Map(members.map((id) => [id, []]));
  for (const { source, target } of edges)
    if (inside.has(source) && inside.has(target)) adjacent.get(source).push(target);
  const previous = new Map([[start, null]]);
  const queue = [start];
  while (queue.length) {
    const id = queue.shift();
    for (const next of adjacent.get(id)) {
      if (next === start) {
        const path = [start];
        for (let step = id; step !== start; step = previous.get(step)) path.splice(1, 0, step);
        return [...path, start];
      }
      if (!previous.has(next)) {
        previous.set(next, id);
        queue.push(next);
      }
    }
  }
  return [start];
}

// Finds the cycles among a level's core nodes and marks each edge that lies inside one.
export function findCycles(coreIds, edges) {
  const components = stronglyConnected(coreIds, edges)
    .sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]))
    .map((members, position) => {
      const inside = new Set(members);
      const internal = edges.filter((e) => inside.has(e.source) && inside.has(e.target));
      return {
        id: `cycle-${position + 1}`,
        nodes: members,
        edgeCount: internal.length,
        path: shortestCycle(members[0], members, internal),
      };
    });
  const cycleOf = new Map();
  for (const cycle of components) for (const id of cycle.nodes) cycleOf.set(id, cycle.id);
  for (const edge of edges) {
    const cycle = cycleOf.get(edge.source);
    edge.cycle = cycle && cycle === cycleOf.get(edge.target) ? cycle : null;
  }
  return { cycles: components, cycleOf };
}

// Builds the data every page reads: one view per C4 level plus the element index.
export function buildViews(model) {
  const elements = indexElements(model);
  const relationships = model.relationships ?? [];
  const childCount = new Map();
  for (const element of elements.values())
    if (element.parent) childCount.set(element.parent, (childCount.get(element.parent) ?? 0) + 1);
  const levels = {};
  for (const level of LEVELS) {
    const { core } = PLACEMENT[level];
    const edges = rollUp(elements, relationships, level);
    const coreIds = [...elements.values()].filter((e) => core.has(e.type)).map((e) => e.id);
    const linked = new Set(edges.flatMap((e) => [e.source, e.target]));
    const ids = [...new Set([...coreIds, ...[...linked].filter((id) => !coreIds.includes(id))])];
    const { cycles, cycleOf } =
      level === "context" ? { cycles: [], cycleOf: new Map() } : findCycles(coreIds, edges);
    if (level === "context") for (const edge of edges) edge.cycle = null;
    levels[level] = {
      ...PAGES[level],
      nodes: ids.map((id) => ({
        id,
        core: core.has(elements.get(id).type),
        cycle: cycleOf.get(id) ?? null,
      })),
      edges,
      cycles,
    };
  }
  const index = {};
  for (const element of elements.values())
    index[element.id] = { ...element, children: childCount.get(element.id) ?? 0 };
  return {
    system: {
      id: model.system.id,
      name: model.system.name,
      description: model.system.description ?? "",
    },
    elements: index,
    levels,
  };
}

function fail(lines) {
  for (const line of lines) console.error(line);
  console.error(`see ${DOC_PATH}`);
  process.exit(1);
}

function escapeHtml(text) {
  return String(text).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

// Fills a template's {{NAME}} slots. Every value is escaped, since it comes from the model.
function fill(template, values) {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_, name) => escapeHtml(values[name] ?? ""));
}

// Escaping `<` keeps a model string such as `</script>` inert if data.js is ever inlined.
function dataScript(views) {
  const json = JSON.stringify(views).replace(/</g, "\\u003c");
  return `window.C4 = ${json};\n`;
}

export function renderSite(views) {
  const read = (name) => readFileSync(join(SITE_DIR, name), "utf8");
  const page = read("page.html");
  const files = {
    "index.html": fill(read("index.html"), {
      SYSTEM: views.system.name,
      DESCRIPTION: views.system.description,
    }),
    "styles.css": read("styles.css"),
    "app.js": read("app.js"),
    "data.js": dataScript(views),
  };
  for (const level of LEVELS) {
    const meta = PAGES[level];
    files[meta.file] = fill(page, {
      LEVEL: level,
      TITLE: meta.title,
      SYSTEM: views.system.name,
    });
  }
  return files;
}

function main(argv) {
  if (argv.length !== 2) {
    console.error(USAGE);
    console.error(`see ${DOC_PATH}`);
    process.exit(2);
  }
  const [modelPath, out] = argv;
  let model;
  try {
    model = JSON.parse(readFileSync(modelPath, "utf8"));
  } catch (error) {
    fail([`cannot read ${modelPath} as JSON: ${error.message}`]);
  }
  const errors = validateModel(model);
  if (errors.length) fail([`${modelPath}: ${errors.length} validation error(s)`, ...errors]);
  if (existsSync(out) && !statSync(out).isDirectory())
    fail([`${out} exists and is not a directory`]);
  const views = buildViews(model);
  const files = renderSite(views);
  mkdirSync(out, { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(out, name), text);
  console.log(resolve(out, "index.html"));
  for (const level of LEVELS.slice(1)) {
    const { cycles } = views.levels[level];
    console.log(`${level}: ${cycles.length} cycle(s)`);
    for (const cycle of cycles)
      console.log(`  ${cycle.id} (${cycle.nodes.length} elements): ${cycle.path.join(" -> ")}`);
  }
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2));
}
