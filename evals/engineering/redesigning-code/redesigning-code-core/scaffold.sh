#!/usr/bin/env bash
set -euo pipefail

mkdir -p lib/importer test
cat >lib/importer.rb <<'EOF_1'
require "csv"
require_relative "importer/dedup_strategy"
require_relative "importer/row_dedup_cache"

class Importer
  Result = Struct.new(:customers, :errors)

  MAX_ATTEMPTS = 3

  def initialize(path, strategy: DedupStrategy::LastWins.new, cache: RowDedupCache.new(capacity: 1_000))
    @path = path
    @strategy = strategy
    @cache = cache
  end

  def call
    with_retries { import }
  end

  private

  def import
    errors = []
    CSV.foreach(@path, headers: true, encoding: "bom|utf-8").with_index(2) do |row, line|
      email = row["email"].to_s
      if email.strip.empty?
        errors.push("line #{line}: blank email")
        next
      end
      key = @strategy.key_for(email)
      previous = @cache.fetch(key)
      @cache.store(key, @strategy.choose(previous, row.to_h))
    end
    Result.new(@cache.values, errors)
  end

  def with_retries
    attempts = 0
    begin
      attempts += 1
      yield
    rescue Errno::EIO
      retry if attempts < MAX_ATTEMPTS
      raise
    end
  end
end
EOF_1

cat >lib/importer/dedup_strategy.rb <<'EOF_2'
class Importer
  module DedupStrategy
    class Base
      def key_for(email)
        email.strip.downcase
      end

      def choose(_previous, _current)
        raise NotImplementedError
      end
    end

    class LastWins < Base
      def choose(_previous, current)
        current
      end
    end

    class FirstWins < Base
      def choose(previous, current)
        previous || current
      end
    end
  end
end
EOF_2

cat >lib/importer/row_dedup_cache.rb <<'EOF_3'
class Importer
  class RowDedupCache
    def initialize(capacity:)
      @capacity = capacity
      @entries = {}
    end

    def fetch(key)
      return nil unless @entries.key?(key)

      @entries[key] = @entries.delete(key)
    end

    def store(key, value)
      @entries.delete(key)
      @entries[key] = value
      @entries.shift while @entries.size > @capacity
    end

    def values
      @entries.values
    end
  end
end
EOF_3

cat >test/importer_test.rb <<'EOF_4'
require "minitest/autorun"
require "tempfile"
require_relative "../lib/importer"

class ImporterTest < Minitest::Test
  def import(csv)
    file = Tempfile.new(["customers", ".csv"])
    file.write(csv)
    file.close
    Importer.new(file.path).call
  ensure
    file&.unlink
  end

  def test_last_row_wins_for_an_email_that_differs_in_case_and_spaces
    result = import("email,name\nann@acme.invalid,Ann\n ANN@acme.invalid ,Ann B\n")
    assert_equal ["Ann B"], result.customers.map { |c| c["name"] }
  end

  def test_blank_email_is_rejected_with_its_line_number
    result = import("email,name\n,Nobody\nbo@acme.invalid,Bo\n")
    assert_equal ["line 2: blank email"], result.errors
  end

  def test_reads_a_file_that_starts_with_a_byte_order_mark
    result = import("﻿email,name\ncy@acme.invalid,Cy\n")
    assert_equal ["Cy"], result.customers.map { |c| c["name"] }
  end
end
EOF_4

git init -q
git add lib/importer.rb test/importer_test.rb
