// Validates the `architecture` section of a C4 model and grades the architecture A to F from it and
// from the levels that build-c4-site.mjs rolls up. A helper module with no command line, no I/O, no
// clock, and no randomness, so one model always gives one grade. It never prints, so
// build-c4-site.mjs ends every failure through its own `fail`, and it imports nothing from
// build-c4-site.mjs.

// The questions in references/architecture-grade.md "Questions", in report order. Each is
// phrased so that yes conforms.
const QUESTIONS = Object.freeze([
  {
    id: "public-entry",
    criterion: "boundaries",
    question:
      "Code in one component uses another only through its public entry: the exported API, an index or barrel file, or a non-internal package",
    allowsNa: false,
  },
  {
    id: "one-writer-per-store",
    criterion: "boundaries",
    question: "One container writes each datastore the system owns",
    allowsNa: true,
  },
  {
    id: "explicit-contracts",
    criterion: "boundaries",
    question:
      "Containers call each other through declared contracts: routes, OpenAPI, protobuf, a GraphQL schema, or message types",
    allowsNa: true,
  },
  {
    id: "framework-free-core",
    criterion: "core-isolation",
    question:
      "The innermost layer imports no web framework, HTTP client, queue, or filesystem library, except what the convention puts there, such as ActiveRecord in Rails models",
    allowsNa: true,
  },
  {
    id: "core-owns-ports",
    criterion: "core-isolation",
    question:
      "The core declares the interfaces it calls outward, such as repositories, gateways, and notifiers, and code outside it implements them",
    allowsNa: true,
  },
  {
    id: "rules-in-core",
    criterion: "core-isolation",
    question: "Business rules live in the core, not in controllers, handlers, views, or jobs",
    allowsNa: true,
  },
  {
    id: "single-purpose",
    criterion: "responsibilities",
    question: 'Each component\'s purpose fits in one sentence without "and"',
    allowsNa: false,
  },
  {
    id: "no-catch-all",
    criterion: "responsibilities",
    question:
      "No component is a catch-all of unrelated code, such as utils, common, helpers, shared, or misc",
    allowsNa: false,
  },
  {
    id: "no-god-modules",
    criterion: "responsibilities",
    question:
      "No class or module mixes unrelated concerns, such as request handling, SQL, and rendering in one file",
    allowsNa: false,
  },
  {
    id: "no-hollow-layers",
    criterion: "responsibilities",
    question:
      "Abstractions add behavior: no interface with one implementation away from a boundary, and no layer whose methods only forward to the next",
    allowsNa: false,
  },
  {
    id: "follows-convention",
    criterion: "conventions",
    question: "The layout follows the convention named in architecture.convention",
    allowsNa: true,
  },
  {
    id: "one-mechanism-per-concern",
    criterion: "conventions",
    question:
      "Each cross-cutting concern, such as HTTP clients, configuration, logging, errors, and persistence access, uses one mechanism",
    allowsNa: false,
  },
  {
    id: "rules-checked",
    criterion: "conventions",
    question:
      "A tool or the compiler checks dependency rules: import-linter, ArchUnit, dependency-cruiser, Nx module boundaries, Packwerk, Go internal/, Java or Kotlin modules, or Rust crates",
    allowsNa: false,
  },
  {
    id: "docs-match",
    criterion: "conventions",
    question:
      "The architecture docs name the containers and components the model found, with no contradiction",
    allowsNa: true,
  },
]);

// A measured criterion's bands, A through D, as [inclusive upper edge in whole percent, citation].
// A citation names the published source that sets that edge; null marks this skill's proposal.
// F has no upper edge.
const bands = (...edges) =>
  Object.freeze([
    ...edges.map(([max, citation = null], index) =>
      Object.freeze({ letter: "ABCD"[index], max, citation }),
    ),
    Object.freeze({ letter: "F", max: null, citation: null }),
  ]);

