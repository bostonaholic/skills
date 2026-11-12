#!/usr/bin/env bash
set -euo pipefail

mkdir -p lib test docs
cat >lib/notifier.rb <<'EOF_1'
require_relative "mailer"

# Sends every user notification by email.
class Notifier
  def initialize(mailer: Mailer.new)
    @mailer = mailer
  end

  def deliver(user, subject, body)
    @mailer.send_mail(to: user.email, subject: subject, body: body)
  end
end
EOF_1

cat >lib/mailer.rb <<'EOF_2'
class Mailer
  def send_mail(to:, subject:, body:)
    puts "mail to #{to}: #{subject}\n#{body}"
  end
end
EOF_2

cat >lib/user.rb <<'EOF_3'
User = Struct.new(:name, :email, keyword_init: true)
EOF_3

cat >test/notifier_test.rb <<'EOF_4'
require "minitest/autorun"
require_relative "../lib/notifier"
require_relative "../lib/user"

class NotifierTest < Minitest::Test
  FakeMailer = Struct.new(:sent) do
    def send_mail(**mail) = sent.push(mail)
  end

  def test_deliver_mails_the_user
    mailer = FakeMailer.new([])
    Notifier.new(mailer: mailer).deliver(User.new(name: "Ada", email: "ada@example.com"), "Hi", "Body")
    assert_equal "ada@example.com", mailer.sent.first[:to]
  end
end
EOF_4

cat >docs/notifications.md <<'EOF_5'
# Notifications

Every notification is an email. `Notifier#deliver(user, subject, body)` mails
`user.email`. We chose email-only because every user has a verified address.
EOF_5
