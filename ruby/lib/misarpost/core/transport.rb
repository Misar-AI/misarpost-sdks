# frozen_string_literal: true

require "json"
require "net/http"
require "uri"
require "erb"

module MisarPost
  SDK_VERSION = "1.0.0"
  DEFAULT_BASE_URL = "https://api.misar.io/post"

  # Default HTTP adapter over Net::HTTP. Any object responding to
  # call(method, uri, headers, body, timeout) -> [status, headers_hash, body_string]
  # can replace it (tests inject a fake).
  class NetHttpAdapter
    def call(method, uri, headers, body, timeout)
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = uri.scheme == "https"
      http.open_timeout = timeout
      http.read_timeout = timeout
      klass = Net::HTTP.const_get(method.capitalize)
      request = klass.new(uri.request_uri, headers)
      request.body = body if body
      response = http.request(request)
      hdrs = {}
      response.each_header { |k, v| hdrs[k.downcase] = v }
      [response.code.to_i, hdrs, response.body.to_s]
    end
  end

  # HTTP transport the generated resource layer is written against. One
  # credential, one path in: the account API key (mpk_…) as a bearer token.
  class Transport
    RETRYABLE = [429, 500, 502, 503, 504].freeze

    attr_reader :base_url

    def initialize(api_key, base_url: DEFAULT_BASE_URL, max_retries: 3, timeout: 30, http: nil, sleeper: nil)
      if api_key.nil? || api_key.empty?
        raise ArgumentError, "A MisarPost API key is required. Create one at " \
                             "https://post.misar.io/dashboard/api-keys (it starts with mpk_)."
      end
      @api_key = api_key
      @base_url = base_url.sub(%r{/+\z}, "")
      @max_retries = [max_retries, 1].max
      @timeout = timeout
      @http = http || NetHttpAdapter.new
      @sleeper = sleeper || ->(seconds) { sleep(seconds) }
    end

    def self.enc(value)
      ERB::Util.url_encode(value.to_s)
    end

    # The JSON body of a call. Ruby 3 binds a brace-less trailing hash
    # (+update(id, "contentText" => "x")+) to keyword arguments, not to the
    # positional +body+, so every body method also takes +**fields+ and they
    # land here. Both spellings, and +update(id, contentText: "x")+, therefore
    # send the same body.
    def self.body(body, fields)
      return body if fields.empty?
      unless body.nil? || body.is_a?(Hash)
        raise ArgumentError, "pass the request body as one Hash or as keyword fields, not both"
      end

      (body || {}).transform_keys(&:to_s).merge(fields.transform_keys(&:to_s))
    end

    def request(method, path, query: nil, body: nil)
      uri = URI("#{@base_url}#{path}#{build_query(query)}")
      headers = {
        "Authorization" => "Bearer #{@api_key}",
        "Accept" => "application/json",
        "User-Agent" => "misarpost-ruby/#{SDK_VERSION}"
      }
      payload = nil
      unless body.nil?
        headers["Content-Type"] = "application/json"
        payload = JSON.generate(body)
      end

      attempt = 0
      loop do
        begin
          status, resp_headers, raw = @http.call(method, uri, headers, payload, @timeout)
        rescue StandardError => e
          raise if e.is_a?(MisarPost::Error)
          if attempt + 1 < @max_retries
            @sleeper.call(backoff(attempt, nil))
            attempt += 1
            next
          end
          raise NetworkError.new(e.message, e)
        end

        data = decode(raw)
        return normalize(data) if status >= 200 && status < 300

        # Plan refusals first, by code — never retried.
        if MisarPost.plan_limit_body?(data)
          message = data["error"] || (data["upgrade"] || {})["headline"] || "Plan limit exceeded"
          raise PlanLimitError.new(status, message, data, resp_headers)
        end

        if RETRYABLE.include?(status) && attempt + 1 < @max_retries
          @sleeper.call(backoff(attempt, resp_headers))
          attempt += 1
          next
        end

        body_hash = data.is_a?(Hash) ? data : {}
        message = body_hash["error"] || body_hash["message"] || (data.is_a?(String) && !data.empty? ? data : "HTTP #{status}")
        raise Error.new(status, message.to_s, (body_hash["code"] || "api_error").to_s, data)
      end
    end

    private

    def build_query(query)
      return "" if query.nil? || query.empty?
      pairs = []
      query.each do |k, v|
        next if v.nil?
        Array(v).each { |item| pairs << [k.to_s, item.to_s] }
      end
      pairs.empty? ? "" : "?#{URI.encode_www_form(pairs)}"
    end

    # Exponential backoff from 200 ms, honouring Retry-After (capped at 60 s).
    def backoff(attempt, headers)
      retry_after = headers && headers["retry-after"]
      return [retry_after.to_f, 60.0].min if retry_after.to_s =~ /\A\d+(\.\d+)?\z/
      0.2 * (2**attempt)
    end

    def decode(raw)
      return nil if raw.nil? || raw.empty?
      JSON.parse(raw)
    rescue JSON::ParserError
      raw
    end

    def normalize(data)
      return {} if data.nil?
      data.is_a?(Hash) ? data : { "data" => data }
    end
  end
end