// The criteria in references/architecture-grade.md "Measured criteria" and "Questions", in report
// order, with the weights and band edges that section gives.
const CRITERIA = Object.freeze([
  {
    id: "acyclic-components",
    name: "Acyclic components",
    kind: "measured",
    weight: 20,
    bands: bands([0, "Martin, Acyclic Dependencies Principle"], [10], [25], [50]),
  },
  {
    id: "acyclic-code",
    name: "Acyclic code",
    kind: "measured",
    weight: 10,
    bands: bands([2], [10], [30], [60]),
  },
  {
    id: "dependency-direction",
    name: "Dependency direction",
    kind: "measured",
    weight: 15,
    bands: bands([0, "Martin, the Dependency Rule"], [1], [5], [20]),
  },
  {
    id: "stable-dependencies",
    name: "Stable dependencies",
    kind: "measured",
    weight: 10,
    bands: bands([5], [15], [30], [50]),
  },
  {
    id: "propagation-cost",
    name: "Propagation cost",
    kind: "measured",
    weight: 10,
    bands: bands([10], [20], [35], [50]),
  },
  {
    id: "component-balance",
    name: "Component balance",
    kind: "measured",
    weight: 5,
    bands: bands([20], [30], [40], [60]),
  },
  { id: "boundaries", name: "Boundaries", kind: "judged", weight: 10 },
  { id: "core-isolation", name: "Core isolation", kind: "judged", weight: 5 },
  { id: "responsibilities", name: "Responsibilities", kind: "judged", weight: 10 },
  { id: "conventions", name: "Conventions", kind: "judged", weight: 5 },
]);

// The points per letter and the letter scale in references/architecture-grade.md "How the letter
// is computed". Points are hundredths of a 4-point scale, so integer arithmetic decides every edge.
const LETTER_POINTS = Object.freeze({ A: 400, B: 300, C: 200, D: 100, F: 0 });
const FULL_POINTS = LETTER_POINTS.A;
const SCALE = Object.freeze([
  Object.freeze({ letter: "A", min: 350 }),
  Object.freeze({ letter: "B", min: 250 }),
  Object.freeze({ letter: "C", min: 150 }),
  Object.freeze({ letter: "D", min: 50 }),
  Object.freeze({ letter: "F", min: 0 }),
]);

// The sizes below which references/architecture-grade.md "When no letter is given" withholds the
// grade: component metrics break down under about 4 components.
const MIN_COMPONENTS = 4;
const MIN_CODE = 10;

// When propagation-cost and component-balance apply, as references/architecture-grade.md
// "Measured criteria" gives. Each code element counts as reaching itself, so the reach share never
// falls below 1 / n; from 50 elements that floor is at most 2%, under the A edge of 10%. One
// breadth-first search per code element costs O(n x (n + e)), and 5000 keeps one build to seconds.
// Under 5 components the largest holds more than 20%, past the A edge, by arithmetic alone.
const PROPAGATION_MIN_CODE = 50;
const PROPAGATION_MAX_CODE = 5000;
const BALANCE_MIN_COMPONENTS = 5;

// Each evidence list in the grade keeps this many items, so data.js stays bounded however large the
// model is; `more` counts the rest, and the model keeps every item.
const MAX_EVIDENCE = 20;

const NO_SECTION = "the model has no architecture section";
const FEW_COMPONENTS = `fewer than ${MIN_COMPONENTS} components`;
const FEW_CODE = `fewer than ${MIN_CODE} code elements`;
const MOSTLY_UNCONNECTED =
  "more than half of the code elements have no relationship, so the imports look incomplete";

const NA = "n/a";

// Letters from best to worst, so a later index is a worse letter.
const LETTERS = "ABCDF";
const worse = (first, second) =>
  LETTERS.indexOf(first) >= LETTERS.indexOf(second) ? first : second;

const filled = (value) => typeof value === "string" && value.trim() !== "";
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const allowedAnswers = ({ allowsNa }) =>
  allowsNa ? "answer yes, no, or n/a with evidence" : "answer yes or no with evidence";

function answerErrors(answers) {
  const errors = [];
  for (const question of QUESTIONS) {
    const where = `architecture.answers.${question.id}`;
    const allowed = allowedAnswers(question);
    if (!Object.hasOwn(answers, question.id)) {
      errors.push(`${where}: missing; ${allowed}`);
      continue;
    }
    const entry = answers[question.id];
    if (!isObject(entry)) {
      errors.push(`${where}: not an object; ${allowed}`);
      continue;
    }
    const choices = question.allowsNa ? ["yes", "no", NA] : ["yes", "no"];
    if (!choices.includes(entry.answer))
      errors.push(`${where}.answer: "${entry.answer}" is not allowed; ${allowed}`);
    if (!Array.isArray(entry.evidence) || entry.evidence.length === 0)
      errors.push(`${where}.evidence: missing, or not a list of one or more files or facts`);
    else
      entry.evidence.forEach((item, index) => {
        if (!filled(item)) errors.push(`${where}.evidence[${index}]: empty, or not a string`);
      });
  }
  const known = new Set(QUESTIONS.map((question) => question.id));
  for (const id of Object.keys(answers))
    if (!known.has(id)) errors.push(`architecture.answers.${id}: not a grading question id`);
  return errors;
}

