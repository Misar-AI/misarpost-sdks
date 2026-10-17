# frozen_string_literal: true

require "json"
require_relative "../lib/misarpost"

class FakeHttp
  attr_reader :calls

  def initialize(responses)
    @responses = responses
    @calls = []
  end

  def call(method, uri, headers, body, _timeout)
    @calls << { method: method, uri: uri, headers: headers, body: body }
    status, payload, hdrs = @responses.length > 1 ? @responses.shift : @responses.first
    [status, hdrs || {}, payload.nil? ? "" : JSON.generate(payload)]
  end
end

OFFER = {
  "product" => "post", "reason" => "quota_exhausted", "feature" => "ai_text_actions",
  "headline" => "You've reached your Free plan's ai text actions limit.", "current_plan" => { "slug" => "free" },
  "urls" => { "pricing" => "https://post.misar.io/pricing" }, "cta" => "Upgrade to continue.", "plans" => []
}.freeze

def client(responses)
  http = FakeHttp.new(responses)
  [MisarPost::Client.new("mpk_test", http: http, sleeper: ->(_s) {}), http]
end

RSpec.describe MisarPost::Client do
  it "requires an API key" do
    expect { MisarPost::Client.new("") }.to raise_error(ArgumentError, /API key is required/)
  end

  it "sends the key as a bearer token to the canonical base URL" do
    post, http = client([[200, { "posts" => [] }]])
    post.posts.list(query: { "status" => "queued", "page" => 2 })
    call = http.calls.first
    expect(call[:uri].to_s).to eq("https://api.misar.io/post/posts?status=queued&page=2")
    expect(call[:headers]["Authorization"]).to eq("Bearer mpk_test")
    expect(call[:method]).to eq("GET")
  end

  it "encodes path params and sends JSON bodies" do
    post, http = client([[200, { "post" => {} }]])
    post.posts.update("a/b", "contentText" => "hi")
    call = http.calls.first
    expect(call[:uri].path).to eq("/post/posts/a%2Fb")
    expect(call[:method]).to eq("PATCH")
    expect(JSON.parse(call[:body])).to eq("contentText" => "hi")
  end

  # Ruby 3 binds a brace-less trailing hash to keywords rather than to the
  # positional body. The README's own examples are written brace-less, so all
  # these spellings must send the same JSON body, with query: still separate.
  it "sends the same body however the hash is spelled" do
    post, http = client(Array.new(4) { [200, { "post" => {} }] })
    post.posts.update("p1", "contentText" => "hi", "status" => "draft")
    post.posts.update("p1", { "contentText" => "hi", "status" => "draft" })
    post.posts.update("p1", contentText: "hi", status: "draft")
    post.posts.update("p1", "contentText" => "hi", "status" => "draft", query: { "dry" => "1" })
    bodies = http.calls.map { |c| JSON.parse(c[:body]) }
    expect(bodies.uniq).to eq([{ "contentText" => "hi", "status" => "draft" }])
    expect(http.calls.last[:uri].query).to eq("dry=1")
  end

  it "passes required query params positionally" do
    post, http = client([[200, { "ok" => true }]])
    post.workspaces.remove_member("ws1", "m1")
    expect(http.calls.first[:uri].query).to eq("memberId=m1")
  end

  it "retries throttles and 5xx, then succeeds" do
    post, http = client([[503, { "error" => "busy" }], [429, { "error" => "slow" }, { "retry-after" => "0" }], [200, { "ok" => true }]])
    expect(post.analytics.stats).to eq("ok" => true)
    expect(http.calls.length).to eq(3)
  end

  it "raises PlanLimitError with the offer and never retries it" do
    post, http = client([[402, { "error" => "limit", "code" => "plan_limit_exceeded", "upgrade" => OFFER },
                          { "retry-after" => "3600", "x-misar-plan" => "free" }]])
    expect { post.generate.enhance("content" => "x") }.to raise_error(MisarPost::PlanLimitError) { |e|
      expect(e.feature).to eq("ai_text_actions")
      expect(e.plan).to eq("free")
      expect(e.upgrade_url).to eq("https://post.misar.io/pricing")
      expect(e.retry_after).to eq(3600)
    }
    expect(http.calls.length).to eq(1)
  end

  it "detects a plan refusal by code even on a 429" do
    post, http = client([[429, { "error" => "quota", "code" => "plan_limit_exceeded", "upgrade" => OFFER }]])
    expect { post.generate.create("prompt" => "x") }.to raise_error(MisarPost::PlanLimitError)
    expect(http.calls.length).to eq(1)
  end

  it "surfaces scope refusals with the server code" do
    post, = client([[403, { "error" => "lacks scope", "code" => "insufficient_scope" }]])
    expect { post.webhooks.list_outbound }.to raise_error(MisarPost::Error) { |e|
      expect(e.status).to eq(403)
      expect(e.code).to eq("insufficient_scope")
    }
  end

  it "wraps non-object JSON" do
    post, = client([[200, [1, 2]]])
    expect(post.post_tags.list).to eq("data" => [1, 2])
  end
end

RSpec.describe "MisarPost.paginate" do
  it "walks pages until totalPages" do
    pages = MisarPost.paginate { |n| { "posts" => [n], "page" => n, "totalPages" => 3 } }.map { |p| p["page"] }
    expect(pages).to eq([1, 2, 3])
  end
end

RSpec.describe "webhook signatures" do
  it "verifies X-MisarPost-Signature" do
    sig = MisarPost.compute_webhook_signature("mpwh_secret", '{"event":"post.published"}')
    expect(sig).to match(/\Asha256=[0-9a-f]{64}\z/)
    expect(MisarPost.verify_webhook_signature("mpwh_secret", '{"event":"post.published"}', sig)).to be true
    expect(MisarPost.verify_webhook_signature("mpwh_secret", '{"event":"tampered"}', sig)).to be false
  end
end
