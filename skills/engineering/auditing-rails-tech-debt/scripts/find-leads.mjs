#!/usr/bin/env node
// Lists the places in a Rails app that the reference files' mechanical finding rules point at:
// file sizes, db/schema.rb cross-references, and literal grep patterns. Every entry is a lead to
// read, never a finding.
//
// Usage: find-leads.mjs <app-root>
//
// Stdout, one line of JSON, keys and arrays in a fixed order:
//
//   {
//     "sizes": {
//       "models":      {"count": N, "largest": [{"file", "lines"}]},  app/models/**/*.rb
//       "controllers": {"count": N, "largest": [{"file", "lines"}]}   app/controllers/**/*.rb
//     },
//     "schema": null | {
//       "fkWithoutConstraint": [{"table", "column", "polymorphic"}],  no add_foreign_key covers it
//       "fkWithoutIndex":      [{"table", "column", "polymorphic"}],  no index leads with it
//       "moneyColumns":        [{"table", "column", "type"}],         float or decimal, money-named,
//                                                                     no currency column on the table
//       "attrShadowsColumn":   [{"file", "line", "attribute", "table"}],
//       "unresolved":          [{"kind": "foreign-key", "table", "toTable"}
//                               | {"kind": "model-table", "file", "table"}]
//     },
//     "greps": [{"rule", "file", "line", "text"}]
//   }
//
// Every `_id` column is a lead, `polymorphic` true when the table also has `<name>_type`. An
// add_foreign_key with no `column:` covers the naive singular of its target table plus `_id`;
// when that column is absent, the key lands in `unresolved`. A model's table is its
// `self.table_name`, else the naive plural of its file name; a model declaring attr_accessor or
// attr_writer whose table is not in the schema lands in `unresolved`. `largest` holds at most
// LARGEST_FILES entries, by lines descending, then path. `greps` is sorted by GREP_RULES order,
// then file, then line. Paths are relative to <app-root> with forward slashes.
//
// Exit codes:
//   0  printed the leads
//   1  printed nothing; stderr names the failure: <app-root> lacks Gemfile or app/, a file cannot
//      be read, or db/schema.rb has no ActiveRecord::Schema definition
//   2  wrong argument count; stderr prints the usage line
//   3  no db/schema.rb (a structure.sql app): printed the leads with "schema": null
import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const SCRIPT = "find-leads.mjs";
const EXIT_OK = 0;
const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;
const EXIT_NO_SCHEMA = 3;

// The audit starts from the biggest files; 25 of each covers that start without printing every
// file in a large app.
const LARGEST_FILES = 25;

// Underscore-separated name tokens that mark a column as money. The model confirms each lead, so
// a broad list costs a glance while a missing word loses a finding.
const MONEY_WORDS = new Set([
  "amount",
  "balance",
  "charge",
  "cost",
  "discount",
  "fee",
  "fees",
  "price",
  "refund",
  "revenue",
  "salary",
  "subtotal",
  "tax",
  "total",
]);

