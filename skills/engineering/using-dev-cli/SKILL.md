---
name: using-dev-cli
description: Configures and runs the dev CLI, writing and troubleshooting dev.yml (up tasks, build, server, test, console, check, open, custom commands). Use when a project has or needs a dev.yml, or the user mentions dev up, dev test, dev check, dev reset, dev CLI setup, or dev.yml errors.
---

# dev CLI

`dev` provisions a project from its `dev.yml` and runs its server, tests,
linters, and custom commands through one interface.

## Requirements

Run `command -v dev && dev --version`. If `dev` is missing, ask the user how
they install it; do not install it yourself. The `ruby`, `node`, `mysql`,
`redis`, `postgresql`, and `yarn` tasks install missing Homebrew formulas
(rbenv, nodenv, services) with `brew install`; `claude` and `claude-code` are
macOS-only casks; `docker-compose` needs a running Docker. When the installed
`dev` disagrees with this skill, trust `dev help` and its error messages.

## Commands

| Command                        | Alias    | Effect                                                     |
| ------------------------------ | -------- | ---------------------------------------------------------- |
| `dev init`                     | `dev i`  | Generate `dev.yml` by shelling out to the `claude` CLI     |
| `dev up [TASK]`                | `dev u`  | Run every `up:` task, or only `TASK`                       |
| `dev build [NAME] [ARGS...]`   | `dev b`  | Run `build:`                                               |
| `dev server [NAME] [ARGS...]`  | `dev s`  | Run `server:`                                              |
| `dev test [NAME] [ARGS...]`    | `dev t`  | Run `test:`                                                |
| `dev check [NAME] [ARGS...]`   | `dev k`  | Run every `check:` entry (all run; failures reported last) |
| `dev console [NAME] [ARGS...]` | `dev c`  | Run `console:`                                             |
| `dev open [TARGET]`            | `dev o`  | List `open:` links, or open one; `github` is built in      |
| `dev reset`                    | `dev r`  | Delete local dev state and dependencies                    |
| `dev --version`                | `dev -v` | Print the version                                          |

- `NAME` selects a subcommand or a single `check:` entry (`dev test e2e`,
  `dev check rubocop`, `dev up bundler`); extra `ARGS` are appended to the
  command.
- `build`, `server`, `test`, `console`, and custom commands refuse to run until
  `dev up` has created `.dev/`.
- `DEBUG=1 dev up` prints debug logging to stderr. Exit code 1 is an expected
  error (bad config, failed command); 2 is a bug in `dev`.

### dev reset is destructive

`dev reset` runs each custom task's `reset:` command (in reverse `up:` order),
then deletes `.dev/`, `vendor/bundle/`, `.bundle/`, `node_modules/`, and Docker
volumes labelled `dev.project=<project directory>`. It does not re-provision.
Show the user what it will remove, including any `reset:` commands in
`dev.yml`, and run it only after they confirm. Run `dev up` afterward.

## Set up a project

Do not run `dev init` from an agent session: it launches a nested `claude`
process and refuses to overwrite an existing `dev.yml`. Write the file from
the schema below instead.

Copy this checklist and check off each step:

```text
- [ ] 1. Confirm `dev --version` works (see Requirements)
- [ ] 2. Detect the stack: Gemfile, package.json, yarn.lock, package-lock.json, bun.lock or bun.lockb, .ruby-version, .node-version, compose.yml or docker-compose.yml, bin/rails, config/database.yml
- [ ] 3. Write dev.yml, starting from the closest example config
- [ ] 4. Parse it: ruby -ryaml -e 'YAML.load_file("dev.yml")'
- [ ] 5. Add `.dev/` to .gitignore if it is missing
- [ ] 6. Run `dev up`; fix the failing task, rerun `dev up <task>`, repeat until `dev up` passes
- [ ] 7. Run `dev test` and `dev check`; fix the config (not the project) when a command is misconfigured
```

Read [example configurations](references/example-configs.md) at step 3 when
writing a new `dev.yml` for a Rails, Node, Bun, full-stack, or monorepo
project. Read each linked file from this skill's directory when the step that
uses it begins. If a read fails, stop that step and report the exact path.

## dev.yml schema

`dev.yml` lives at the project root; `dev` finds it by walking up from the
working directory.

