# frozen_string_literal: true

require "openssl"

module MisarPost
  # Outbound webhook deliveries carry X-MisarPost-Signature: sha256=<hex> — the
  # HMAC-SHA256 of the RAW request body keyed with the endpoint's mpwh_ secret.
  WEBHOOK_SIGNATURE_HEADER = "X-MisarPost-Signature"

  def self.compute_webhook_signature(secret, raw_body)
    "sha256=" + OpenSSL::HMAC.hexdigest("SHA256", secret, raw_body)
  end

  def self.verify_webhook_signature(secret, raw_body, signature_header)
    return false if secret.nil? || secret.empty? || signature_header.nil?
    expected = compute_webhook_signature(secret, raw_body)
    given = signature_header.strip.downcase
    return false unless expected.bytesize == given.bytesize
    diff = 0
    expected.bytes.zip(given.bytes) { |a, b| diff |= a ^ b }
    diff.zero?
  end
end