function layerListErrors(layers) {
  if (!Array.isArray(layers)) return ["architecture.layers: not an array"];
  if (layers.length < 2) return ["architecture.layers: fewer than two names"];
  const errors = [];
  const seen = new Set();
  layers.forEach((name, index) => {
    const where = `architecture.layers[${index}]`;
    if (!filled(name)) errors.push(`${where}: empty, or not a string`);
    else if (seen.has(name)) errors.push(`${where}: "${name}" is listed twice`);
    else seen.add(name);
  });
  return errors;
}

// validateModel reports a components list that is not an array, or an entry that is not an
// object, so those are skipped here. Membership is checked only against a valid layers list.
function componentLayerErrors(components, layers, layersValid) {
  if (!Array.isArray(components)) return [];
  const errors = [];
  components.forEach((component, index) => {
    if (!isObject(component)) return;
    const where = `components[${index}].layer`;
    const { layer } = component;
    if (layers === undefined) {
      if (layer !== undefined)
        errors.push(`${where}: set, but the model has no architecture.layers`);
    } else if (layer === undefined) errors.push(`${where}: missing; architecture.layers is set`);
    else if (typeof layer !== "string") errors.push(`${where}: not a string`);
    else if (layersValid && !layers.includes(layer))
      errors.push(`${where}: "${layer}" is not in architecture.layers`);
  });
  return errors;
}

// Returns every error in the model's `architecture` section and in its components' `layer`
// fields, as one sentence each, JSON path first.
export function validateArchitecture(model) {
  const section = model.architecture;
  if (section !== undefined && !isObject(section)) return ["architecture: not an object"];
  const errors = [];
  if (section !== undefined && !filled(section.convention))
    errors.push("architecture.convention: missing; name the convention the grade judges against");
  const layers = section?.layers;
  const listErrors = layers === undefined ? [] : layerListErrors(layers);
  errors.push(
    ...listErrors,
    ...componentLayerErrors(model.components, layers, listErrors.length === 0),
  );
  if (section === undefined) return errors;
  if (!isObject(section.answers)) errors.push("architecture.answers: missing, or not an object");
  else errors.push(...answerErrors(section.answers));
  return errors;
}

const scaleLetter = (points) => SCALE.find((step) => points >= step.min).letter;
const percent = (part, whole) => ((part * 100) / whole).toFixed(1);

// The weighted mean of the applicable criteria's points, floored to whole points, and its letter,
// which is never better than a fired cap's letter.
export function combine(criteria, caps = []) {
  const applicable = criteria.filter((criterion) => criterion.points !== null);
  const weight = applicable.reduce((sum, criterion) => sum + criterion.weight, 0);
  const weighted = applicable.reduce(
    (sum, criterion) => sum + criterion.weight * criterion.points,
    0,
  );
  const points = Math.floor(weighted / weight);
  return { letter: caps.map((cap) => cap.letter).reduce(worse, scaleLetter(points)), points };
}

const coreIds = (level) => level.nodes.filter((node) => node.core).map((node) => node.id);
const cycleMembers = (level) => level.cycles.reduce((sum, cycle) => sum + cycle.nodes.length, 0);
const cycleEvidence = (level) =>
  level.cycles.flatMap((cycle) => cycle.nodes.map((id) => `${id} (${cycle.id})`));

// The first MAX_EVIDENCE items in code-unit order, so the list never depends on the model's order
// or on the machine's locale, and the count left out.
function capped(items) {
  return {
    evidence: [...items].sort().slice(0, MAX_EVIDENCE),
    more: Math.max(0, items.length - MAX_EVIDENCE),
  };
}

// Rolled-up component edges whose two ends are components, one per ordered pair.
function componentEdges(levels) {
  const components = new Set(coreIds(levels.components));
  return levels.components.edges.filter(
    (edge) => components.has(edge.source) && components.has(edge.target),
  );
}

const notApplicable = (value) => ({ part: null, whole: null, value, evidence: [] });

// The count of ordered pairs (a, b) of code elements where b is reachable from a, each element
// reaching itself. Integer indexes, one reused visited-stamp array, and one reused queue keep the
// per-element searches cheap.
function reachablePairs(level) {
  const ids = coreIds(level);
  const position = new Map(ids.map((id, index) => [id, index]));
  const adjacent = ids.map(() => []);
  for (const { source, target } of level.edges)
    adjacent[position.get(source)].push(position.get(target));
  const visited = new Uint32Array(ids.length);
  const queue = new Uint32Array(ids.length);
  let pairs = 0;
  for (let start = 0; start < ids.length; start++) {
    const stamp = start + 1;
    visited[start] = stamp;
    queue[0] = start;
    let head = 0;
    let tail = 1;
    while (head < tail)
      for (const next of adjacent[queue[head++]])
        if (visited[next] !== stamp) {
          visited[next] = stamp;
          queue[tail++] = next;
        }
    pairs += tail;
  }
  return pairs;
}

