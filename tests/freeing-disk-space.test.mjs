// Fails when measure-caches.sh stops exiting 64 on an argument, 69 on a missing tool, or 1
// when df or du prints no size or the platform is unknown; changes its volume line's
// default target (the larger of 20 GB or 10% of the volume) or shortfall; lists a
// location that does not exist or belongs to the other platform; or stops sorting rows
// largest first. Also fails when list-pinned-versions.sh stops exiting 64 on a bad
// argument or 69 on a missing tool, or changes which version files it reads, how deep
// it looks, how it skips comments, or how it counts pins.
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

const SCRIPTS = resolve("skills/engineering/freeing-disk-space/scripts");
const MEASURE = join(SCRIPTS, "measure-caches.sh");
const PINNED = join(SCRIPTS, "list-pinned-versions.sh");
const BASH = spawnSync("bash", ["-c", "command -v bash"], { encoding: "utf8" }).stdout.trim();
const GB = 1e9;

function scratch(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "freeing-disk-space-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function realPath(tool) {
  const found = spawnSync(BASH, ["-c", `command -v ${tool}`], { encoding: "utf8" }).stdout.trim();
  assert.ok(found, `test host lacks ${tool}`);
  return found;
}

function writeExecutable(path, body) {
  writeFileSync(path, `#!${BASH}\n${body}`);
  chmodSync(path, 0o755);
}

// A PATH directory holding `tools` linked from the host, plus a fake `df` that prints
// `dfLine` under a header, and a fake `du` that reports a directory's size from its
// `.kib` file (4 KiB without one), exits 1 after printing when `.partial` exists, and
// prints nothing when `.empty` exists.
function measureBin(dir, { tools = ["awk", "sort", "uname"], dfLine, fakeDu = true } = {}) {
  const bin = join(dir, "bin");
  mkdirSync(bin);
  for (const tool of tools) symlinkSync(realPath(tool), join(bin, tool));
  writeExecutable(
    join(bin, "df"),
    `echo 'Filesystem 1024-blocks Used Available Capacity Mounted on'\n${dfLine ? `echo '${dfLine}'` : ""}\n`,
  );
  if (fakeDu) {
    writeExecutable(
      join(bin, "du"),
      `p=\${@: -1}
[ -e "$p/.empty" ] && exit 1
kib=4; [ -e "$p/.kib" ] && kib=$(<"$p/.kib")
printf '%s\\t%s\\n' "$kib" "$p"
[ -e "$p/.partial" ] && exit 1
exit 0\n`,
    );
  }
  return bin;
}

// Create HOME/rel as a directory that the fake du sizes at `kib`.
function cache(home, rel, kib, marker) {
  const path = join(home, rel);
  mkdirSync(path, { recursive: true });
  if (kib !== undefined) writeFileSync(join(path, ".kib"), String(kib));
  if (marker) writeFileSync(join(path, marker), "");
  return path;
}

// 1 TB volume, 600 GB used, 400 GB free, in KiB.
const BIG_DF = "/dev/disk3s5 976562500 585937500 390625000 60% /System/Volumes/Data";

function measure(t, { args = [], os = "Darwin", setup = () => {}, ...bin } = {}) {
  const dir = scratch(t);
  const home = join(dir, "home");
  mkdirSync(home);
  setup(home);
  const result = spawnSync(BASH, [MEASURE, ...args], {
    encoding: "utf8",
    env: {
      PATH: measureBin(dir, { dfLine: BIG_DF, ...bin }),
      HOME: home,
      USER: "acme",
      MEASURE_CACHES_OS: os,
    },
  });
  const [volume, ...rows] = result.stdout.split("\n").filter(Boolean);
  return { result, home, volume: volume?.split("\t"), rows: rows.map((row) => row.split("\t")) };
}

