#!/usr/bin/env bash
set -euo pipefail

mkdir -p config app/models app/controllers app/services test/services

cat >Gemfile <<'EOF_1'
source "https://gems.acme.invalid"

ruby "3.3.4"

gem "rails", "~> 7.1.3"
gem "pg", "~> 1.5"
gem "puma", ">= 5.0"
EOF_1

cat >config/routes.rb <<'EOF_2'
Rails.application.routes.draw do
  resources :users, only: %i[new create]
  root "users#new"
end
EOF_2

cat >app/models/application_record.rb <<'EOF_3'
class ApplicationRecord < ActiveRecord::Base
  primary_abstract_class
end
EOF_3

cat >app/models/user.rb <<'EOF_4'
class User < ApplicationRecord
  normalizes :email, with: ->(email) { email.strip.downcase }

  validates :name, presence: true
  validates :email, presence: true, uniqueness: true

  scope :recent, -> { order(created_at: :desc) }
end
EOF_4

cat >app/services/user_creator.rb <<'EOF_5'
class UserCreator
  def initialize(params)
    @params = params
  end

  def call
    User.create(name: @params[:name], email: @params[:email])
  end
end
EOF_5

cat >app/controllers/application_controller.rb <<'EOF_6'
class ApplicationController < ActionController::Base
end
EOF_6

cat >app/controllers/users_controller.rb <<'EOF_7'
class UsersController < ApplicationController
  def new
    @user = User.new
  end

  def create
    @user = UserCreator.new(user_params).call

    if @user.persisted?
      redirect_to root_path, notice: "Welcome, #{@user.name}!"
    else
      render :new, status: :unprocessable_entity
    end
  end

  private

  def user_params
    params.require(:user).permit(:name, :email)
  end
end
EOF_7

cat >test/services/user_creator_test.rb <<'EOF_8'
require "test_helper"

class UserCreatorTest < ActiveSupport::TestCase
  test "creates a user" do
    user = UserCreator.new(name: "Ada", email: "ada@acme.invalid").call

    assert user.persisted?
  end
end
EOF_8

git init -q
git add -A