// Each measure returns the share it bands, as `part` of `whole`, the text stdout prints, and the
// evidence the site lists. A measure that does not apply returns null shares, the reason as its
// text, and no evidence.
const MEASURES = Object.freeze({
  "acyclic-components": ({ levels }) => {
    const part = cycleMembers(levels.components);
    const whole = coreIds(levels.components).length;
    return {
      part,
      whole,
      value: `${part} of ${whole} components in a cycle (${percent(part, whole)}%)`,
      evidence: cycleEvidence(levels.components),
    };
  },
  "acyclic-code": ({ levels }) => {
    const part = cycleMembers(levels.code);
    const whole = coreIds(levels.code).length;
    return {
      part,
      whole,
      value: `${part} of ${whole} code elements in a cycle (${percent(part, whole)}%)`,
      evidence: cycleEvidence(levels.code),
    };
  },
  // Merged counts, because this measures how many imports break the layer order.
  "dependency-direction": ({ model, levels }) => {
    const { layers } = model.architecture;
    if (layers === undefined) return notApplicable("the model sets no layers");
    const depth = new Map(layers.map((name, index) => [name, index]));
    const layerOf = new Map(model.components.map((component) => [component.id, component.layer]));
    let part = 0;
    let whole = 0;
    const evidence = [];
    for (const edge of componentEdges(levels)) {
      const from = layerOf.get(edge.source);
      const to = layerOf.get(edge.target);
      if (from === to) continue;
      whole += edge.count;
      if (depth.get(to) >= depth.get(from)) continue;
      part += edge.count;
      evidence.push(`${edge.source} (${from}) -> ${edge.target} (${to}): ${edge.count}`);
    }
    if (whole === 0) return notApplicable("no relationship crosses layers");
    return {
      part,
      whole,
      value: `${part} of ${whole} cross-layer relationships point outward (${percent(part, whole)}%)`,
      evidence,
    };
  },
  // Ca and Ce count distinct neighbor components, one per rolled-up edge whatever its merged
  // count, as Martin's and dependency-cruiser's definitions count neighbors, not imports.
  "stable-dependencies": ({ levels }) => {
    const edges = componentEdges(levels);
    if (edges.length === 0) return notApplicable("no dependency joins two components");
    const afferent = new Map();
    const efferent = new Map();
    for (const { source, target } of edges) {
      efferent.set(source, (efferent.get(source) ?? 0) + 1);
      afferent.set(target, (afferent.get(target) ?? 0) + 1);
    }
    const ce = (id) => efferent.get(id) ?? 0;
    const coupling = (id) => (afferent.get(id) ?? 0) + ce(id);
    const instability = (id) => (ce(id) / coupling(id)).toFixed(2);
    // I = Ce / (Ca + Ce); I(target) > I(source), cross-multiplied so integers decide a tie.
    const violations = edges.filter(
      ({ source, target }) => ce(target) * coupling(source) > ce(source) * coupling(target),
    );
    const part = violations.length;
    const whole = edges.length;
    return {
      part,
      whole,
      value: `${part} of ${whole} component dependencies point to a less stable component (${percent(part, whole)}%)`,
      evidence: violations.map(
        ({ source, target }) =>
          `${source} -> ${target}: instability ${instability(source)} to ${instability(target)}`,
      ),
    };
  },
  "propagation-cost": ({ levels }) => {
    const count = coreIds(levels.code).length;
    if (count < PROPAGATION_MIN_CODE || count > PROPAGATION_MAX_CODE)
      return notApplicable(
        `applies from ${PROPAGATION_MIN_CODE} through ${PROPAGATION_MAX_CODE} code elements, and the model has ${count}`,
      );
    const part = reachablePairs(levels.code);
    const whole = count * count;
    return {
      part,
      whole,
      value: `a code element reaches ${percent(part, whole)}% of the code elements on average`,
      evidence: [
        `${part} of ${whole} ordered pairs of code elements are reachable, each element counted as reaching itself`,
      ],
    };
  },
  "component-balance": ({ model }) => {
    const count = model.components.length;
    if (count < BALANCE_MIN_COMPONENTS)
      return notApplicable(
        `applies from ${BALANCE_MIN_COMPONENTS} components, and the model has ${count}`,
      );
    const sizes = new Map();
    for (const element of model.code)
      sizes.set(element.component, (sizes.get(element.component) ?? 0) + 1);
    const part = Math.max(...sizes.values());
    const whole = model.code.length;
    return {
      part,
      whole,
      value: `the largest component holds ${part} of ${whole} code elements (${percent(part, whole)}%)`,
      evidence: [...sizes]
        .filter(([, size]) => size === part)
        .map(([component]) => `${component}: ${part} of ${whole} code elements`),
    };
  },
});

