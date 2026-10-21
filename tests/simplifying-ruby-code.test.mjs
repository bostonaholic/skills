// Fails when find-callers.sh stops listing literal, namespaced short-name,
// require, or dynamic-lookup hits in any file, starts reading excluded
// directories or matching partial words, changes its line format or sort order,
// or stops exiting 1 on no hits, 2 on a bad argument, 3 on a missing tool, or
// 4 when grep fails.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const SCRIPT = resolve("skills/engineering/simplifying-ruby-code/scripts/find-callers.sh");
const BASH = spawnSync("bash", ["-c", "command -v bash"], { encoding: "utf8" }).stdout.trim();
// Every external command the script runs.
const TOOLS = ["grep", "sed", "awk", "sort", "tr", "mktemp", "rm"];

function scratch(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "simplifying-ruby-code-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function realPath(tool) {
  const found = spawnSync(BASH, ["-c", `command -v ${tool}`], { encoding: "utf8" }).stdout.trim();
  assert.ok(found, `test host lacks ${tool}`);
  return found;
}

// A Ruby tree under `dir/app` built from { "relative/path": "contents" }.
function tree(dir, files) {
  const root = join(dir, "app");
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  return root;
}

// A PATH directory holding `tools` linked from the host, plus any `fakes`
// written as executables.
function fakeBin(dir, { tools = TOOLS, fakes = {} } = {}) {
  const bin = join(dir, "bin");
  mkdirSync(bin);
  for (const tool of tools) symlinkSync(realPath(tool), join(bin, tool));
  for (const [name, body] of Object.entries(fakes)) {
    writeFileSync(join(bin, name), `#!${BASH}\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  }
  return bin;
}

function run(t, args, { files = {}, tools, fakes } = {}) {
  const dir = scratch(t);
  const root = tree(dir, files);
  const bin = fakeBin(dir, { tools, fakes });
  const result = spawnSync(BASH, [SCRIPT, ...args.map((a) => (a === "ROOT" ? root : a))], {
    encoding: "utf8",
    env: { PATH: bin, TMPDIR: dir },
  });
  return result;
}

const lines = (stdout) => stdout.split("\n").filter(Boolean);

const APP = {
  "lib/acme_maps/point.rb": "module AcmeMaps\n  class Point\n  end\nend\n",
  "lib/acme_maps/shapes.rb": [
    'require "acme_maps/point"',
    "module AcmeMaps",
    "  def self.origin = Point.new(0, 0)",
    '  def self.load(type) = "AcmeMaps::#{type}".constantize',
    "  def self.cloud = PointCloud.new",
    "end",
    "",
  ].join("\n"),
  "spec/point_spec.rb":
    'require_relative "../lib/acme_maps/point.rb"\nRSpec.describe AcmeMaps::Point\n',
  "config/sidekiq.yml": ':schedule:\n  origin:\n    class: "AcmeMaps::Point"\n',
  "config/routes.rb": "Rails.application.routes.draw do\nend\n",
  "acme_maps.gemspec": "spec.summary = 'AcmeMaps::Point and friends'\n",
  "exe/acme": "Object.const_get(ARGV[0]).new\n",
  "log/development.log": "AcmeMaps::Point loaded\n",
  "tmp/cache.rb": "AcmeMaps::Point\n",
  "vendor/bundle/gem.rb": "AcmeMaps::Point\n",
  "node_modules/x.rb": "AcmeMaps::Point\n",
  ".git/HEAD": "AcmeMaps::Point\n",
};

test("find-callers.sh lists every kind of hit, sorted by kind, path, then line", (t) => {
  const result = run(t, ["AcmeMaps::Point", "ROOT"], { files: APP });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(lines(result.stdout), [
    "dynamic\texe/acme:1\tObject.const_get(ARGV[0]).new",
    'dynamic\tlib/acme_maps/shapes.rb:4\t  def self.load(type) = "AcmeMaps::#{type}".constantize',
    "reference\tacme_maps.gemspec:1\tspec.summary = 'AcmeMaps::Point and friends'",
    'reference\tconfig/sidekiq.yml:3\t    class: "AcmeMaps::Point"',
    "reference\tlib/acme_maps/point.rb:2\t  class Point",
    "reference\tlib/acme_maps/shapes.rb:3\t  def self.origin = Point.new(0, 0)",
    "reference\tspec/point_spec.rb:2\tRSpec.describe AcmeMaps::Point",
    'require\tlib/acme_maps/shapes.rb:1\trequire "acme_maps/point"',
    'require\tspec/point_spec.rb:1\trequire_relative "../lib/acme_maps/point.rb"',
  ]);
});

test("find-callers.sh sorts line numbers numerically and keeps tabs in the text", (t) => {
  const body = Array.from({ length: 10 }, (_, i) => (i === 1 || i === 9 ? "x\tPoint" : "")).join(
    "\n",
  );
  const result = run(t, ["Point", "ROOT"], { files: { "a.rb": body } });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(lines(result.stdout), [
    "reference\ta.rb:2\tx\tPoint",
    "reference\ta.rb:10\tx\tPoint",
  ]);
});

test("find-callers.sh searches only the full name when CONSTANT has no namespace", (t) => {
  const files = { "a.rb": "Point.new\nAcmeMaps::Point\nPointCloud\npoint\n" };
  const result = run(t, ["::Point", "ROOT"], { files });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(lines(result.stdout), [
    "reference\ta.rb:1\tPoint.new",
    "reference\ta.rb:2\tAcmeMaps::Point",
  ]);
});

test("find-callers.sh derives the snake_case file name for require hits", (t) => {
  const files = {
    "a.rb": [
      'require "acme/http_client"',
      "require('http_client')",
      'require "acme/http_client_spec"',
      'load "http_client.rb"',
      "",
    ].join("\n"),
  };
  const result = run(t, ["Acme::HTTPClient", "ROOT"], { files });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(lines(result.stdout), [
    'require\ta.rb:1\trequire "acme/http_client"',
    "require\ta.rb:2\trequire('http_client')",
  ]);
});

test("find-callers.sh searches the current directory when ROOT is omitted", (t) => {
  const dir = scratch(t);
  const root = tree(dir, { "a.rb": "Point.new\n" });
  const result = spawnSync(BASH, [SCRIPT, "Point"], {
    cwd: root,
    encoding: "utf8",
    env: { PATH: fakeBin(dir), TMPDIR: dir },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(lines(result.stdout), ["reference\ta.rb:1\tPoint.new"]);
});

test("find-callers.sh exits 1 with no output when nothing matches", (t) => {
  const result = run(t, ["Point", "ROOT"], {
    files: { "a.rb": "PointCloud.new\n", "log/x.log": "Point\n" },
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

test("find-callers.sh exits 2 on a wrong argument count", (t) => {
  for (const args of [[], ["Point", "ROOT", "extra"]]) {
    const result = run(t, args);
    assert.equal(result.status, 2, JSON.stringify(args));
    assert.match(result.stderr, /^usage: /);
  }
});

test("find-callers.sh exits 2 on a CONSTANT that is not a constant path", (t) => {
  for (const name of ["point", "Acme::", "Acme:Point", "Acme::point", "Po-int", "1Point", ""]) {
    const result = run(t, [name, "ROOT"]);
    assert.equal(result.status, 2, name);
    assert.match(result.stderr, /not a Ruby constant path/);
  }
});

test("find-callers.sh exits 2 when ROOT is not a directory", (t) => {
  const result = run(t, ["Point", "/nonexistent/simplifying-ruby-code"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /not a directory: \/nonexistent/);
});

test("find-callers.sh exits 3 naming a missing tool", (t) => {
  const result = run(t, ["Point", "ROOT"], { tools: TOOLS.filter((tool) => tool !== "grep") });
  assert.equal(result.status, 3);
  assert.match(result.stderr, /missing required tool: grep/);
});

test("find-callers.sh exits 4 when grep fails", (t) => {
  const result = run(t, ["Point", "ROOT"], {
    files: { "a.rb": "Point\n" },
    tools: TOOLS.filter((tool) => tool !== "grep"),
    fakes: { grep: "echo 'grep: boom' >&2\nexit 2" },
  });
  assert.equal(result.status, 4);
  assert.match(result.stderr, /^grep: boom\nerror: grep failed /);
  assert.equal(result.stdout, "");
});
