# Example dev.yml configurations

Start from the closest stack, then adjust versions, services, and commands to
what the project actually contains.

## Contents

- Ruby on Rails
- Node.js or TypeScript with Yarn
- Bun
- Full-stack Ruby and Node
- Monorepo with subcommands

## Ruby on Rails

```yaml
name: my-rails-app

up:
  - ruby
  - bundler
  - mysql
  - redis
  - env
  - database

server: "bin/rails server"
test: "bin/rails test"
console: "bin/rails console"

check:
  rubocop: "bundle exec rubocop"

open:
  app: "http://127.0.0.1:3000"
```

## Node.js or TypeScript with Yarn

```yaml
name: my-node-app

up:
  - node: "22.0.0"
  - yarn

build: "yarn build"
server: "yarn dev"
test: "yarn test"

check:
  eslint: "yarn eslint ."
  tsc: "yarn tsc --noEmit"
```

## Bun

```yaml
name: my-bun-app

up:
  - node: "22.0.0"
  - bun

build: "bun run build"
server: "bun run dev"
test: "bun run test"

check:
  lint: "bun run lint"
  typecheck: "bun run typecheck"
```

## Full-stack Ruby and Node

```yaml
name: my-fullstack-app

up:
  - ruby
  - node
  - bundler
  - yarn
  - mysql
  - redis
  - database

server:
  run: "bin/dev"
  desc: "Foreman (Rails + Vite)"

test:
  run: "bin/rails test"
  subcommands:
    e2e: "yarn cypress run" # dev test e2e

console: "bin/rails console"

check:
  rubocop: "bundle exec rubocop"
  eslint: "yarn eslint ."

open:
  app: "http://127.0.0.1:3000"

commands:
  deploy: "scripts/deploy.sh"
  seed: "bin/rails db:seed"
  migrate:
    run: "bin/rails db:migrate"
    subcommands:
      rollback: "bin/rails db:rollback" # dev migrate rollback
      status: "bin/rails db:migrate:status" # dev migrate status
```

## Monorepo with subcommands

```yaml
name: my-monorepo

up:
  - node: "22.0.0"
  - bun

build:
  run: "bun run build"
  subcommands:
    web: "bun run build:web"
    api: "bun run build:api"

server:
  run: "bun run dev"
  subcommands:
    web: "bun run dev:web"
    api: "bun run dev:api"
    docs: "bun run dev:docs"

test:
  run: "bun run test"
  env:
    NODE_ENV: test
  subcommands:
    unit: "bun run test:unit"
    integration: "bun run test:integration"
    e2e: "bun run test:e2e"

check:
  lint: "bun run lint"
  typecheck: "bun run typecheck"
  format: "bun run format:check"

open:
  app: "http://127.0.0.1:3000"
  api: "http://127.0.0.1:4000"
  docs: "http://127.0.0.1:3001"
```
