#!/usr/bin/env bash
set -euo pipefail

mkdir -p lib
cat >lib/point.rb <<'EOF_1'
# frozen_string_literal: true

module AcmeMaps
  class Point
    attr_reader :x, :y

    def initialize(x, y)
      @x = x
      @y = y
    end

    def ==(other)
      other.is_a?(Point) && x == other.x && y == other.y
    end
    alias eql? ==

    def hash
      [x, y].hash
    end
  end
end
EOF_1

mkdir -p spec
cat >spec/point_spec.rb <<'EOF_2'
# frozen_string_literal: true

require_relative "../lib/point"

RSpec.describe AcmeMaps::Point do
  it "compares by value" do
    expect(described_class.new(1, 2)).to eq(described_class.new(1, 2))
  end

  it "works as a Hash key" do
    visits = { described_class.new(1, 2) => 3 }
    expect(visits[described_class.new(1, 2)]).to eq(3)
  end
end
EOF_2

cat >.ruby-version <<'EOF_3'
3.3.6
EOF_3

git init -q
git add -A