// Tests and specs are not the audited code; each rule searches only the roots its reference
// file names or implies.
const APP_AND_LIB = ["app", "lib"];
const GREP_RULES = [
  {
    // rails-antipatterns.md, SQL injection through string interpolation.
    rule: "sql-interpolation",
    roots: APP_AND_LIB,
    pattern: /\b(?:where|order|group|having|joins|select|find_by_sql)\s*\(.*#\{/,
  },
  {
    // rails-antipatterns.md, update_attribute, update_column, save(validate: false).
    rule: "validation-bypass",
    roots: APP_AND_LIB,
    pattern: /\.update_attribute\b|\.update_columns?\b|\bsave!?\(\s*validate:\s*false\s*\)/,
  },
  {
    // poeaa-data-source.md, Table Data Gateway.
    rule: "raw-sql",
    roots: APP_AND_LIB,
    pattern: /\bconnection\.(?:select_all|execute)\b|\bfind_by_sql\b/,
  },
  {
    // poeaa-base.md, Gateway.
    rule: "http-client",
    roots: APP_AND_LIB,
    pattern: /\bNet::HTTP\b|\bFaraday\b|\bHTTParty\b|\bStripe::|\bAws::/,
  },
  {
    // poeaa-base.md, Layer Supertype. The Application* definitions themselves are skipped.
    rule: "layer-supertype-bypass",
    roots: ["app"],
    pattern: /<\s*(?:ActiveRecord|ActionController)::Base\b/,
    skip: /\bclass\s+Application\w*\s*</,
  },
  {
    // poeaa-base.md, Registry. $stdout, $stderr, and $stdin are Ruby's own streams, not state.
    rule: "global-state",
    roots: APP_AND_LIB,
    pattern:
      /(?<![\w$])\$(?!(?:stdout|stderr|stdin)\b)[a-z_]\w*|@@\w+|\bThread\.current\s*\[[^\]]*\]\s*(?:\|\||&&)?=(?!=)|\bThread\.current\.thread_variable_set\b/,
  },
  {
    // poeaa-base.md, Plugin. config/ holds the initializers, so it is outside these roots.
    rule: "rails-env-branch",
    roots: APP_AND_LIB,
    pattern: /\bRails\.env\./,
  },
  {
    // poeaa-web-presentation.md, Model View Controller.
    rule: "presentation-in-model",
    roots: ["app/models"],
    pattern: /\bhtml_safe\b|\btag\.|<span|\blink_to\b|\bRails\.application\.routes\b/,
  },
];

// Commented-out code is not running code, so a full-line comment never counts as a hit.
const COMMENT_LINE = /^\s*#/;

class LeadError extends Error {}

function read(path) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    throw new LeadError(`cannot read ${path}: ${error.code ?? error.message}`);
  }
}

