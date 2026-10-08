#!/usr/bin/env bash
set -euo pipefail

mkdir -p lib/acme/slugs

cat >acme-slugs.gemspec <<'EOF_1'
require_relative "lib/acme/slugs/version"

Gem::Specification.new do |spec|
  spec.name = "acme-slugs"
  spec.version = Acme::Slugs::VERSION
  spec.authors = ["Acme Platform Team"]
  spec.summary = "URL slugs for Acme titles"
  spec.homepage = "https://github.acme.invalid/acme/slugs"
  spec.license = "MIT"
  spec.required_ruby_version = ">= 3.1"
  spec.files = Dir["lib/**/*.rb"]
end
EOF_1

cat >Gemfile <<'EOF_2'
source "https://gems.acme.invalid"

gemspec
EOF_2

cat >lib/acme/slugs.rb <<'EOF_3'
require_relative "slugs/version"
require_relative "slugs/slugger"

module Acme
  module Slugs
    def self.slugify(text)
      Slugger.new(text).call
    end
  end
end
EOF_3

cat >lib/acme/slugs/version.rb <<'EOF_4'
module Acme
  module Slugs
    VERSION = "0.4.1"
  end
end
EOF_4

cat >lib/acme/slugs/slugger.rb <<'EOF_5'
module Acme
  module Slugs
    class Slugger
      def initialize(text)
        @text = text
      end

      def call
        @text.downcase.strip.gsub(/[^a-z0-9]+/, "-").gsub(/\A-|-\z/, "")
      end
    end
  end
end
EOF_5

git init -q
git add -A
