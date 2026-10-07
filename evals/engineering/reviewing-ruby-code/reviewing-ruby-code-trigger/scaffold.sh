#!/usr/bin/env bash
set -euo pipefail

mkdir -p lib/acme_http test/acme_http

cat >acme_http.gemspec <<'EOF_1'
# frozen_string_literal: true

require_relative "lib/acme_http/version"

Gem::Specification.new do |spec|
  spec.name = "acme_http"
  spec.version = AcmeHttp::VERSION
  spec.authors = ["Acme Platform Team"]
  spec.summary = "A small HTTP client for Acme services"
  spec.homepage = "https://github.acme.invalid/acme/acme_http"
  spec.license = "MIT"
  spec.required_ruby_version = ">= 3.2"
  spec.files = Dir["lib/**/*.rb", "README.md"]
end
EOF_1

cat >README.md <<'EOF_2'
# acme_http

A small HTTP client for Acme services.

## Usage

```ruby
client = AcmeHttp::Client.new(base_url: "https://api.acme.invalid", token: ENV.fetch("ACME_TOKEN"))
client.get("/v1/orders", query: { status: "open" })
```

Build a request yourself and send it with your own transport:

```ruby
request = AcmeHttp::RequestBuilder.new
  .verb(:get)
  .url("https://api.acme.invalid/v1/orders")
  .header("Accept", "application/json")
  .build
request.full_url
```
EOF_2

cat >lib/acme_http.rb <<'EOF_3'
# frozen_string_literal: true

require "acme_http/version"
require "acme_http/request"
require "acme_http/request_builder"
require "acme_http/client"

module AcmeHttp
  class Error < StandardError; end
end
EOF_3

cat >lib/acme_http/version.rb <<'EOF_4'
# frozen_string_literal: true

module AcmeHttp
  VERSION = "1.4.2"
end
EOF_4

cat >lib/acme_http/request.rb <<'EOF_5'
# frozen_string_literal: true

require "uri"

module AcmeHttp
  class Request
    attr_reader :verb, :url, :headers, :query, :body

    def initialize(verb:, url:, headers: {}, query: {}, body: nil)
      @verb = verb
      @url = url
      @headers = headers
      @query = query
      @body = body
    end

    def full_url
      return url if query.empty?

      "#{url}?#{URI.encode_www_form(query)}"
    end
  end
end
EOF_5

cat >lib/acme_http/request_builder.rb <<'EOF_6'
# frozen_string_literal: true

module AcmeHttp
  class RequestBuilder
    def initialize
      @verb = :get
      @headers = {}
      @query = {}
      @body = nil
    end

    def verb(value)
      @verb = value
      self
    end

    def url(value)
      @url = value
      self
    end

    def header(name, value)
      @headers[name] = value
      self
    end

    def query(name, value)
      @query[name] = value
      self
    end

    def body(value)
      @body = value
      self
    end

    def build
      Request.new(verb: @verb, url: @url, headers: @headers, query: @query, body: @body)
    end
  end
end
EOF_6

cat >lib/acme_http/client.rb <<'EOF_7'
# frozen_string_literal: true

require "net/http"

module AcmeHttp
  class Client
    VERBS = { get: Net::HTTP::Get, post: Net::HTTP::Post }.freeze

    def initialize(base_url:, token:)
      @base_url = base_url
      @token = token
    end

    def get(path, query: {})
      builder = RequestBuilder.new.verb(:get).url(@base_url + path)
      builder.header("Authorization", "Bearer #{@token}")
      query.each { |name, value| builder.query(name, value) }
      perform(builder.build)
    end

    def post(path, body:)
      request = RequestBuilder.new
        .verb(:post)
        .url(@base_url + path)
        .header("Authorization", "Bearer #{@token}")
        .header("Content-Type", "application/json")
        .body(body)
        .build
      perform(request)
    end

    private

    def perform(request)
      uri = URI(request.full_url)
      http_request = VERBS.fetch(request.verb).new(uri)
      request.headers.each { |name, value| http_request[name] = value }
      http_request.body = request.body if request.body
      Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https") do |http|
        http.request(http_request)
      end
    end
  end
end
EOF_7

cat >test/acme_http/request_builder_test.rb <<'EOF_8'
# frozen_string_literal: true

require "minitest/autorun"
require "acme_http"

class RequestBuilderTest < Minitest::Test
  def test_build_collects_headers_and_query
    request = AcmeHttp::RequestBuilder.new
      .verb(:get)
      .url("https://api.acme.invalid/v1/orders")
      .header("Accept", "application/json")
      .query("status", "open")
      .build

    assert_equal :get, request.verb
    assert_equal({ "Accept" => "application/json" }, request.headers)
    assert_equal "https://api.acme.invalid/v1/orders?status=open", request.full_url
  end
end
EOF_8

git init -q
git add -A
