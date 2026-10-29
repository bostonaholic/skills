#!/usr/bin/env bash
set -euo pipefail

mkdir -p lib
cat >lib/cache.rb <<'EOF_1'
require "monitor"

class ResponseCache
  # Matches the pricing API's signature rotation interval: an entry older than
  # one rotation carries a signature that downstream verification rejects.
  TTL_SECONDS = 300

  def initialize
    @entries = {}
    @lock = Monitor.new
  end

  def read(path)
    # FIXME: normalize_key should drop the trailing slash; strip it here until it does.
    key = normalize_key(path).chomp("/")
    @lock.synchronize do
      entry = @entries[key]
      return nil if entry.nil? || expired?(entry)
      # Return the cached body.
      entry[:body]
    end
  end

  def write(path, body)
    key = normalize_key(path).chomp("/")
    @lock.synchronize { @entries[key] = { body: body, stored_at: now } }
  end

  private

  def normalize_key(path)
    path.downcase
  end

  def expired?(entry)
    now - entry[:stored_at] > TTL_SECONDS
  end

  # Monotonic, because NTP steps the wall clock on the cache hosts, and a
  # backward step would keep entries alive past their TTL.
  def now
    Process.clock_gettime(Process::CLOCK_MONOTONIC)
  end
end
EOF_1

git init -q
git add -A