| Key        | Type                      | Used by                    |
| ---------- | ------------------------- | -------------------------- |
| `name`     | String                    | Output and help headings   |
| `up`       | Array of tasks            | `dev up`                   |
| `build`    | Runnable                  | `dev build`                |
| `server`   | Runnable                  | `dev server`               |
| `test`     | Runnable                  | `dev test`                 |
| `console`  | Runnable                  | `dev console`              |
| `check`    | Flat Hash[String, String] | `dev check` (linters only) |
| `open`     | Flat Hash[String, URL]    | `dev open`                 |
| `commands` | Hash[String, Runnable]    | `dev <name>`               |

Any other top-level key is silently ignored, so a top-level `deploy:` does
nothing.

### Runnables

A runnable is a string, or a hash with these keys (others are silently
ignored):

```yaml
test:
  build_first: true # run `build:` first; requires a build: key; list it first
  run: "bun run test:unit" # required in the hash form
  env:
    NODE_ENV: test # $VAR and ${VAR} expand from the current environment
  desc: "Run unit tests"
  subcommands:
    watch: "bun run test" # dev test watch
    e2e: "bun run test:e2e" # dev test e2e
```

Subcommands must sit under `subcommands:`; a bare key beside `run:` is ignored
and `dev test e2e` would append `e2e` to the base command. Subcommands take the
string or hash form but do not nest further. To declare that a project has no
server, test, or console command, leave the key out; an empty or partial hash
is an error.

### Custom commands

Every project command that is not a setup step, linter, or URL goes under
`commands:` and runs as `dev <name>`:

```yaml
commands:
  seed: "bin/rails db:seed"
  deploy:
    run: "scripts/deploy.sh production"
    desc: "Deploy to production"
    subcommands:
      staging: "scripts/deploy.sh staging" # dev deploy staging
```

Setup steps go in `up:`, linters in `check:`, URLs in `open:`. A command named
after a built-in command or alias (`server`, `s`) is shadowed by the built-in.

### up tasks

Tasks run in the order listed. Each entry is a bare name or a one-key hash;
unknown names and multi-key hashes are errors.

| Task             | Arguments                                  | Effect                                                                                     |
| ---------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `ruby`           | version, else `.ruby-version`              | `rbenv install`                                                                            |
| `node`           | version, else `.node-version`              | `nodenv install`                                                                           |
| `bundler`        | none                                       | `bundle install` into `vendor/bundle`                                                      |
| `yarn`           | none                                       | `yarn install`                                                                             |
| `npm`            | none                                       | `npm install`                                                                              |
| `bun`            | none                                       | `bun install`                                                                              |
| `env`            | none                                       | Copy missing `.env*` files from the main worktree, then from `.env*.example`; no overwrite |
| `mysql`          | none                                       | `brew services start mysql`                                                                |
| `redis`          | none                                       | `brew services start redis`                                                                |
| `postgresql`     | none                                       | `brew services start postgresql`                                                           |
| `docker-compose` | none                                       | `docker compose up -d --wait`                                                              |
| `claude`         | none                                       | Install the Claude desktop app cask (macOS)                                                |
| `claude-code`    | none                                       | Install the Claude Code cask (macOS)                                                       |
| `database`       | `bootstrap`, `migrate` (optional)          | Bare: `bin/rails db:prepare`. With args: `migrate`, falling back to `bootstrap`            |
| `custom`         | `name`, `met?`, `meet` (required), `reset` | Shell-based idempotent task                                                                |

A custom task runs `met?`; on a nonzero exit it runs `meet`, then `met?` again
and fails if it still fails. `reset` is an idempotent undo that `dev reset`
runs, for state outside the project directory such as a local database:

```yaml
up:
  - custom:
      name: "create database"
      met?: "psql -lqt | cut -d '|' -f 1 | grep -qw myapp_dev"
      meet: "createdb myapp_dev"
      reset: "dropdb --if-exists myapp_dev"
```

## Troubleshooting

- A command uses the wrong Ruby or Node: `dev` sets `RBENV_VERSION`,
  `NODENV_VERSION`, shims-first `PATH`, and `BUNDLE_PATH=vendor/bundle` from
  `up:` or the version files. Check the `ruby`/`node` entries and version files
  before changing the command.
- A subcommand runs the base command: it is a bare key; move it under
  `subcommands:`.
- A key seems to do nothing: it is an unknown top-level or runnable key, which
  `dev` ignores.
