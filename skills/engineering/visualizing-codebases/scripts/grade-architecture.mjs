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

const NO_SECTION = "the model has no architecture section";
const FEW_COMPONENTS = `fewer than ${MIN_COMPONENTS} components`;
const FEW_CODE = `fewer than ${MIN_CODE} code elements`;
const MOSTLY_UNCONNECTED =
  "more than half of the code elements have no relationship, so the imports look incomplete";

const NA = "n/a";

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

// Returns every error in the model's `architecture` section, as one sentence each, JSON path first.
export function validateArchitecture(model) {
  const section = model.architecture;
  if (section === undefined) return [];
  if (!isObject(section)) return ["architecture: not an object"];
  const errors = [];
  if (!filled(section.convention))
    errors.push("architecture.convention: missing; name the convention the grade judges against");
  if (!isObject(section.answers)) errors.push("architecture.answers: missing, or not an object");
  else errors.push(...answerErrors(section.answers));
  return errors;
}

const scaleLetter = (points) => SCALE.find((step) => points >= step.min).letter;
const percent = (part, whole) => ((part * 100) / whole).toFixed(1);

// The weighted mean of the applicable criteria's points, floored to whole points, and its letter.
export function combine(criteria) {
  const applicable = criteria.filter((criterion) => criterion.points !== null);
  const weight = applicable.reduce((sum, criterion) => sum + criterion.weight, 0);
  const weighted = applicable.reduce(
    (sum, criterion) => sum + criterion.weight * criterion.points,
    0,
  );
  const points = Math.floor(weighted / weight);
  return { letter: scaleLetter(points), points };
}

const coreIds = (level) => level.nodes.filter((node) => node.core).map((node) => node.id);
const cycleMembers = (level) => level.cycles.reduce((sum, cycle) => sum + cycle.nodes.length, 0);

// Each measure returns the share it bands, as `part` of `whole`, and the text stdout prints.
const MEASURES = Object.freeze({
  "acyclic-components": ({ levels }) => {
    const part = cycleMembers(levels.components);
    const whole = coreIds(levels.components).length;
    return {
      part,
      whole,
      value: `${part} of ${whole} components in a cycle (${percent(part, whole)}%)`,
    };
  },
  "acyclic-code": ({ levels }) => {
    const part = cycleMembers(levels.code);
    const whole = coreIds(levels.code).length;
    return {
      part,
      whole,
      value: `${part} of ${whole} code elements in a cycle (${percent(part, whole)}%)`,
    };
  },
});

function measured(criterion, facts) {
  const { part, whole, value } = MEASURES[criterion.id](facts);
  const { letter } = criterion.bands.find(
    (band) => band.max === null || part * 100 <= band.max * whole,
  );
  return { id: criterion.id, letter, points: LETTER_POINTS[letter], value };
}

function judged(criterion, { answers }) {
  const given = QUESTIONS.filter((question) => question.criterion === criterion.id).map(
    (question) => answers[question.id].answer,
  );
  const yes = given.filter((answer) => answer === "yes").length;
  const decided = given.filter((answer) => answer !== NA).length;
  if (decided === 0)
    return { id: criterion.id, letter: null, points: null, value: "every answer is n/a" };
  const points = Math.floor((FULL_POINTS * yes) / decided);
  return {
    id: criterion.id,
    letter: scaleLetter(points),
    points,
    value: `${yes} of ${decided} answers yes`,
  };
}

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
// level. A withheld grade has a reason and no letter, points, convention, or criteria.
export function gradeArchitecture(model, levels) {
  const reason = withholdReason(model);
  if (reason) return { letter: null, reason, points: null, convention: null, criteria: [] };
  const facts = { levels, answers: model.architecture.answers };
  const criteria = CRITERIA.map((criterion) =>
    criterion.kind === "measured" ? measured(criterion, facts) : judged(criterion, facts),
  );
  const { letter, points } = combine(
    criteria.map((criterion, index) => ({
      weight: CRITERIA[index].weight,
      points: criterion.points,
    })),
  );
  return { letter, reason: null, points, convention: model.architecture.convention, criteria };
}
