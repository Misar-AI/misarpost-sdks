# frozen_string_literal: true

Gem::Specification.new do |spec|
  spec.name = "misarpost"
  spec.version = "1.0.0"
  spec.authors = ["Misar.AI"]
  spec.email = ["hello@misar.io"]
  spec.summary = "MisarPost social publishing API client for Ruby."
  spec.description = "Schedule and publish posts across every connected channel, generate and repurpose " \
                     "content with AI, research trends, run PersonaForge and read analytics — every MisarPost " \
                     "API endpoint, with retries and plan-limit upgrade offers. Standard library only."
  spec.homepage = "https://www.misarpost.com"
  spec.license = "MIT"
  spec.required_ruby_version = ">= 2.6"
  spec.metadata = {
    "homepage_uri" => "https://www.misarpost.com",
    "documentation_uri" => "https://docs.misar.io/post",
    "source_code_uri" => "https://github.com/Misar-AI/misarpost-sdks/tree/main/ruby",
    "changelog_uri" => "https://github.com/Misar-AI/misarpost-sdks/blob/main/ruby/CHANGELOG.md",
    "bug_tracker_uri" => "https://github.com/Misar-AI/misarpost-sdks/issues",
    "rubygems_mfa_required" => "true"
  }
  spec.files = Dir["lib/**/*.rb"] + %w[README.md LICENSE CHANGELOG.md]
  spec.require_paths = ["lib"]
  spec.add_development_dependency "rspec", "~> 3.12"
end
