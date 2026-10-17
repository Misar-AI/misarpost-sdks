# frozen_string_literal: true

module MisarPost
  # MisarPost API client.
  #
  #   post = MisarPost::Client.new(ENV.fetch("MISARPOST_API_KEY"))
  #   post.posts.list(query: { "status" => "queued" })
  #
  # Every resource and method is generated from the API's own route tree
  # (sdks/manifest.json).
  class Client < Generated::Resources
    attr_reader :transport

    def initialize(api_key, base_url: DEFAULT_BASE_URL, max_retries: 3, timeout: 30, http: nil, sleeper: nil)
      @transport = Transport.new(api_key, base_url: base_url, max_retries: max_retries,
                                          timeout: timeout, http: http, sleeper: sleeper)
      super(@transport)
    end

    def base_url
      @transport.base_url
    end
  end
end