// Ruby files under <root>/<dir>, sorted, never following a symlink, so no walk leaves the app.
function rubyFiles(root, dir) {
  const found = [];
  const walk = (relative) => {
    let entries;
    try {
      entries = readdirSync(join(root, relative), { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT" && relative === dir) return;
      throw new LeadError(`cannot read ${join(root, relative)}: ${error.code ?? error.message}`);
    }
    for (const entry of entries) {
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile() && entry.name.endsWith(".rb")) found.push(child);
    }
  };
  walk(dir);
  return found.sort();
}

export function countLines(text) {
  if (text === "") return 0;
  const newlines = text.split("\n").length - 1;
  return text.endsWith("\n") ? newlines : newlines + 1;
}

function sizes(root, dir) {
  const files = rubyFiles(root, dir).map((file) => ({
    file,
    lines: countLines(read(join(root, file))),
  }));
  files.sort((a, b) => b.lines - a.lines || compare(a.file, b.file));
  return { count: files.length, largest: files.slice(0, LARGEST_FILES) };
}

function compare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function singularize(word) {
  if (/[^aeiou]ies$/.test(word)) return word.slice(0, -3) + "y";
  if (/(?:s|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

export function pluralize(word) {
  if (/[^aeiou]y$/.test(word)) return word.slice(0, -1) + "ies";
  if (/(?:s|x|z|ch|sh)$/.test(word)) return word + "es";
  return word + "s";
}

const quoted = (source) => /^\s*["':]?(\w+)["']?/.exec(source)?.[1];
const quotedList = (source) => [...source.matchAll(/["':](\w+)["']?/g)].map((match) => match[1]);
// An index's columns: a ["a", "b"] array, or one "a" string (an expression index never matches).
const indexColumns = (source) =>
  source.trimStart().startsWith("[")
    ? quotedList(source.slice(0, source.indexOf("]") + 1))
    : [/^\s*"([^"]*)"/.exec(source)?.[1]].filter(Boolean);

const NOT_A_COLUMN = new Set([
  "index",
  "check_constraint",
  "exclusion_constraint",
  "unique_constraint",
]);

export function parseSchema(text) {
  if (!/ActiveRecord::Schema(?:\[[\d.]+\])?\.define\b/.test(text)) {
    throw new LeadError("db/schema.rb has no ActiveRecord::Schema definition");
  }
  const tables = new Map();
  const foreignKeys = [];
  let current = null;
  let currentIndent = -1;
  const indexesOf = (name) => {
    if (!tables.has(name)) tables.set(name, { columns: new Map(), indexes: [] });
    return tables.get(name).indexes;
  };

  for (const line of text.split("\n")) {
    const create = /^(\s*)create_table\s+"([^"]+)"/.exec(line);
    if (create) {
      current = create[2];
      currentIndent = create[1].length;
      tables.set(current, tables.get(current) ?? { columns: new Map(), indexes: [] });
      continue;
    }
    if (current !== null) {
      const end = /^(\s*)end\b/.exec(line);
      if (end && end[1].length === currentIndent) {
        current = null;
        continue;
      }
      const column = /^\s*t\.(\w+)\s+"([^"]+)"/.exec(line);
      if (column && !NOT_A_COLUMN.has(column[1])) {
        tables.get(current).columns.set(column[2], column[1]);
        continue;
      }
      const index = /^\s*t\.index\s+(.*)$/.exec(line);
      if (index) indexesOf(current).push(indexColumns(index[1]));
      continue;
    }
    const addIndex = /^\s*add_index\s+"([^"]+)",\s*(.*)$/.exec(line);
    if (addIndex) {
      indexesOf(addIndex[1]).push(indexColumns(addIndex[2]));
      continue;
    }
    const foreignKey = /^\s*add_foreign_key\s+"([^"]+)",\s*"([^"]+)"(.*)$/.exec(line);
    if (foreignKey) {
      const columnOption = /\bcolumn:\s*(.*)$/.exec(foreignKey[3]);
      foreignKeys.push({
        table: foreignKey[1],
        toTable: foreignKey[2],
        column: columnOption ? quoted(columnOption[1]) : null,
      });
    }
  }
  return { tables, foreignKeys };
}

function byTableColumn(a, b) {
  return compare(a.table, b.table) || compare(a.column, b.column);
}

export function schemaLeads({ tables, foreignKeys }, models) {
  const constrained = new Set();
  const unresolved = [];
  for (const key of foreignKeys) {
    const column = key.column ?? `${singularize(key.toTable)}_id`;
    if (tables.get(key.table)?.columns.has(column)) constrained.add(`${key.table}.${column}`);
    else unresolved.push({ kind: "foreign-key", table: key.table, toTable: key.toTable });
  }

  const fkWithoutConstraint = [];
  const fkWithoutIndex = [];
  const moneyColumns = [];
  for (const [table, { columns, indexes }] of tables) {
    const hasCurrency = [...columns.keys()].some(
      (name) => name === "currency" || name.endsWith("_currency"),
    );
    for (const [column, type] of columns) {
      if (column.endsWith("_id")) {
        const typeColumn = `${column.slice(0, -3)}_type`;
        const polymorphic = columns.has(typeColumn);
        const lead = { table, column, polymorphic };
        if (!constrained.has(`${table}.${column}`)) fkWithoutConstraint.push(lead);
        const indexed = indexes.some(
          (cols) =>
            cols[0] === column || (polymorphic && cols[0] === typeColumn && cols[1] === column),
        );
        if (!indexed) fkWithoutIndex.push(lead);
      }
      const isMoney = column.split("_").some((token) => MONEY_WORDS.has(token));
      if ((type === "float" || type === "decimal") && isMoney && !hasCurrency) {
        moneyColumns.push({ table, column, type });
      }
    }
  }

  const attrShadowsColumn = [];
  for (const model of models) {
    if (model.attributes.length === 0) continue;
    const columns = tables.get(model.table)?.columns;
    if (!columns) {
      unresolved.push({ kind: "model-table", file: model.file, table: model.table });
      continue;
    }
    for (const { attribute, line } of model.attributes) {
      if (columns.has(attribute)) {
        attrShadowsColumn.push({ file: model.file, line, attribute, table: model.table });
      }
    }
  }

  attrShadowsColumn.sort((a, b) => compare(a.file, b.file) || a.line - b.line);
  unresolved.sort(
    (a, b) =>
      compare(a.kind, b.kind) ||
      compare(a.file ?? a.table, b.file ?? b.table) ||
      compare(a.toTable ?? a.table, b.toTable ?? b.table),
  );
  return {
    fkWithoutConstraint: fkWithoutConstraint.sort(byTableColumn),
    fkWithoutIndex: fkWithoutIndex.sort(byTableColumn),
    moneyColumns: moneyColumns.sort(byTableColumn),
    attrShadowsColumn,
    unresolved,
  };
}

export function parseModel(file, text) {
  const explicitTable = /^\s*self\.table_name\s*=\s*["':](\w+)/m.exec(text)?.[1];
  const base = file.slice(file.lastIndexOf("/") + 1, -".rb".length);
  const attributes = [];
  text.split("\n").forEach((line, index) => {
    const declaration = /^\s*attr_(?:accessor|writer)\s+(.*)$/.exec(line);
    if (!declaration) return;
    for (const attribute of quotedList(declaration[1].replace(/#.*$/, ""))) {
      attributes.push({ attribute, line: index + 1 });
    }
  });
  return { file, table: explicitTable ?? pluralize(base), attributes };
}

export function grepLeads(filesByRoot, readFile) {
  const hits = [];
  for (const { rule, roots, pattern, skip } of GREP_RULES) {
    const files = [...new Set(roots.flatMap((root) => filesByRoot(root)))].sort();
    for (const file of files) {
      readFile(file)
        .split("\n")
        .forEach((text, index) => {
          if (COMMENT_LINE.test(text) || !pattern.test(text) || skip?.test(text)) return;
          hits.push({ rule, file, line: index + 1, text: text.trim() });
        });
    }
  }
  return hits;
}

function isDirectory(path) {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isFile(path) {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}

export function findLeads(root) {
  if (!isFile(join(root, "Gemfile")) || !isDirectory(join(root, "app"))) {
    throw new LeadError(`${root} is not a Rails root: it needs a Gemfile and an app/ directory`);
  }
  const cache = new Map();
  const readFile = (file) => {
    if (!cache.has(file)) cache.set(file, read(join(root, file)));
    return cache.get(file);
  };
  const filesByRoot = (dir) => rubyFiles(root, dir);

  let schema = null;
  if (isFile(join(root, "db/schema.rb"))) {
    const models = filesByRoot("app/models").map((file) => parseModel(file, readFile(file)));
    schema = schemaLeads(parseSchema(read(join(root, "db/schema.rb"))), models);
  }
  return {
    sizes: { models: sizes(root, "app/models"), controllers: sizes(root, "app/controllers") },
    schema,
    greps: grepLeads(filesByRoot, readFile),
  };
}

function main(argv) {
  if (argv.length !== 1) {
    process.stderr.write(`${SCRIPT}: usage: ${SCRIPT} <app-root>\n`);
    return EXIT_USAGE;
  }
  let leads;
  try {
    leads = findLeads(argv[0]);
  } catch (error) {
    if (!(error instanceof LeadError)) throw error;
    process.stderr.write(`${SCRIPT}: ${error.message}\n`);
    return EXIT_FAILURE;
  }
  process.stdout.write(`${JSON.stringify(leads)}\n`);
  if (leads.schema === null) {
    process.stderr.write(`${SCRIPT}: no db/schema.rb, so "schema" is null\n`);
    return EXIT_NO_SCHEMA;
  }
  return EXIT_OK;
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