test("measure-caches.sh exits 64 when given an argument", (t) => {
  const { result } = measure(t, { args: ["--target-gb", "30"] });
  assert.equal(result.status, 64);
  assert.match(result.stderr, /usage: .*takes no arguments/);
  assert.equal(result.stdout, "");
});

test("measure-caches.sh exits 69 naming a missing du", (t) => {
  const { result } = measure(t, { fakeDu: false });
  assert.equal(result.status, 69);
  assert.match(result.stderr, /missing required tool: du/);
});

test("measure-caches.sh exits 1 when df prints no size", (t) => {
  const { result } = measure(t, { dfLine: "" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /df printed no size for the volume holding .*home/);
  assert.equal(result.stdout, "");
});

test("measure-caches.sh exits 1 on a platform other than Darwin or Linux", (t) => {
  const { result } = measure(t, { os: "FreeBSD" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unsupported platform: FreeBSD/);
});

test("measure-caches.sh targets 10% of a large volume and reports no shortfall above it", (t) => {
  const { result, volume } = measure(t);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(volume, [
    "/System/Volumes/Data",
    String(976562500 * 1024),
    String(585937500 * 1024),
    String(390625000 * 1024),
    String((976562500 * 1024) / 10),
    "0",
  ]);
});

test("measure-caches.sh targets 20 GB on a small volume, keeps a spaced mount, and reports the shortfall", (t) => {
  // 100 GB volume with 5 GB free: 10% is 10 GB, under the 20 GB floor.
  const { result, volume } = measure(t, {
    dfLine: "/dev/sda1 97656250 92773438 4882812 95% /mnt/data disk",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(volume, [
    "/mnt/data disk",
    String(97656250 * 1024),
    String(92773438 * 1024),
    String(4882812 * 1024),
    String(20 * GB),
    String(20 * GB - 4882812 * 1024),
  ]);
});

test("measure-caches.sh lists only existing macOS locations, largest first, ties by path", (t) => {
  const { result, home, rows } = measure(t, {
    setup: (home) => {
      cache(home, "Library/Developer/Xcode/DerivedData", 300);
      cache(home, ".npm/_cacache", 500);
      cache(home, ".Trash", 100);
      cache(home, ".cargo/registry/src", 100);
      cache(home, "Library/Developer/Xcode/iOS DeviceSupport", 200);
      cache(home, ".cache/JetBrains", 900); // a Linux location, ignored on macOS
      cache(home, "Library/Caches/Unknown", 900); // not a known location
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(rows, [
    [join(home, ".npm/_cacache"), "512000", "regenerates", "npm", "npm cache clean --force", "-"],
    [
      join(home, "Library/Developer/Xcode/DerivedData"),
      "307200",
      "regenerates",
      "Xcode",
      "rm -rf ~/Library/Developer/Xcode/DerivedData/*",
      "Xcode",
    ],
    [
      join(home, "Library/Developer/Xcode/iOS DeviceSupport"),
      "204800",
      "regenerates",
      "Xcode, when a device on that OS version connects",
      'rm -rf ~/Library/Developer/Xcode/"iOS DeviceSupport"/<version>, for each version no device runs',
      "Xcode",
    ],
    [join(home, ".Trash"), "102400", "keep", "-", "-", "-"],
    [
      join(home, ".cargo/registry/src"),
      "102400",
      "regenerates",
      "Cargo",
      "rm -rf ~/.cargo/registry/src",
      "-",
    ],
  ]);
});

test("measure-caches.sh lists Linux locations, with Bazel under the user's name, and no macOS ones", (t) => {
  const { result, home, rows } = measure(t, {
    os: "Linux",
    setup: (home) => {
      cache(home, ".cache/bazel/_bazel_acme", 50);
      cache(home, ".cache/bazel/_bazel_other", 60);
      cache(home, ".gradle/caches", 40);
      cache(home, "Library/Caches/Homebrew", 900); // a macOS location, ignored on Linux
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    rows.map(([path, bytes, cls, , , closeFirst]) => [path, bytes, cls, closeFirst]),
    [
      [join(home, ".cache/bazel/_bazel_acme"), "51200", "rebuildable", "-"],
      [join(home, ".gradle/caches"), "40960", "regenerates", "the Gradle daemon (gradle --stop)"],
    ],
  );
});

test("measure-caches.sh keeps a partial du total with a warning", (t) => {
  const { result, home, rows } = measure(t, {
    setup: (home) => cache(home, "Library/Logs", 10, ".partial"),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stderr,
    /du could not read all of .*Library\/Logs; its size is a lower bound/,
  );
  assert.deepEqual(rows[0].slice(0, 3), [join(home, "Library/Logs"), "10240", "regenerates"]);
});

test("measure-caches.sh exits 1 naming a location du printed no size for", (t) => {
  const { result } = measure(t, {
    setup: (home) => cache(home, ".gradle/daemon", undefined, ".empty"),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /du printed no size for .*\.gradle\/daemon/);
});

function pinned(t, args, { tools = ["awk", "find", "sort", "uniq"] } = {}) {
  const dir = scratch(t);
  const bin = join(dir, "bin");
  mkdirSync(bin);
  for (const tool of tools) symlinkSync(realPath(tool), join(bin, tool));
  return spawnSync(BASH, [PINNED, ...args], { encoding: "utf8", env: { PATH: bin } });
}

function workspace(t, files) {
  const root = join(scratch(t), "code");
  mkdirSync(root);
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), body);
  }
  return root;
}

test("list-pinned-versions.sh exits 64 without exactly one directory argument", (t) => {
  const file = join(scratch(t), "file");
  writeFileSync(file, "");
  for (const [args, reason] of [
    [[], /usage: .* WORKSPACE/],
    [["a", "b"], /usage: .* WORKSPACE/],
    [[file], /not a directory: /],
  ]) {
    const result = pinned(t, args);
    assert.equal(result.status, 64, JSON.stringify(args));
    assert.match(result.stderr, reason);
  }
});

test("list-pinned-versions.sh exits 69 naming a missing uniq", (t) => {
  const result = pinned(t, [scratch(t)], { tools: ["awk", "find", "sort"] });
  assert.equal(result.status, 69);
  assert.match(result.stderr, /missing required tool: uniq/);
});

test("list-pinned-versions.sh prints nothing for a workspace with no version files", (t) => {
  const result = pinned(t, [workspace(t, { "app/README.md": "ruby 3.1\n" })]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
});

test("list-pinned-versions.sh counts each pinned version across every version file it reads", (t) => {
  const root = workspace(t, {
    ".ruby-version": "3.3.0\n",
    "web/.ruby-version": "  3.3.0\r\n",
    "web/.nvmrc": "# LTS\nlts/iron\n",
    "acme/api/.node-version": "20.11.1\n",
    "acme/api/.tool-versions": "ruby 3.2.2\nnodejs 20.11.1 18.19.0 # fallback\n\n",
    "acme/api/.python-version": "3.12.1\n3.11.7\n",
    "acme/cli/rust-toolchain.toml": '[toolchain]\nchannel = "1.79.0"\ncomponents = ["clippy"]\n',
    "old/rust-toolchain": "nightly-2024-01-01\n",
    "empty/.ruby-version": "\n",
    "a/b/c/.ruby-version": "2.7.8\n", // four levels down, past the limit
  });
  const result = pinned(t, [root]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    result.stdout,
    [
      "node\t20.11.1\t1",
      "node\tlts/iron\t1",
      "nodejs\t18.19.0\t1",
      "nodejs\t20.11.1\t1",
      "python\t3.11.7\t1",
      "python\t3.12.1\t1",
      "ruby\t3.2.2\t1",
      "ruby\t3.3.0\t2",
      "rust\t1.79.0\t1",
      "rust\tnightly-2024-01-01\t1",
      "",
    ].join("\n"),
  );
});