const describe = ({ id, name, kind, weight }) => ({ id, name, kind, weight });

function measured(criterion, facts) {
  const { part, whole, value, evidence } = MEASURES[criterion.id](facts);
  const letter =
    part === null
      ? null
      : criterion.bands.find((band) => band.max === null || part * 100 <= band.max * whole).letter;
  return {
    ...describe(criterion),
    letter,
    points: letter === null ? null : LETTER_POINTS[letter],
    value,
    bands: criterion.bands,
    ...capped(evidence),
  };
}

function judged(criterion, { answers }) {
  const asked = QUESTIONS.filter((question) => question.criterion === criterion.id).map(
    ({ id, question }) => ({
      id,
      question,
      answer: answers[id].answer,
      ...capped(answers[id].evidence),
    }),
  );
  const yes = asked.filter(({ answer }) => answer === "yes").length;
  const decided = asked.filter(({ answer }) => answer !== NA).length;
  const points = decided === 0 ? null : Math.floor((FULL_POINTS * yes) / decided);
  return {
    ...describe(criterion),
    letter: points === null ? null : scaleLetter(points),
    points,
    value: decided === 0 ? "every answer is n/a" : `${yes} of ${decided} answers yes`,
    evidence: [],
    more: 0,
    answers: asked,
  };
}

const cycleIds = (cycles) => cycles.map((cycle) => cycle.id).join(", ");

// The caps in references/architecture-grade.md "Caps", each with the highest letter it allows.
// Each fires on a measured cycle fact and returns its reason, or null when it does not fire.
const CAPS = Object.freeze([
  {
    id: "container-cycle",
    letter: "C",
    fires: ({ containers }) =>
      containers.cycles.length ? `a cycle joins containers (${cycleIds(containers.cycles)})` : null,
  },
  {
    id: "component-cycle",
    letter: "B",
    fires: ({ components }) =>
      components.cycles.length ? `a cycle joins components (${cycleIds(components.cycles)})` : null,
  },
  {
    id: "tangled-components",
    letter: "D",
    fires: ({ components }) => {
      const total = coreIds(components).length;
      const largest = components.cycles.reduce(
        (found, cycle) => (cycle.nodes.length > (found?.nodes.length ?? 0) ? cycle : found),
        null,
      );
      if (!largest || largest.nodes.length * 2 <= total) return null;
      return `${largest.id} holds ${largest.nodes.length} of ${total} components`;
    },
  },
]);

function withholdReason(model) {
  if (model.architecture === undefined) return NO_SECTION;
  if ((model.components ?? []).length < MIN_COMPONENTS) return FEW_COMPONENTS;
  const code = model.code ?? [];
  if (code.length < MIN_CODE) return FEW_CODE;
  const connected = new Set((model.relationships ?? []).flatMap(({ from, to }) => [from, to]));
  const unconnected = code.filter((element) => !connected.has(element.id)).length;
  if (unconnected * 2 > code.length) return MOSTLY_UNCONNECTED;
  return null;
}

// Grades a valid model. `levels` is the object buildViews builds: nodes, edges, and cycles per
// level. A withheld grade has a reason, the scale, and no letter, points, convention, criteria, or
// caps, so the site reads one shape in both states.
export function gradeArchitecture(model, levels) {
  const reason = withholdReason(model);
  if (reason)
    return {
      letter: null,
      reason,
      points: null,
      convention: null,
      scale: SCALE,
      criteria: [],
      caps: [],
    };
  const facts = { model, levels, answers: model.architecture.answers };
  const criteria = CRITERIA.map((criterion) =>
    criterion.kind === "measured" ? measured(criterion, facts) : judged(criterion, facts),
  );
  const caps = CAPS.map(({ id, letter, fires }) => ({ id, letter, reason: fires(levels) })).filter(
    (cap) => cap.reason !== null,
  );
  const { letter, points } = combine(criteria, caps);
  return {
    letter,
    reason: null,
    points,
    convention: model.architecture.convention,
    scale: SCALE,
    criteria,
    caps,
  };
}
