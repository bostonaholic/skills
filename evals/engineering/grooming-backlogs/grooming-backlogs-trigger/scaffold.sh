#!/usr/bin/env bash
set -euo pipefail

cat >AGENTS.md <<'EOF_1'
# acme/api

The pricing API service.

## Work tracking

All work is tracked on the GitHub project board
https://github.acme.invalid/orgs/acme/projects/5. Cards move Backlog, Ready,
In progress, In review, Done. Bugs wait in the Bugs column.
EOF_1

mkdir -p lib
cat >lib/cache.rb <<'EOF_2'
require "monitor"

class ResponseCache
  TTL_SECONDS = 300

  def initialize
    @entries = {}
    @lock = Monitor.new
  end

  def read(path)
    key = path.downcase
    @lock.synchronize do
      entry = @entries[key]
      return nil if entry.nil? || expired?(entry)
      entry[:body]
    end
  end

  def write(path, body)
    key = path.downcase
    @lock.synchronize { @entries[key] = { body: body, stored_at: now } }
  end

  private

  def expired?(entry)
    now - entry[:stored_at] > TTL_SECONDS
  end

  def now
    Process.clock_gettime(Process::CLOCK_MONOTONIC)
  end
end
EOF_2

git init -q
git remote add origin git@github.acme.invalid:acme/api.git
git add -A
