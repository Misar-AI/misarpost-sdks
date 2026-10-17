# frozen_string_literal: true

module MisarPost
  # Any non-2xx answer from the MisarPost API.
  class Error < StandardError
    attr_reader :status, :code, :body

    def initialize(status, message, code = "api_error", body = nil)
      @status = status
      @code = code
      @body = body
      super("misarpost: API error #{status} (#{code}): #{message}")
    end

    # The key was rejected outright: missing, revoked, expired, or another product's.
    def unauthorized?
      status == 401
    end

    # The key is valid but lacks the scope this endpoint requires.
    def forbidden?
      status == 403
    end

    def retryable?
      status == 429 || (status >= 500 && status < 600)
    end
  end

  class NetworkError < Error
    attr_reader :cause_error

    def initialize(message, cause_error = nil)
      @cause_error = cause_error
      super(0, message, "network_error")
    end
  end

  # The plan behind the API key blocks this call: HTTP 402 with
  # code "plan_limit_exceeded" and an upgrade offer. Never retried.
  class PlanLimitError < Error
    attr_reader :offer, :plan, :upgrade_url, :retry_after, :feature

    def initialize(status, message, body = nil, headers = {})
      h = (headers || {}).each_with_object({}) { |(k, v), acc| acc[k.to_s.downcase] = v }
      data = body.is_a?(Hash) ? body : {}
      @offer = data["upgrade"].is_a?(Hash) ? data["upgrade"] : nil
      offer = @offer || {}
      @plan = h["x-misar-plan"] || (offer["current_plan"] || {})["slug"]
      @upgrade_url = h["x-misar-upgrade-url"] || (offer["urls"] || {})["pricing"]
      retry_after = h["retry-after"].to_s
      @retry_after = retry_after =~ /\A\d+\z/ ? retry_after.to_i : nil
      @feature = offer["feature"]
      super(status, message, "plan_limit_exceeded", body)
    end
  end

  # True when an error body carries the API's plan-refusal marker.
  def self.plan_limit_body?(data)
    data.is_a?(Hash) && (data["code"] == "plan_limit_exceeded" || data["upgrade"].is_a?(Hash))
  end
end
